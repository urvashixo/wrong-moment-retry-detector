# Wrong Moment Retry Detector

**Track 03 — AI Revenue Recovery.** Instead of retrying failed recurring payments on a fixed schedule, learn each customer's personal highest-probability payment window from their own successful-payment history and retry there — recovering revenue through timing, not discounting.

> **Core rule:** The deterministic model decides *when* to retry. The LLM (Groq) only explains the decision — never makes it. All decisions are logged *before* execution (audit-first).

---

## 1. Problem & Solution

Recurring failures are mostly `insufficient_funds` at the wrong moment, not fraud. Industry retry is fixed (`+24h, +3d, +7d`) for everyone, wasting NACH retries and trust. Liquidity is personal: salaried = flush days 1-5, gig = every Friday, etc.

**Solution:** per-customer weighted histograms (day-of-month / day-of-week / hour-of-day, recency-decayed), honesty-adjusted confidence, fallback for cold-start, quota-aware scheduling, plus human-in-the-loop overrides and a live A/B split to prove it.

---

## 2. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Backend / API | Python FastAPI | Fast webhook receiver, Pydantic |
| DB | Supabase Postgres + in-memory hybrid fallback | Managed + demo-resilient (`backend/db/supabase_client.py` auto-falls back + merges) |
| Payments | Razorpay Test Mode (Subscriptions, Orders, Webhooks) | Source of truth for `payment.failed` |
| Deterministic model | `pandas` / `numpy` + `scikit-learn` KDE optional | Explainable histogram, no black box |
| LLM | Groq API `qwen/qwen3.8-27b` (fallback chain `openai/gpt-oss-20b` …) | Cheap/fast, best-effort only, prompt-versioned (`backend/llm/prompts.py`) |
| Frontend | React + Vite + Tailwind, `react-router-dom` | Terminal/data-readout aesthetic, URL-synced |
| Scheduling | APScheduler (demo-accelerated to 10s) | Simulates wait until predicted time |
| Hosting | Vercel/Render + Supabase | Free-tier |

---

## 3. Project Structure

```
wrong-moment-retry-detector/
├── backend/
│   ├── main.py                      # FastAPI entry, all routes, A/B + escalation logic
│   ├── webhooks/razorpay_webhook.py # payment.failed handler (logs before execution)
│   ├── models/
│   │   ├── pattern_detector.py      # Level 1 histogram + Level 2 recency + Level 3 KDE
│   │   ├── fallback.py              # cold-start fallback (+3d 10:15 IST / population prior)
│   │   └── constants.py             # MIN_DATA_POINTS=3, CONFIDENCE thresholds, AB_*
│   ├── llm/
│   │   ├── groq_client.py           # Groq wrapper, decommissioned-model fallback, <think> strip, template fallback
│   │   ├── prompts.py               # versioned PROMPT_VERSION templates
│   │   └── explanation_fallback.py  # hardcoded template when Groq fails
│   ├── data/synthetic_generator.py  # hidden liquidity profiles + noise + baseline vs smart simulation
│   ├── db/
│   │   ├── schema.sql               # base + addendum (retry_overrides, experiment_group, status)
│   │   └── supabase_client.py       # Supabase + InMemoryDB hybrid + RLS + PGRST204 handling
│   ├── scheduler/retry_executor.py  # schedule_retry respects effective_retry_at (override)
│   └── tests/test_pattern_detector.py
├── frontend/
│   ├── src/
│   │   ├── App.jsx                  # BrowserRouter, Navbar, Routes /, /feed, /review, /diff, /ab, /customers/:id
│   │   ├── pages/                   # LandingPage, FeedPage, ReviewPage, DiffPage, ABPage, ProfileRoute
│   │   ├── Dashboard.jsx            # terminal log feed [ cust_* ] → retry [81%] day_of_month_cluster, Explain/Override
│   │   ├── ProfilePage.jsx          # spec §1 A-G single-column hairline layout (timeline, histogram, current, override, history)
│   │   ├── CustomerDetail.jsx       # inline histogram preview
│   │   ├── NeedsReview.jsx          # escalation queue
│   │   ├── DiffView.jsx             # override side-by-side
│   │   ├── ABPanel.jsx              # live A/B bars
│   │   ├── SimulationControls.jsx   # generate / inject / batch / groq-fail (leak-fixed)
│   │   ├── ErrorBoundary.jsx
│   │   └── index.css                # design tokens
│   └── vite.config.js               # appType: 'spa' for /review deep-link
├── docs/
│   ├── spec.md                      # copy of base spec
│   └── demo_script.md
└── wrong-moment-retry-detector-spec.md / frontend-design-spec.md / feature-addendum-spec.md / customer-profile-page-spec.md
```

---

## 4. Deterministic Model

- **Level 1:** bucket successes by `day-of-month (1-31)`, `day-of-week (0 Mon)`, `hour-of-day (0-23)` in **IST** (stored UTC), weighted histograms.
- **Level 2:** exponential recency `exp(-0.05 * days_ago)`.
- **Level 3:** `scipy.gaussian_kde` peak (stretch, `use_kde=True`).
- **Confidence:** `raw = top_bucket / total`, `adjusted = raw * min(1, n/8)` — thin history honestly penalized, never hardcoded.
- **Recommendation:** most confident bucket → next future timestamp (`_next_dom_timestamp` etc.) with hour hint from most common hour.
- **Payment-method-aware:** filters to that method if `≥3` points.
- **Quota-aware:** if retries remaining ≤1 caps far-future window to `+3d`.
- **KDE**, `hour_hint`, `quota_capped`, `routing_hint` exposed in `details`.

Cold-start (`<3` successes): `fallback_retry_timestamp(+3d 10:15 IST or population prior hour)` → `confidence 0.2-0.3`, `basis fallback_default`, `fallback_used true`.

---

## 5. Features

### 5.1 Core (base spec)

- Synthetic generation with hidden profiles (`flush_days_1_5`, `flush_every_friday`, `flush_after_6pm`, `flush_mid_month_10_15`, `flush_morning_only`, `erratic`) + 20% noise + cold-start ratio.
- Razorpay webhook `POST /webhooks/razorpay` validates HMAC if `RAZORPAY_WEBHOOK_SECRET` set, logs to `webhook_log`, runs model → LLM → audit → schedule.
- LLM only explains: `groq_client.explain_merchant` + `explain_customer` with prompt-payload guardrails, truncation, template fallback. `FORCE_GROQ_FAILURE=1` demo toggle at `POST /api/demo/fail-groq`.
- Scheduler `schedule_retry` demo-accelerates far-future retries to 10s, respects `effective_retry_at` (override).
- Supabase hybrid: `get_db()` prefers `SUPABASE_SECRET_KEY`/`SERVICE_KEY` else `SUPABASE_KEY` (publishable) + `InMemoryDB` fallback + `PGRST204` stripped insert for schema drift + merge reads.

### 5.2 Feature Addendum — Six Additions

**F1 — Per-Customer Profile Page (`/customers/{customer_id}` per spec, also `/profile/:id` alias):** `GET /api/customers/{id}/profile` returns `status` (`active/cold_start/low_confidence/needs_review/overridden` from real fields), `stats {total_events, success_count, failed_count, first_seen, last_seen}`, `payment_history` timeline, `histogram {basis, buckets:[{bucket,count}], insufficient_data}` (server-computed, same function as decision), `current_decision` (`decision_status`, `escalation_reason`, `experiment_group` as `B_smart/A_naive`), `active_override`, `decision_history` (with `experiment_group` tags). Frontend `ProfilePage.jsx` single-column hairline dividers (§2 layout) covers all states: cold-start (message not empty chart), erratic flat histogram, needs_review escalation message, overridden side-by-side, fresh zero-decisions empty state.

**F2 — LLM Explanation as Explicit Feature:** `POST /api/decisions/{id}/explain` read-only (never modifies `recommended_retry_at`), calls Groq live (regenerates), returns `{explanation, llm_call_succeeded, prompt_payload_shown: {customer_id, recommended_retry_at, confidence, basis, data_points_used, fallback_used, note}}` — proves privacy (no raw history/amounts). UI: `Explain this ▸` + `↻ regenerate` + `▸ show prompt sent` expandable JSON, `[ generated ]` tag.

**F3 — Human Override (bounded & gated):** `POST /api/decisions/{id}/override {new_retry_at, reason≥10}` inserts `retry_overrides` (never overwrites `recommended_retry_at`), sets `status=overridden`, `effective_retry_at` used by scheduler. Only `pending` decisions, one at a time, `[ overridden ]` tag everywhere. Visual: `Algorithm: Sep 03 10:15 [81%] → Human: Sep 05 09:00 · "known bank holiday" · ops_agent_priya` + link to diff filtered by customer.

**F4 — Retry-Quota Guardrail:** `IF retry_attempt+1==max_retries AND confidence<0.50` → `status=needs_human_review`, **not auto-scheduled**. Dedicated `GET /api/decisions/needs-review` + `/review` page (purpose header + `+ inject demo escalation` helper). Visually distinct from overrides.

**F5 — Diff View:** `GET /api/overrides/diff` + `GET /api/overrides` lists `customer | algorithm recommended (conf/basis) | human chose | reason | outcome` + aggregates `override_rate`, `human_success_rate` with honesty note about counterfactual limitation. Reuses terminal log style.

**F6 — A/B Live Split (not backtested):** On each failure `_assign_experiment_group` via `md5(customer_id:failure_id)` stable 50/50; `A` = naive fixed `+3d`, no model/LLM; `B` = smart. Stored as `experiment_group` on `retry_decisions`. `GET /api/experiment/stats` returns `group_a_fixed {total,recovered,pending,rate}` vs `group_b_smart` + `improvement_pct`, live-updating chart reusing landing proof component.

### 5.3 Frontend Design System

Tokens: `--bg #0A0A0A`, `--panel #111111`, `--line #2A2A2A`, `--text-primary #EDEDED`, `--text-dim #7A7A7A`, `--heat-1 #E8432C → --heat-4 #F8E14A` (confidence scale), `--success #3ECF8E`. Type: `JetBrains Mono` body + `Silkscreen` dot-matrix for live numbers, `70ch` line cap, left-aligned grid, hairline square panels, `[ brackets ]` only for live/computed values. One motion moment (hero histogram flash), else motion only on user action. `prefers-reduced-motion` respected. All heat colors paired with `[ 81% ]` text for a11y, focus bracket outline, mobile stacks cleanly. No rounded shadows, no fake logos.

Pages URL-synced (`BrowserRouter`, `appType: 'spa'`): `/` Landing (hero histogram + `01 detect / 02 learn / 03 retry`), `/feed` Live feed + `SimulationControls` + inline `CustomerDetail`, `/review`, `/diff`, `/ab`, `/customers/:id` (profile). Navbar `NavLink` active → `var(--panel)` .

---

## 6. API Surface

| Method | Path | Notes |
|---|---|---|
| `GET` | `/health` | |
| `POST` | `/api/synthetic/generate {n_customers, cold_start_ratio, seed}` | |
| `GET` | `/api/customers` / `GET /api/customers/{id}` / `GET /api/customers/{id}/histogram` | |
| `GET` | `/api/customers/{id}/profile` | F1 spec shape |
| `POST` | `/api/retry/decide {customer_id, mandate_id, amount, failure_reason, failed_at, retry_attempt_number, max_retries_allowed, payment_method}` | Features 4+6: returns `experiment_group`, `status`, `escalated`, `effective_retry_at` |
| `POST` | `/api/retry/inject-failure` | demo wrapper |
| `GET` | `/api/retry/decisions?customer_id&status&experiment_group` | + `GET /api/decisions/needs-review` |
| `POST` | `/api/decisions/{id}/explain` | F2 |
| `POST` | `/api/decisions/{id}/override {new_retry_at, reason}` | F3 |
| `GET` | `/api/overrides` / `GET /api/overrides/diff` | F5 |
| `GET` | `/api/experiment/stats` | F6 |
| `POST` | `/api/retry/simulate-batch {n_sim, seed}` | baseline vs smart batch (spec 6.2) |
| `POST` | `/api/retry/execute/{decision_id}?success` | |
| `GET` | `/api/retry/jobs` | |
| `POST` | `/webhooks/razorpay` | Razorpay `payment.failed` |
| `POST` | `/api/demo/fail-groq {enable}` | |
| `GET` | `/api/metrics` / `GET /api/webhook/logs` | |

Every decide response includes `basis` + `confidence` + `status` + `experiment_group`.

---

## 7. Data Models

**payment_events:** `id, customer_id, mandate_id, transaction_id, amount, status (success/failed), failure_reason, payment_method (UPI/card/netbanking), attempted_at, created_at`

**retry_decisions (audit trail 6.1):** `decision_id, customer_id, mandate_id, original_failure_event_id, retry_attempt_number, max_retries_allowed, model_basis, data_points_used, confidence, fallback_used, recommended_retry_at, effective_retry_at, llm_explanation, llm_call_succeeded, actual_retry_outcome (pending/success/failed), actual_retry_executed_at, status (scheduled/needs_human_review/overridden/executed), experiment_group (A/B), created_at`

**retry_overrides (F3):** `override_id, decision_id FK, customer_id, original_retry_at, overridden_retry_at, reason (≥10), created_by, created_at`

**demo_batches (6.2):** `batch_id, total_failed_payments, retried_with_smart_timing, recovered_count, recovered_amount_total, baseline_*, improvement_pct, cold_start_fallback_count`

**Spec guarantees:** UTC stored / IST displayed, audit before execution, respects `max_retries`, PII minimalism, honest volume-adjusted confidence, Groq best-effort, no discounting, no magic numbers (all in `constants.py`).

---

## 8. Setup & Run

```powershell
# 1. env
cp .env.example .env   # fill SUPABASE_URL + SUPABASE_KEY (publishable) or SUPABASE_SECRET_KEY (sb_secret_... for writes without RLS), GROQ_API_KEY, optional RAZORPAY_*
# .env already has GROQ_MODEL=qwen/qwen3.8-27b (fallback chain handles decommissioned llama models)

# 2. backend (from project root)
pip install -r requirements.txt
python -m uvicorn backend.main:app --reload --port 8000
# http://localhost:8000/health  http://localhost:8000/docs

# 3. frontend (second terminal)
cd frontend
npm install
npm run dev   # http://localhost:5173  proxies /api → :8000

# 4. tests
pytest backend/tests -v
npm run build  # vite build → dist/
```

**Supabase:** Run `backend/db/schema.sql` in SQL Editor (base + addendum columns/tables). If you see `PGRST204 schema cache` or `42501 RLS`, the hybrid fallback keeps the app working but run:

```sql
alter table customers disable row level security;
alter table payment_events disable row level security;
alter table retry_decisions disable row level security;
alter table demo_batches disable row level security;
alter table webhook_log disable row level security;
alter table retry_overrides disable row level security;
-- or create permissive policies instead
```

Or add `SUPABASE_SECRET_KEY=s b_secret_...`.

**Razorpay:** point webhook to `http://localhost:8000/webhooks/razorpay`; signature verified if `RAZORPAY_WEBHOOK_SECRET` set.

**Groq:** default `qwen/qwen3.8-27b` verified live; decommissioned `llama-3.1-8b-instant` auto-mapped to fallback chain with `<think>` stripping.

---

## 9. Demo Script (2 live failure-injection moments)

1. **Generate** (`01 generate`) → 20 customers, hidden profiles visible.
2. **Feed** `/feed` → pick customer → `02 inject` → watch terminal log `[ cust_* ] → retry Sep 03 10:15 [ 81% ] day_of_month_cluster` + heat color, click row → `Explain this ▸` (live Groq, prompt payload ` {confidence:0.81…}` — no raw history) → `↻ regenerate`.
3. **Cold-start** sparse customer → `[ fallback ]` `[31%]` + fallback message (trust signal).
4. **Review** `/review` → empty = confident; `+ inject demo escalation` → low-confidence last retry → `[ needs review ]` queued (system *declined*), then `Override` on feed with reason ≥10 → `[ overridden ]` (human chose).
5. **Diff** `/diff` → side-by-side algorithm vs human + override rate + honest limitation note.
6. **A/B** `/ab` → live randomized `A naive` (gray) vs `B smart` (heat) bars sharing axis, `Improvement +XX%` — stronger than backtest.
7. **Profile** click any `[ cust_* ]` or red `open profile page` → `/customers/:id` → header badge (`active/cold_start/.../overridden`), horizontal timeline ticks (red failures larger, hover shows amount/method/reason), histogram actually used with marker, current decision (escalation vs normal), inline override, decision history with `[ A_naive / B_smart ]` tags.
8. **Groq fail** `04 groq` toggle → next decide shows `[ template ]` fallback sentence.

Landing `/` is hero + 3 steps only; all live sections are separate URL-synced pages (`/feed` etc., deep-linkable, back button works, `appType: 'spa'` + `ErrorBoundary` handles refresh on `/review`).

---

## 10. Testing

`pytest backend/tests/test_pattern_detector.py` covers histogram recovery, cold-start boundary, recency/volume, payment-method-aware, quota cap, population prior, synthetic generator, `basis`+`confidence` always present, honest confidence.

Manual API sanity: `POST /api/retry/decide`, `POST /api/decisions/{id}/explain`, `POST /api/decisions/{id}/override`, `GET /api/decisions/needs-review`, `GET /api/overrides/diff`, `GET /api/experiment/stats`, `GET /api/customers/{id}/profile` — all verified with hybrid Supabase (201s) + Groq live (qwen).

---

## 11. Design & Coding Rules (spec §11)

- Every money function unit-testable in isolation (no DB/LLM deps).
- Fail loud in logs, soft in UI; no magic numbers; every response has `basis`+`confidence`; synthetic generator never leaks hidden pattern; prompts versioned; UTC/IST discipline; `demo-stable` tag.

---

*This README is the living spec — original `wrong-moment-retry-detector-spec.md` + `frontend-design-spec.md` + `feature-addendum-spec.md` + `customer-profile-page-spec.md` merged. Update it as you make real decisions.*
