# Feature Addendum Spec — Wrong Moment Retry Detector

This extends the original project spec with six features. Read this alongside the original spec — it doesn't repeat the base architecture, only what's new or changed.

---

## Feature 1 — Per-Customer Profile Page

### Problem it solves
Right now, model reasoning is buried inside a decisions feed row. Judges (and real merchant ops teams) need one screen per customer that answers "why does the system believe what it believes about this person" without cross-referencing multiple views.

### What it shows
- **Header:** customer_id, mandate_id, total payment history count, current status (active / cold-start / erratic-low-confidence).
- **Full payment history timeline:** every `payment_events` row for this customer, success and failed, plotted on a single timeline — not a table. Failed events are visually distinct (using the heat-scale `--heat-1`).
- **The histogram(s) actually used by the model:** day-of-month, day-of-week, hour-of-day — whichever the model's `model_basis` field says it used for this customer's most recent decision, rendered as the real chart, not a mocked one.
- **Current recommendation, if any pending retry exists:** predicted retry time, confidence, basis — pulled live from `retry_decisions`, not recomputed for display.
- **Decision history for this customer:** every past `retry_decisions` row, so you can see if confidence has been rising/falling over time as more data accumulates.
- **Override history for this customer** (once Feature 3 exists): shown inline here too, not just in the global diff view — this is the natural place a merchant ops person would look for "did we ever override this customer's timing, and why."

### API surface needed
```
GET /api/customers/{customer_id}/profile
```
Returns: customer meta, full payment_events list, the histogram bucket data (precomputed server-side, not recalculated in the frontend), latest decision, decision history, override history.

### Design note
Reuse the exact histogram component from the dashboard's Screen 2 (per your frontend spec) — same chart, same meaning, just scoped to one customer. Don't build a second chart implementation for this.

---

## Feature 2 — LLM Explanation of the Deterministic Reasoning (as an explicit, callable feature)

### What changes vs. the original spec
Originally the LLM explanation was baked into the decision pipeline automatically. Making it a first-class *feature* means:
1. **A visible "Explain this" trigger** on both the decisions feed and the customer profile page — not just an auto-generated sentence sitting there, but something a judge can click to watch happen live (great for a demo: click → see the Groq call fire → see the explanation appear).
2. **Show the raw structured input that was sent to the LLM**, expandable next to the explanation — this is your single best "AI judgment" visual: judges can literally see that the LLM received `{confidence: 0.81, basis: "day_of_month_cluster", data_points: 8}` and NOT the raw transaction history or amounts. This proves your privacy/boundary rule instead of just claiming it in a pitch.
3. **Regenerate button** — calling the LLM again on demand (with a fresh phrasing) to prove it's a real live call and not a cached/canned string. Cheap to build, strong live-demo value.

### API surface needed
```
POST /api/decisions/{decision_id}/explain
Body: {} (uses existing decision data server-side)
Returns: { explanation: string, llm_call_succeeded: bool, prompt_payload_shown: {...} }
```

### Guardrail (unchanged from base spec, just re-emphasized)
This endpoint must be read-only with respect to the decision — it can never modify `recommended_retry_at`, only generate text about it. Enforce this in code (the endpoint literally has no write access to that field), not just by convention.

---

## Feature 3 — Human Override of Retry Time

### Problem it solves
Right now the system is fully autonomous. This feature puts a human in the loop with real authority to override — which is the single clearest "bounded and gated" and "chose not to use AI" demonstration you can show a judge.

### Behavior
- On any pending decision (decisions feed row or customer profile), an "Override" action opens a small form: new retry datetime + a required reason (free text, short).
- On submit:
  - `retry_decisions.recommended_retry_at` is **not overwritten** — instead, insert a new row/record capturing the override (see schema below). The original algorithmic recommendation must remain intact and queryable forever — this is critical for Feature 5 (diff view) and for auditability generally.
  - The *effective* retry time used by the scheduler becomes the override's value, but the system always knows both numbers.
- Overrides require a reason string — enforce a minimum length (e.g. 10 characters) so it can't be a meaningless "ok". This is a small but real design choice that signals you thought about audit quality, not just the mechanism.
- Show a clear visual state change: a decision with an active override is tagged `[ overridden ]` everywhere it appears (feed, profile, diff view) — never silently swapped.

### What NOT to allow (scope boundary)
- No overriding a decision after its retry has already executed (`actual_retry_outcome != 'pending'`) — overrides only apply to pending, not-yet-executed decisions.
- No bulk overrides in v1 — one decision at a time, to keep the audit trail unambiguous about who overrode what and why.

---

## Feature 4 — Retry-Quota Guardrail with Escalation Flag

### Problem it solves
Independent of human override, this is the system *itself* recognizing it shouldn't confidently act — a second, automatic "gating" moment.

### Rule
```
IF retry_attempt_number == max_retries_allowed
   AND confidence < CONFIDENCE_ESCALATION_THRESHOLD (e.g. 0.5):
        → do NOT auto-schedule this retry
        → set status = 'needs_human_review'
        → surface prominently in a dedicated "Needs Review" queue on the dashboard
```
This must fire *before* a retry decision is written as a normal recommendation — it's a pre-check, not a post-hoc flag.

### Dashboard surface
A small, separate "Needs Review" section/tab — distinct from the main decisions feed, since these are explicitly the cases the algorithm declined to resolve on its own. This section should be easy to find; burying it defeats the point of building it.

### Why this is a genuinely separate feature from Feature 3
Feature 3 is "a human chose to override a decision the system was willing to make." Feature 4 is "the system itself declined to make a decision at all." Keep the two visually distinct in the UI (`[ overridden ]` vs `[ needs review ]` tags) — conflating them muddies your strongest rubric-relevant story.

---

## Feature 5 — Diff View for Overrides

### What it shows
A dedicated screen listing every overridden decision, side by side:
```
customer_id | algorithm recommended        | human chose                  | reason given        | outcome
cust_014    | Sep 03, 10:15 (conf 0.81)     | Sep 05, 09:00                 | "known bank holiday" | pending
```
Plus simple aggregate stats at the top of this screen:
- Total overrides vs. total decisions (override rate)
- Of overridden decisions with a resolved outcome, how often did the human's chosen time actually succeed vs. the algorithm's original recommendation would have (you can compute this counterfactually only if you also simulate what would've happened at the algorithm's original time — for synthetic data this is doable; for real Razorpay test-mode data you may only get the actual outcome of whichever time was actually used — be honest about this limitation in your pitch rather than fudging a comparison you can't really support).

### Why this is worth building
This screen is the artifact that "argues for itself" in front of a judge — it's not you claiming the system is trustworthy, it's a table that lets a skeptical judge see exactly where humans agreed or disagreed with the model and why, in the model's and the human's own words.

---

## Feature 6 — A/B Split (Real-Time, Not Backtested)

### What changes vs. the original "naive vs smart" comparison
The original spec's baseline comparison ran the naive strategy *retroactively* on the same historical batch — useful, but a skeptical judge can call it a backtest. This feature makes it a live, randomized split as failures come in.

### Behavior
- On each new failure event, deterministically assign it to group `A` (naive fixed-schedule) or group `B` (smart personal-window) — e.g., hash `customer_id + failure_event_id` to get a stable, reproducible 50/50 split (stable so the same failure always lands in the same group if reprocessed, which matters for debugging and honesty).
- Both groups' decisions get written to `retry_decisions` as normal, with a new `experiment_group` field so you can query and report on them separately at any time.
- Group A's "decision" is intentionally dumb: always retry in a fixed N days, no model, no confidence, no LLM explanation — this is your true baseline, computed by the *simplest possible* code path, not a strawman.
- Dashboard gets a live-updating comparison panel: recovered count/amount for A vs. B, updating as more failures are processed — reusing the same visual component as the original landing-page "naive vs smart" chart (per your frontend spec), just now wired to `experiment_group` instead of a one-off simulation.

### Why this matters for your pitch specifically
"We ran a randomized 50/50 split on live failures and B recovered X% more than A" is a materially stronger claim than "we simulated what naive would have done," and it costs you almost nothing extra to build since you already have both code paths (Level 1 histogram model + a trivial fixed-schedule fallback) — you're just formalizing the split instead of running it as an afterthought.

---

## Build Order for These Six (suggested)

1. **Feature 4 (quota guardrail)** — smallest, purely deterministic, no new UI screens beyond a filtered view of existing data.
2. **Feature 6 (A/B split)** — mostly a data-tagging change plus reusing an existing chart component.
3. **Feature 1 (customer profile page)** — biggest UI lift, but no new backend logic, just aggregation of existing data.
4. **Feature 2 (LLM explanation as explicit feature)** — small backend change (new endpoint) + moderate UI (expandable prompt payload view).
5. **Feature 3 (human override)** — needs a new table + write path + UI form; do this before Feature 5 since it depends on it.
6. **Feature 5 (diff view)** — trivial once Feature 3 exists, mostly a read-only aggregation screen.

---
