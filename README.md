# Wrong Moment Retry Detector

**Track 03 — AI Revenue Recovery.** Recover revenue by retrying at each customer's personal best payment window, learned from their own transaction history — timing, not discounting.

> **Core rule:** The deterministic model decides *when* to retry. The LLM only explains the decision.

## Quick Start

### Backend

```bash
pip install -r requirements.txt
uvicorn backend.main:app --reload --port 8000
# or: python -m backend.main
```

Env (`backend/.env`): copy `.env.example` — works without Supabase/Groq keys (in-memory DB + template fallback).

### Frontend

```bash
cd frontend
npm install
npm run dev   # http://localhost:5173
```

Frontend proxies `/api` and `/webhooks` to `localhost:8000`.

### Demo Script

1. **Generate Synthetic Data** → creates customers with hidden profiles (salaried flush 1-5, gig Fridays, etc.) and realistic noise.
2. **Inject Failure** → pick a customer, inject `payment.failed`, see audit trail with confidence/basis/LLM explanation.
3. **Run Naive vs Smart Batch** → side-by-side recovery comparison on same batch (spec 6.2) — the credibility artifact.
4. **Inject Groq Failure** → toggle forces fallback template live.
5. Click a decision row → histogram visualization (explainability toggle).

## Architecture

- `backend/models/pattern_detector.py` — histogram + weighted recency + optional KDE (unit-testable, no DB/LLM deps)
- `backend/models/fallback.py` — cold-start logic (<3 successes)
- `backend/data/synthetic_generator.py` — synthetic history with hidden liquidity profiles
- `backend/llm/groq_client.py` + `prompts.py` — versioned prompts, privacy-conscious (only structured decision passed), best-effort with template fallback
- `backend/db/schema.sql` + `supabase_client.py` — Supabase Postgres with in-memory fallback
- `backend/webhooks/razorpay_webhook.py` — receives `payment.failed`, logs before execution
- `backend/scheduler/retry_executor.py` — APScheduler, quota-aware
- `frontend/src/Dashboard.jsx` etc. — audit trail + metrics + histogram + simulation controls

## Key Spec Guarantees

- ✅ Timestamps UTC internally, IST display
- ✅ Every API response includes `basis` + `confidence`
- ✅ No magic numbers — named constants in `constants.py`
- ✅ Audit logged BEFORE execution
- ✅ Respects `max_retries_allowed`
- ✅ PII minimalism — LLM never sees raw transaction dumps
- ✅ Honest confidence (thin history penalty)
- ✅ Groq best-effort only (system functions if LLM down)

## Tests

```bash
pytest backend/tests -v
```

## Supabase

Run `backend/db/schema.sql` in Supabase SQL editor. Set `SUPABASE_URL` / `SUPABASE_KEY` in `.env` to use real DB; otherwise in-memory fallback auto-activates.

## Razorpay Test Mode

Point Razorpay webhook to `/webhooks/razorpay`. Signature verified if `RAZORPAY_WEBHOOK_SECRET` set; otherwise accepted (test mode). See `backend/webhooks/razorpay_webhook.py` for payload shapes.

## Groq

Set `GROQ_API_KEY`; `GROQ_MODEL=llama-3.1-8b-instant` is default. Without a key, fallback templates are used and `llm_call_succeeded=false` is logged — demo-visible.
