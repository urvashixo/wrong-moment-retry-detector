# Wrong Moment Retry Detector — Project Spec

**Track:** 03 — AI Revenue Recovery
**One-liner:** Instead of retrying failed recurring payments on a fixed schedule, predict each customer's personal highest-probability payment window from their own transaction history, and retry there — recovering revenue through timing, not discounting.

---

## 1. The Problem

Recurring payments (subscriptions, UPI Autopay mandates, EMIs) fail constantly — and the overwhelming majority of failures are due to **insufficient balance at the moment of debit**, not fraud or broken cards. The industry-standard fix is a **uniform retry schedule**: retry in 24h, then 3 days, then 7 days — identical for every customer, regardless of who they are or when their money actually shows up.

But liquidity is personal and patterned:
- A salaried customer's account is flush for ~4–5 days after payday, then drains.
- A gig worker might have irregular but still-patterned inflows (e.g., every Tuesday/Friday).
- Some customers reliably have funds mid-morning before daily UPI spending kicks in, but not by evening.

Retrying on a generic schedule wastes limited retry attempts (some rails like NACH suspend a mandate after N failures), generates unnecessary failure notifications that erode customer trust, and leaves recoverable revenue on the table — not because the customer doesn't want to pay, but because the merchant asked at the wrong moment.

**What we're building:** a system that learns each customer's personal "liquidity window" from their own successful-payment history and schedules retries at their predicted best moment — recovering revenue with zero added discount cost.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend / API | Python (FastAPI) or Node (Express) | Fast to build, good for webhook receivers |
| Database | Supabase (Postgres) | Managed, fast to set up, has cron/edge functions if needed |
| Payments | Razorpay Test Mode APIs (Subscriptions, Orders, Payments, Webhooks) | Track requirement — source of truth for payment events |
| Deterministic model | Python — `pandas` / `numpy` for histogram + clustering; optionally `scikit-learn` (KDE) | Keep this fully explainable, no black box |
| LLM (explanation layer only) | **Groq API** (e.g. `llama-3.1-8b-instant` or similar small/fast model) | Cheap, fast, free-tier — used ONLY for turning structured decisions into plain-language explanations |
| Frontend | React + Tailwind (or plain HTML/JS if time-constrained) | Dashboard to show retry decisions, confidence, and audit trail live |
| Scheduling | Simple cron / Supabase Edge Function / APScheduler | To simulate "wait until predicted time, then retry" |
| Hosting | Vercel/Render (frontend+backend), Supabase (DB) | Fast free-tier deploys for demo day |

---

## 3. Input Data Required

### 3.1 Per-customer payment history (core signal)
For each customer, you need a time-series of **payment attempts**, each with:

```
customer_id
transaction_id
amount
status            // "success" | "failed"
failure_reason    // e.g. "insufficient_funds", "card_declined", "timeout" (only if failed)
attempted_at       // full timestamp (date + time, not just date)
payment_method     // UPI / card / netbanking (patterns can differ by method)
mandate_id         // if recurring/subscription-linked
```

Since real historical data won't exist in test mode, **you will generate synthetic history** that mimics realistic patterns:
- Give each synthetic customer a "hidden" liquidity profile (e.g., "flush days 1–5 of month", "flush every Friday", "flush after 6pm on weekdays") that you use to *generate* their fake successful-payment timestamps.
- Inject noise (some randomness) so the model has to actually detect a pattern, not just read it back.
- Include a few "cold start" customers with only 1–2 data points to test your fallback logic.

### 3.2 Live failure event (trigger)
When a payment fails, you need (via Razorpay webhook `payment.failed` / `subscription.charged` failure):
```
customer_id
mandate_id / subscription_id
amount
failure_reason
failed_at
retry_attempt_number   // how many retries already used
max_retries_allowed    // rail-specific cap (e.g., NACH allows limited retries)
```

---

## 4. Deterministic Model (the core, non-LLM logic)

**Goal:** given a customer's success-timestamp history, output a ranked set of candidate retry windows with confidence scores. This must be fully explainable — no black-box ML here, since it's a money-moving decision.

### Recommended approach (in order of increasing sophistication — pick based on time available):

**Level 1 — Histogram / frequency clustering (do this first, it's enough to demo):**
- Bucket successful payments by **day-of-month** (1–31) and separately by **day-of-week** and **hour-of-day**.
- Build a weighted histogram per customer per dimension.
- The retry recommendation = the bucket(s) with highest historical success density, converted into an actual future timestamp.
- Confidence score = (count of successes in top bucket) / (total successes), adjusted downward if total history is thin.

**Level 2 — Weighted recency model (nice upgrade if time allows):**
- Weight recent payments more heavily than old ones (customer income patterns can shift — e.g., new job, new salary date).
- Simple exponential decay weighting on top of the histogram.

**Level 3 — Kernel Density Estimation (KDE) (stretch goal, good "AI judgment" story since it's still deterministic statistics, not ML/LLM):**
- Use `scipy.stats.gaussian_kde` on day-of-month or hour-of-day to get a smooth probability density instead of discrete buckets — lets you say "peak probability at day 3.2 of month" and generate an actual next-retry timestamp with a real probability estimate attached.

### Cold-start fallback rule (mandatory — this is your rubric "failure recovery" moment):
```
IF customer has < N successful payments (e.g., N = 3):
    → do NOT trust personal pattern
    → fall back to a sensible default (e.g., industry standard: retry in 3 days,
      or "most common successful hour across ALL customers" as a population-level prior)
    → flag confidence as "low / insufficient history" in the output and audit log
```

### Output of this stage:
```json
{
  "customer_id": "cust_123",
  "recommended_retry_at": "2026-09-03T10:15:00+05:30",
  "confidence": 0.81,
  "basis": "day_of_month_cluster",
  "data_points_used": 8,
  "fallback_used": false
}
```

---

## 5. What to Pass to the LLM (Groq)

**Critical rule: the LLM never decides *when* to retry. It only explains a decision that the deterministic model already made.** This is your strongest "AI judgment" talking point — say this explicitly in your pitch.

### Two LLM call types:

**A. Merchant-facing audit explanation** (for the dashboard / audit trail):
```
Prompt input:
- customer_id (or anonymized ref)
- recommended_retry_at
- confidence score
- basis (which pattern was detected)
- number of data points used
- fallback_used flag

Ask the LLM to produce: a 1–2 sentence plain-English explanation of WHY this
retry time was chosen, suitable for a merchant support agent to read.
```
Example output: *"Retrying on Sept 3 at 10:15 AM — this customer's last 8 successful payments cluster strongly around the 2nd–4th of the month, giving high confidence (81%)."*

**B. Customer-facing message** (optional, nice touch):
```
Prompt input: same structured decision object (never raw financial history,
for privacy — pass only the decision, not the full transaction list)

Ask the LLM to produce: a short, non-alarming customer notification.
```
Example output: *"Heads up — we'll automatically retry your payment on Friday, which tends to work better for your account."*

### Guardrails on the LLM call:
- Never let the LLM see or output raw amounts if not needed, or full transaction history — pass it the *already-computed* structured decision, not raw data, to keep prompts small, fast (Groq's speed advantage), and privacy-conscious.
- Validate LLM output length/format before displaying (truncate, strip anything that looks like it invented a new retry time — the LLM must not be allowed to override the number).
- If Groq API call fails or times out → fall back to a hardcoded template string (`"Retry scheduled for {time} based on your payment history."`). **Show this fallback happening live in your demo** — it's a second, very cheap failure-recovery moment.

---

## 6. Output Data

### 6.1 Retry decision record (written to DB, this is your core audit trail)
```json
{
  "decision_id": "uuid",
  "customer_id": "cust_123",
  "mandate_id": "mandate_456",
  "original_failure_at": "2026-08-31T09:00:00+05:30",
  "failure_reason": "insufficient_funds",
  "retry_attempt_number": 1,
  "max_retries_allowed": 4,
  "model_basis": "day_of_month_cluster",
  "data_points_used": 8,
  "confidence": 0.81,
  "fallback_used": false,
  "recommended_retry_at": "2026-09-03T10:15:00+05:30",
  "llm_explanation": "Retrying on Sept 3 at 10:15 AM — this customer's last 8 successful payments cluster strongly around the 2nd–4th of the month.",
  "llm_call_succeeded": true,
  "actual_retry_outcome": null,      // filled in after retry executes: "success"|"failed"|"pending"
  "created_at": "2026-08-31T09:00:05+05:30"
}
```

### 6.2 Aggregate metrics (for your demo's "measured money recovered" claim)
```json
{
  "batch_id": "demo_batch_1",
  "total_failed_payments": 50,
  "retried_with_smart_timing": 50,
  "recovered_count": 34,
  "recovered_amount_total": 128400,
  "baseline_fixed_schedule_recovered_count": 21,   // simulate the naive approach on same data for comparison
  "baseline_fixed_schedule_recovered_amount": 79800,
  "improvement_pct": 61.9,
  "cold_start_fallback_count": 6
}
```
**This baseline-vs-smart comparison on the same synthetic batch is your single most important demo artifact.** Judges explicitly want "measured money recovered" — showing it against a naive baseline, not in isolation, makes the number credible instead of arbitrary.

---

## 7. Extra Features (stand-out additions, pick 1–2 if time allows — don't try all of these)

1. **Live dashboard with a "naive vs smart" side-by-side simulation** — run both retry strategies on the same synthetic failure batch and show the recovery-rate gap update in real time as you feed in more failures. This is your single best demo moment.
2. **Payment-method-aware patterns** — detect that a customer's UPI Autopay tends to succeed at different times than their card payments, and adjust per payment method, not just per customer.
3. **Retry-quota awareness** — factor in `max_retries_allowed` (e.g., NACH's limited attempts) so the model doesn't "waste" a scarce retry on a mediocre-confidence window when it could wait slightly longer for a higher-confidence one — a small optimization layer that's a nice "we thought about the real rail constraints" flex.
4. **Explainability toggle in the UI** — a button next to every retry decision: "Why this time?" → shows the actual histogram/chart for that customer, not just the LLM sentence. Visually proves you're not hiding behind an LLM's word.
5. **Confidence-based routing** — if confidence is very low even with data (a genuinely erratic customer), explicitly route to a human-reviewed or standard-schedule path instead of forcing a "smart" guess — shows judgment about the model's own limits.
6. **Groq latency/failure injection button in the demo** — a literal button that simulates the Groq API timing out, so you can show the fallback template kicking in live, on command, without hoping a real API hiccup happens during your pitch.

---

## 8. Project Structure

```
wrong-moment-retry-detector/
├── backend/
│   ├── main.py                      # FastAPI app entrypoint
│   ├── webhooks/
│   │   └── razorpay_webhook.py      # receives payment.failed, subscription.charged events
│   ├── models/
│   │   ├── pattern_detector.py      # deterministic histogram/KDE logic (Level 1-3)
│   │   └── fallback.py              # cold-start / low-confidence fallback rules
│   ├── llm/
│   │   ├── groq_client.py           # Groq API wrapper
│   │   ├── prompts.py               # prompt templates (merchant + customer explanations)
│   │   └── explanation_fallback.py  # hardcoded template if Groq call fails
│   ├── data/
│   │   └── synthetic_generator.py   # generates fake customer histories with hidden patterns
│   ├── db/
│   │   ├── supabase_client.py
│   │   └── schema.sql               # see Section 10
│   ├── scheduler/
│   │   └── retry_executor.py        # simulates "wait until predicted time, fire retry"
│   └── tests/
│       └── test_pattern_detector.py # unit tests on synthetic data, including cold-start case
├── frontend/
│   ├── src/
│   │   ├── Dashboard.jsx            # main audit trail + metrics view
│   │   ├── CustomerDetail.jsx       # per-customer histogram visualization
│   │   └── SimulationControls.jsx   # buttons: inject failure, inject Groq failure, run batch
│   └── ...
├── docs/
│   ├── spec.md                      # this file
│   └── demo_script.md               # exact sequence of actions for the live demo
└── README.md
```

---

## 9. Boundaries & Rules

1. **The deterministic model decides WHEN to retry. Period.** The LLM is never in the decision path — only in the explanation path. If you find yourself asking the LLM "should we retry now," stop — that's a rubric violation waiting to happen.
2. **No discounting, no incentive changes.** This project's entire value proposition is "recovery via timing alone." Do not let scope creep pull in "offer 10% off on retry" — that's a different (weaker, less unique) project.
3. **Respect retry-count caps.** Never schedule a retry that would exceed `max_retries_allowed`. If the predicted best window falls after the last allowed attempt, fall back to the last-available slot and flag it.
4. **All decisions must be logged before execution, not after.** The audit record (Section 6.1) must be written at decision time, not reconstructed after the fact — this is what "audit trail" means to a judge, not a post-hoc summary.
5. **Every confidence score must be honestly computed from actual data volume**, not hardcoded or fudged for the demo. If a synthetic customer has thin data, their confidence score must genuinely reflect that.
6. **Groq calls are best-effort only.** The system must fully function (produce a valid retry decision) even if the LLM call fails entirely — the LLM is a presentation layer, not a dependency.
7. **PII minimalism.** Don't pass raw amounts/full transaction dumps to the LLM. Pass only the structured decision object.

---

## 10. Out of Scope

- ❌ Building a real payment gateway integration beyond Razorpay **test mode** — no real money movement.
- ❌ Cross-merchant data sharing or any attempt to see a customer's transactions with *other* merchants — out of scope and would raise real data-access/compliance questions.
- ❌ Discount/incentive-based recovery tactics — explicitly a different approach, don't blend it in.
- ❌ Fraud detection or risk scoring of the customer — this project assumes the customer is legitimate and simply mistimed; do not conflate with Track 02.
- ❌ A general-purpose ML training pipeline / model persistence across sessions — keep the pattern detection recomputed fresh per decision (simpler, more explainable, avoids "stale model" bugs mid-hackathon).
- ❌ Building your own webhook-retry infrastructure for Razorpay's webhooks themselves (i.e., don't over-engineer webhook reliability — use Razorpay's own retry/redelivery mechanism and note that you're relying on it).
- ❌ Real SMS/email delivery integration — mock the "customer notification" step in the UI rather than integrating Twilio/SendGrid unless you have significant spare time.
- ❌ Multi-currency support — assume INR only.

---

## 11. Design & Coding Rules

1. **Every money-relevant function must be unit-testable in isolation** — `pattern_detector.py` should take a list of timestamps and return a decision object with zero dependency on the DB, webhook layer, or LLM. This lets you demo it standalone if something else breaks live.
2. **Fail loud in logs, fail soft in UI.** Any error (Groq timeout, malformed webhook payload, missing customer data) should be fully logged server-side with a stack trace, but the user/demo-facing UI should show a graceful, specific message — never a raw stack trace on screen.
3. **No magic numbers without a named constant.** `MIN_DATA_POINTS_FOR_CONFIDENCE = 3`, `CONFIDENCE_LOW_THRESHOLD = 0.4`, etc. — defined once, referenced everywhere, easy to point to when a judge asks "why 3?"
4. **Every API response includes a `basis` and `confidence` field** — never return a bare timestamp with no explanation of how it was derived. This is your explainability spine.
5. **Keep the synthetic data generator separate from the detection logic**, and never let the generator's "hidden pattern" leak into the detector's code path — the detector must only ever see the same messy timestamp data a judge could hand it, to prove it's not cheating by knowing the answer in advance.
6. **Version your prompts.** Keep `prompts.py` as named, versioned template strings (not inline f-strings scattered through the codebase) so you can quickly tweak tone without hunting through logic files.
7. **Timestamps: store and reason in UTC internally, display in IST.** Avoid timezone bugs — a classic hackathon-day landmine when demoing something timing-sensitive.
8. **Commit early, commit often, tag a "demo-stable" commit** the night before/morning of presentation so you always have a known-good fallback if last-minute changes break something.

---

## 12. Supabase Database Schema

```sql
-- Customers (can be minimal; mostly a reference table)
create table customers (
    customer_id text primary key,
    created_at timestamptz default now(),
    hidden_profile_tag text  -- ONLY for synthetic data generation/testing, remove/ignore in "real" mode
);

-- Raw payment events (both successes and failures — this is your core history table)
create table payment_events (
    id uuid primary key default gen_random_uuid(),
    customer_id text references customers(customer_id),
    mandate_id text,
    transaction_id text,
    amount numeric not null,
    status text check (status in ('success', 'failed')) not null,
    failure_reason text,
    payment_method text,
    attempted_at timestamptz not null,
    created_at timestamptz default now()
);
create index idx_payment_events_customer on payment_events(customer_id);
create index idx_payment_events_status on payment_events(status);

-- Retry decisions (the core audit trail — Section 6.1)
create table retry_decisions (
    decision_id uuid primary key default gen_random_uuid(),
    customer_id text references customers(customer_id),
    mandate_id text,
    original_failure_event_id uuid references payment_events(id),
    retry_attempt_number int not null,
    max_retries_allowed int not null,
    model_basis text not null,           -- e.g. 'day_of_month_cluster', 'fallback_default'
    data_points_used int not null,
    confidence numeric not null,
    fallback_used boolean default false,
    recommended_retry_at timestamptz not null,
    llm_explanation text,
    llm_call_succeeded boolean,
    actual_retry_outcome text check (actual_retry_outcome in ('success','failed','pending')) default 'pending',
    actual_retry_executed_at timestamptz,
    created_at timestamptz default now()
);
create index idx_retry_decisions_customer on retry_decisions(customer_id);

-- Batch-level aggregate metrics (for your demo dashboard — Section 6.2)
create table demo_batches (
    batch_id uuid primary key default gen_random_uuid(),
    label text,
    total_failed_payments int,
    retried_with_smart_timing int,
    recovered_count int,
    recovered_amount_total numeric,
    baseline_fixed_schedule_recovered_count int,
    baseline_fixed_schedule_recovered_amount numeric,
    improvement_pct numeric,
    cold_start_fallback_count int,
    created_at timestamptz default now()
);

-- Webhook event log (raw dump for debugging/audit, optional but useful)
create table webhook_log (
    id uuid primary key default gen_random_uuid(),
    event_type text,
    raw_payload jsonb,
    processed boolean default false,
    received_at timestamptz default now()
);
```

**Notes on schema choices:**
- `hidden_profile_tag` on `customers` exists purely so *you* can generate consistent synthetic data and later verify your model actually recovered the pattern — strip or ignore this field in anything framed as "production."
- `retry_decisions` is deliberately denormalized (duplicates some info like `mandate_id`) to keep it a self-contained audit record — a judge should be able to read one row and understand the entire decision without joining five tables.
- `webhook_log` is cheap insurance — if a live webhook demo misbehaves, you have a raw record to show what was actually received, which itself is a nice "we built for debuggability" point.

---

## 13. Suggested Build Order (36–48hr hackathon pacing)

1. **Hour 0–4:** Synthetic data generator + Supabase schema live. Get fake customers with hidden patterns into the DB.
2. **Hour 4–10:** Deterministic pattern detector (Level 1 histogram) working and unit-tested against synthetic data — verify it actually recovers the hidden pattern you injected.
3. **Hour 10–14:** Cold-start fallback logic + confidence scoring.
4. **Hour 14–18:** Razorpay test-mode webhook integration — real `payment.failed` events triggering your detector.
5. **Hour 18–22:** Groq LLM explanation layer + fallback-on-failure handling.
6. **Hour 22–30:** Dashboard: audit trail view, naive-vs-smart comparison, per-customer histogram visualization.
7. **Hour 30–34:** Baseline simulation (run naive fixed-schedule retry logic on the same synthetic batch) to generate your comparison metrics.
8. **Hour 34–38:** Polish, demo script, and rehearse the two live failure-injection moments (cold start + Groq API failure).
9. **Buffer:** whatever's left — do not build new features in the last few hours; only fix and rehearse.

---

*This spec is a living document — update it as you make real decisions during the build, and keep it in the repo so judges asking "why did you build it this way" have somewhere to point.*
