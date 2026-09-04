# Customer Profile Page — Spec

This is the detailed spec for Feature 1 from the addendum doc. One URL per customer: `/customers/{customer_id}`.

**The page's job:** let a judge or merchant ops person land on one customer and answer, without clicking anywhere else — *"why does the system believe what it believes about this person, what did it decide, and did a human ever step in?"*

---

## 1. Section-by-Section Contents

### A. Header bar
- `customer_id`, `mandate_id`
- **Status badge** — one of: `active` (normal, enough history) / `cold_start` (< min data points) / `low_confidence` (has history but erratic) / `needs_review` (has a decision stuck in the escalation queue) / `overridden` (most recent decision has an active override)
- Quick stats row: total payment_events count, success count, failed count, first-seen date, last-seen date
- This badge logic must be computed the same way the backend computes it for decisions — don't hand-pick a badge just for display; pull it from real fields (`data_points_used`, `confidence`, `decision_status`).

### B. Payment history timeline
- Every `payment_events` row for this customer on one horizontal timeline, oldest to newest.
- Successes as small ticks in a neutral color; failures as ticks in `--heat-1` red, slightly larger so they're easy to spot.
- Hover/tap on any tick shows: exact timestamp, amount, payment_method, and (for failures) failure_reason.
- If the customer is `cold_start`, this timeline will visibly be short/sparse — **don't hide or pad this**, the sparseness itself is the point (it's why the system fell back).

### C. The histogram(s) actually used
- Render whichever chart(s) correspond to this customer's most recent `model_basis`:
  - `day_of_month_cluster` → 31-bucket histogram
  - `day_of_week_cluster` → 7-bucket histogram
  - `hour_of_day_cluster` → 24-bucket histogram
  - `fallback_default` → show a message instead of a chart: *"Not enough history to build a personal pattern (X data points, minimum is Y)."* — don't render an empty/fake chart for cold-start customers, that would misrepresent what the system actually did.
- Overlay a vertical marker on the chart at the `recommended_retry_at` value (converted to the same bucket unit) so the recommendation visibly lands on the evidence that produced it.
- This must be the **same chart component** used on the main dashboard's Screen 2 — don't build a second implementation.

### D. Current / most recent decision
A single prominent block (not a table row) showing:
- `recommended_retry_at`, `confidence` (colored on the heat scale), `model_basis`, `data_points_used`, `fallback_used`
- The LLM explanation sentence, with the "Explain this" / "Regenerate" controls and the expandable raw-prompt-payload view from Feature 2
- If this decision has `decision_status = needs_human_review` → show the escalation reason prominently instead of a normal recommendation (e.g., *"Last allowed retry attempt, confidence only 38% — flagged for human review instead of auto-scheduling."*)
- If this decision has an active override → show both values side by side right here (algorithm vs. human), not just a link out to the global diff view — see Section E.

### E. Override, if one exists on the current decision
Inline, not a separate page for this one record:
```
Algorithm recommended:   Sep 03, 10:15   [ 81% confidence ]
Human chose instead:     Sep 05, 09:00
Reason:                  "known bank holiday on the 3rd"
Overridden by:           ops_agent_priya
```
Include a link to "see all overrides for this customer" → filters the global diff view (Feature 5) by this `customer_id`, rather than duplicating that table here.

### F. Full decision history (this customer only)
A compact log-style list (same visual pattern as the main decisions feed, per the frontend spec — reuse it), scoped to this customer, oldest or newest first:
```
[ Aug 03 ] retry scheduled  Sep 03 10:15  conf 0.74  day_of_month_cluster
[ Jul 01 ] retry scheduled  Jul 05 09:30  conf 0.68  day_of_month_cluster   → recovered
[ Jun 02 ] fallback used    Jun 05 (default +3d)     conf 0.31             → failed
```
Purpose: lets a judge see confidence *trending* as more data accumulates for this customer over time — a nice, true, unscripted signal that the model actually improves with more history, if your synthetic data shows that (it should, for the non-erratic profiles).

### G. Experiment group tag (if applicable)
If any of this customer's decisions were part of the A/B split (Feature 6), show a small tag: `[ B_smart ]` or `[ A_naive ]` next to that decision in the history list — so it's clear this customer's outcome is also feeding your aggregate A/B numbers, not hidden as a separate concept.

---

## 2. Layout (matches the terminal/heat-gradient design system)

```
┌──────────────────────────────────────────────────────────┐
│ [ cust_014 ]  mandate_014        [ needs_review ]         │
│ 12 events · 9 success · 3 failed · first seen Jan 14      │
├──────────────────────────────────────────────────────────┤
│  PAYMENT HISTORY                                          │
│  ●──●──●───X──●──●──●──X──●──●──●──X   (timeline ticks)   │
├──────────────────────────────────────────────────────────┤
│  PATTERN (day_of_month_cluster)                           │
│  [ histogram bars, 1-31, marker line at day 3 ]           │
├──────────────────────────────────────────────────────────┤
│  CURRENT DECISION                                         │
│  retry Sep 03 10:15   [ 81% ]   day_of_month_cluster       │
│  "Retrying based on 8 prior payments clustering..."        │
│  ▸ explain this   ▸ regenerate   ▸ show prompt sent        │
├──────────────────────────────────────────────────────────┤
│  OVERRIDE (if any)                                         │
│  algorithm: Sep 03 10:15  →  human: Sep 05 09:00           │
│  reason: "known bank holiday on the 3rd"                   │
├──────────────────────────────────────────────────────────┤
│  DECISION HISTORY                                          │
│  [log-style list, newest first]                            │
└──────────────────────────────────────────────────────────┘
```

Single column, left-aligned, hairline dividers between sections — no cards/shadows, consistent with the rest of the app.

---

## 3. States to Explicitly Design For

Don't just design the "happy path" (active customer, high confidence, no override). Explicitly design and test these on this page:

1. **Cold-start customer** — sparse timeline, no histogram (message instead), fallback decision shown honestly.
2. **Erratic/low-confidence customer** — full-looking timeline but a flat/noisy histogram and a low confidence badge (`--heat-4`) — visually communicates "we have data, but no clean pattern," which is a different story than cold-start and should look different.
3. **Needs-review customer** — decision block replaced by the escalation message, no `recommended_retry_at` presented as if it were a normal action.
4. **Overridden customer** — both algorithm and human values shown, reason visible.
5. **Fresh customer with zero decisions yet** (only success history, no failures ever) — the "current decision" and "decision history" sections should show a plain empty-state message (*"No failed payments recorded for this customer."*), not a broken/empty chart.

---

## 4. API Surface

```
GET /api/customers/{customer_id}/profile
```
Response shape:
```json
{
  "customer_id": "cust_014",
  "mandate_id": "mandate_014",
  "status": "needs_review",
  "stats": {
    "total_events": 12,
    "success_count": 9,
    "failed_count": 3,
    "first_seen": "2026-01-14T09:00:00+05:30",
    "last_seen": "2026-08-30T14:00:00+05:30"
  },
  "payment_history": [ { "id": "...", "status": "success", "attempted_at": "...", "amount": 499, "payment_method": "upi" }, ... ],
  "histogram": {
    "basis": "day_of_month_cluster",
    "buckets": [ { "bucket": 1, "count": 0 }, { "bucket": 2, "count": 1 }, ..., { "bucket": 31, "count": 0 } ],
    "insufficient_data": false
  },
  "current_decision": {
    "decision_id": "...",
    "recommended_retry_at": "...",
    "confidence": 0.81,
    "model_basis": "day_of_month_cluster",
    "data_points_used": 8,
    "fallback_used": false,
    "decision_status": "needs_human_review",
    "escalation_reason": "last_attempt_low_confidence",
    "llm_explanation": "...",
    "experiment_group": "B_smart"
  },
  "active_override": {
    "algorithm_recommended_at": "...",
    "overridden_retry_at": "...",
    "override_reason": "...",
    "overridden_by": "..."
  },
  "decision_history": [ { "decision_id": "...", "created_at": "...", "recommended_retry_at": "...", "confidence": 0.74, "model_basis": "...", "outcome": "recovered" }, ... ]
}
```

**Important:** the `histogram.buckets` array is computed server-side using the exact same function the live decision pipeline uses — never let the frontend recompute or approximate it independently. If the histogram shown here can drift from the histogram that actually produced the decision, you've broken your own explainability guarantee.

---

## 5. What NOT to put on this page

- No editable fields other than the override action itself (this page displays history and current state; it is not a general customer-editing screen).
- No cross-customer comparisons or rankings ("this customer is in the top 10% of confidence") — that's a different, aggregate-level view; keep this page scoped to one customer's own story.
- No raw amounts or payment history passed to the LLM explanation call from this page either — same privacy rule as the base spec applies here, this page just makes it visible, it doesn't get to bend it.
