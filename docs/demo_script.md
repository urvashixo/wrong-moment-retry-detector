# Demo Script — Wrong Moment Retry Detector (Track 03)

**Duration: ~4 minutes. Two failure-injection moments are mandatory.**

## Setup (pre-demo)

- Backend `uvicorn backend.main:app --reload` on :8000
- Frontend `npm run dev` on :5173
- Have Supabase + Groq keys in .env (or note in-memory fallback)
- Tag a demo-stable commit: `git tag demo-stable`

## Sequence

### 0:00 — The Problem (30s)

> "Recurring payments fail not because customers don't want to pay, but because we ask at the wrong moment. Industry retry is fixed: +24h, +3d, +7d for everyone. A salaried customer is flush 1st-5th, a gig worker every Friday — generic schedule wastes scarce NACH retries."

### 0:30 — Generate Synthetic Data (30s)

- Click **Generate Synthetic Data** (20 customers, 25% cold-start)
- Show customers with hidden profile tags (only for synthetic verification)
- Point out noise injection — model must detect pattern, not read it back

### 1:00 — Inject Failure → Live Decision (60s)

- Select a non-cold-start customer (e.g., `flush_days_1_5`)
- Click **Inject Failure** → table updates live
- Point out columns: `Retry At (IST)`, `Confidence`, `Basis`, `Fallback`, `LLM`, `Status=pending`
- Expand that customer's histogram: "Why this time?" → show peak at days 1-5 around 10am
- Quote LLM explanation: 1-2 sentences, plain English for support agent
- Emphasize: "LLM never decided the time — deterministic histogram did. We pass only the structured decision, never raw history."

### 2:00 — Cold-Start Failure Recovery Moment #1 (30s)

- Select a customer with 1-2 data points (cold-start)
- Inject failure → watch `Fallback = ⚠️ yes`, `Confidence ~0.2-0.3 low / insufficient history`, basis=`fallback_default`
- Explain: population prior or +3d default, honestly scored

### 2:30 — Naive vs Smart Batch (60s)

- Set batch 50, click **Run Naive vs Smart Batch**
- Reveal metrics card: Smart recovered 34 / Baseline 21 → +61% improvement, total ₹ amount
- "Same synthetic batch, same failures — baseline is fixed +3 days at 10:15, smart uses personal window. This comparison is our measured money recovered claim."

### 3:30 — Groq Failure Recovery Moment #2 (30s)

- Toggle **Inject Groq Failure** ON (red)
- Inject another failure → show `LLM = 📝 template` and fallback sentence: "Retry scheduled for ... based on your payment history."
- Toggle OFF, inject again → `✅` Groq explanation returns
- "We show failure recovery live, on command — no hoping for real hiccup."

### 4:00 — Close

> "Revenue recovered through timing, not discounting. Every decision explainable and audited before execution, with quota awareness for NACH. Thank you."
