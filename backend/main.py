"""
FastAPI app entrypoint — Spec Section 8
"""
from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional

import pytz
from fastapi import FastAPI, HTTPException, Request, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from backend.db.supabase_client import get_db
from backend.data.synthetic_generator import (
    generate_synthetic_customers,
    generate_failure_batch,
    simulate_baseline_vs_smart,
)
from backend.models.pattern_detector import detect_retry_window, compute_population_hour_prior
from backend.llm.groq_client import get_groq_client
from backend.webhooks.razorpay_webhook import handle_razorpay_webhook
from backend.scheduler.retry_executor import schedule_retry, simulate_retry_execution, list_jobs

# Load .env if present — robust to cwd differences
try:
    from dotenv import load_dotenv  # type: ignore

    load_dotenv()
    load_dotenv(dotenv_path=os.path.join(os.getcwd(), ".env"))
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"))
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))
except Exception:
    pass

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger(__name__)
logger.info(f"Env loaded: SUPABASE_URL={'set' if os.getenv('SUPABASE_URL') else 'missing'} GROQ_API_KEY={'set' if os.getenv('GROQ_API_KEY') else 'missing'} GROQ_MODEL={os.getenv('GROQ_MODEL')}")

UTC = pytz.timezone("UTC")
IST = pytz.timezone("Asia/Kolkata")

app = FastAPI(
    title="Wrong Moment Retry Detector",
    description="AI Revenue Recovery — predict personal best payment window from transaction history",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Pydantic models ──
class SyntheticGenerateRequest(BaseModel):
    n_customers: int = Field(default=20, ge=1, le=100)
    cold_start_ratio: float = Field(default=0.25, ge=0, le=1)
    seed: Optional[int] = 42


class RetryDecideRequest(BaseModel):
    customer_id: str
    mandate_id: Optional[str] = None
    amount: Optional[float] = 1000
    failure_reason: str = "insufficient_funds"
    failed_at: Optional[str] = None  # ISO string
    retry_attempt_number: int = 0
    max_retries_allowed: int = 4
    payment_method: Optional[str] = None


class SimulateBatchRequest(BaseModel):
    n_sim: int = Field(default=50, ge=1, le=500)
    seed: Optional[int] = 123


class InjectFailureRequest(BaseModel):
    customer_id: str
    amount: Optional[float] = 999
    failure_reason: str = "insufficient_funds"
    payment_method: Optional[str] = None
    retry_attempt_number: int = 0
    max_retries_allowed: int = 4


# ── Helpers ──
def _parse_iso(dt_str: Optional[str]) -> datetime:
    if not dt_str:
        return datetime.now(UTC)
    try:
        s = dt_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = UTC.localize(dt)
        return dt
    except Exception:
        raise HTTPException(status_code=400, detail=f"Invalid datetime: {dt_str}")


def _serialize(obj: Any) -> Any:
    if isinstance(obj, datetime):
        return obj.isoformat()
    if isinstance(obj, list):
        return [_serialize(x) for x in obj]
    if isinstance(obj, dict):
        return {k: _serialize(v) for k, v in obj.items()}
    return obj


# ── Routes ──
@app.get("/health")
def health():
    return {"status": "ok", "service": "wrong-moment-retry-detector", "timestamp": datetime.now(UTC).isoformat()}


@app.get("/api/metrics")
def metrics():
    db = get_db()
    decisions = db.list_retry_decisions()
    batches = db.list_demo_batches()
    customers = db.list_customers()
    # Aggregate simple metrics
    total_decisions = len(decisions)
    fallback_count = sum(1 for d in decisions if d.get("fallback_used"))
    avg_conf = round(sum(float(d.get("confidence", 0)) for d in decisions) / total_decisions, 3) if total_decisions else 0
    latest_batch = batches[0] if batches else None
    return {
        "total_customers": len(customers),
        "total_decisions": total_decisions,
        "fallback_count": fallback_count,
        "avg_confidence": avg_conf,
        "latest_batch": _serialize(latest_batch) if latest_batch else None,
        "all_batches": _serialize(batches),
    }


@app.post("/api/synthetic/generate")
def synthetic_generate(req: SyntheticGenerateRequest):
    db = get_db()
    customers, events = generate_synthetic_customers(
        n_customers=req.n_customers, cold_start_ratio=req.cold_start_ratio, seed=req.seed
    )
    for c in customers:
        db.upsert_customer(c["customer_id"], c.get("hidden_profile_tag"))
    for e in events:
        db.insert_payment_event(e)
    return {
        "customers_generated": len(customers),
        "events_generated": len(events),
        "customers": _serialize(customers[:5]),  # sample
        "note": "Full data in DB. Use GET /api/customers to list.",
    }


@app.get("/api/customers")
def list_customers():
    db = get_db()
    customers = db.list_customers()
    return {"customers": _serialize(customers)}


@app.get("/api/customers/{customer_id}")
def get_customer(customer_id: str):
    db = get_db()
    # Find customer
    customers = db.list_customers()
    cust = next((c for c in customers if c["customer_id"] == customer_id), None)
    if not cust:
        raise HTTPException(status_code=404, detail="Customer not found")
    events = db.list_payment_events(customer_id=customer_id)
    decisions = db.list_retry_decisions(customer_id=customer_id)
    # Histogram via pattern_detector helper
    success_events = [e for e in events if e["status"] == "success"]
    return {
        "customer": _serialize(cust),
        "events": _serialize(events),
        "success_count": len(success_events),
        "decisions": _serialize(decisions),
    }


@app.get("/api/customers/{customer_id}/histogram")
def customer_histogram(customer_id: str):
    """Explainability: return raw histogram data for UI chart (extra #4)."""
    db = get_db()
    events = db.list_payment_events(customer_id=customer_id, status="success")
    # Convert strings if needed
    for e in events:
        if isinstance(e.get("attempted_at"), str):
            try:
                e["attempted_at"] = datetime.fromisoformat(e["attempted_at"].replace("Z", "+00:00"))
            except Exception:
                pass
    # Build buckets in IST
    from collections import Counter

    dom = Counter()
    dow = Counter()
    hod = Counter()
    for e in events:
        ts = e.get("attempted_at")
        if not isinstance(ts, datetime):
            continue
        if ts.tzinfo is None:
            ts = UTC.localize(ts)
        ist = ts.astimezone(IST)
        dom[ist.day] += 1
        dow[ist.weekday()] += 1
        hod[ist.hour] += 1

    return {
        "customer_id": customer_id,
        "data_points": len(events),
        "dom_histogram": dict(sorted(dom.items())),
        "dow_histogram": dict(sorted(dow.items())),
        "hod_histogram": dict(sorted(hod.items())),
        "explainer": "Buckets are in IST. Highest bar = predicted best window.",
    }


@app.post("/api/retry/decide")
def retry_decide(req: RetryDecideRequest):
    """
    Direct retry decision endpoint — deterministic model + LLM explanation.
    Every response includes basis and confidence (spec 11.4).
    """
    db = get_db()
    # Validate retry quota
    if req.retry_attempt_number >= req.max_retries_allowed:
        raise HTTPException(status_code=400, detail="max_retries_allowed exceeded")

    failed_at = _parse_iso(req.failed_at)
    success_events = db.get_success_events_for_customer(req.customer_id)
    # Ensure customer exists
    if not success_events and not any(c["customer_id"] == req.customer_id for c in db.list_customers()):
        # Still allow cold-start decision
        pass

    all_success = db.get_all_success_events()
    pop_hour = compute_population_hour_prior(all_success)

    # Deterministic decision
    decision_core = detect_retry_window(
        customer_id=req.customer_id,
        success_events=success_events,
        failed_at=failed_at,
        payment_method=req.payment_method,
        population_prior_hour=pop_hour,
        all_customers_hour_prior=pop_hour,
        max_retries_allowed=req.max_retries_allowed,
        retry_attempt_number=req.retry_attempt_number,
    )

    # LLM explanation (best-effort)
    groq = get_groq_client()
    explanation, llm_ok = groq.explain_merchant(
        customer_id=req.customer_id,
        recommended_retry_at=decision_core["recommended_retry_at"],
        confidence=decision_core["confidence"],
        basis=decision_core["basis"],
        data_points_used=decision_core["data_points_used"],
        fallback_used=decision_core["fallback_used"],
    )
    # Customer message too
    customer_msg, _ = groq.explain_customer(
        recommended_retry_at=decision_core["recommended_retry_at"],
        confidence=decision_core["confidence"],
        basis=decision_core["basis"],
    )

    # Persist failure event + audit BEFORE execution (spec rule 4)
    failure_event = db.insert_payment_event(
        {
            "customer_id": req.customer_id,
            "mandate_id": req.mandate_id,
            "transaction_id": f"txn_fail_{uuid.uuid4().hex[:8]}",
            "amount": req.amount or 0,
            "status": "failed",
            "failure_reason": req.failure_reason,
            "payment_method": req.payment_method or "UPI",
            "attempted_at": failed_at,
        }
    )

    audit = {
        "customer_id": req.customer_id,
        "mandate_id": req.mandate_id,
        "original_failure_event_id": failure_event.get("id"),
        "retry_attempt_number": req.retry_attempt_number + 1,
        "max_retries_allowed": req.max_retries_allowed,
        "model_basis": decision_core["basis"],
        "data_points_used": decision_core["data_points_used"],
        "confidence": decision_core["confidence"],
        "fallback_used": decision_core["fallback_used"],
        "recommended_retry_at": decision_core["recommended_retry_at"],
        "llm_explanation": explanation,
        "llm_call_succeeded": llm_ok,
        "actual_retry_outcome": "pending",
    }
    saved = db.insert_retry_decision(audit)

    # Schedule
    try:
        job = schedule_retry(saved)
    except Exception as e:
        logger.warning(f"schedule failed: {e}")
        job = None

    return {
        "decision_id": str(saved.get("decision_id")),
        "customer_id": saved.get("customer_id"),
        "recommended_retry_at": _serialize(saved.get("recommended_retry_at")),
        "recommended_retry_at_ist": saved.get("recommended_retry_at").astimezone(IST).isoformat() if isinstance(saved.get("recommended_retry_at"), datetime) else None,
        "confidence": saved.get("confidence"),
        "basis": saved.get("model_basis"),
        "data_points_used": saved.get("data_points_used"),
        "fallback_used": saved.get("fallback_used"),
        "llm_explanation": explanation,
        "llm_call_succeeded": llm_ok,
        "customer_message": customer_msg,
        "failure_event_id": failure_event.get("id"),
        "job": _serialize(job) if job else None,
        "details": decision_core.get("details"),
    }


@app.post("/api/retry/inject-failure")
def inject_failure(req: InjectFailureRequest):
    """Synthetic failure injection — convenience wrapper for demo."""
    return retry_decide(
        RetryDecideRequest(
            customer_id=req.customer_id,
            amount=req.amount,
            failure_reason=req.failure_reason,
            failed_at=datetime.now(UTC).isoformat(),
            retry_attempt_number=req.retry_attempt_number,
            max_retries_allowed=req.max_retries_allowed,
            payment_method=req.payment_method,
        )
    )


@app.get("/api/retry/decisions")
def list_decisions(customer_id: Optional[str] = Query(None)):
    db = get_db()
    decisions = db.list_retry_decisions(customer_id=customer_id)
    # Sort newest first
    try:
        decisions.sort(key=lambda d: d.get("created_at") or "", reverse=True)
    except Exception:
        pass
    return {"decisions": _serialize(decisions), "count": len(decisions)}


@app.post("/api/retry/execute/{decision_id}")
def execute_retry(decision_id: str, success: Optional[bool] = None):
    """Simulate executing a retry (for scheduler demo)."""
    db = get_db()
    decisions = db.list_retry_decisions()
    # Find decision
    target = next((d for d in decisions if str(d.get("decision_id")) == decision_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Decision not found")
    # Find job or simulate directly
    jobs = list_jobs()
    job = next((j for j in jobs if str(j.get("decision_id")) == decision_id), None)
    if job:
        result = simulate_retry_execution(job["job_id"], success_override=success)
    else:
        # Direct DB update fallback
        outcome = "success" if (success is True or (success is None and __import__("random").random() < 0.6)) else "failed"
        db.update_retry_outcome(decision_id, outcome)
        result = {"decision_id": decision_id, "outcome": outcome, "direct": True}
    return _serialize(result)


@app.get("/api/retry/jobs")
def retry_jobs():
    return {"jobs": _serialize(list_jobs())}


@app.post("/api/retry/simulate-batch")
def simulate_batch(req: SimulateBatchRequest):
    db = get_db()
    customers = db.list_customers()
    events = db.list_payment_events()
    # If no data, generate synthetic first
    if not customers or not events:
        customers_synth, events_synth = generate_synthetic_customers(n_customers=20, seed=req.seed)
        for c in customers_synth:
            db.upsert_customer(c["customer_id"], c.get("hidden_profile_tag"))
        for e in events_synth:
            db.insert_payment_event(e)
        customers = db.list_customers()
        events = db.list_payment_events()

    # Need to convert attempted_at strings to datetime for simulation if needed
    for e in events:
        if isinstance(e.get("attempted_at"), str):
            try:
                e["attempted_at"] = datetime.fromisoformat(e["attempted_at"].replace("Z", "+00:00"))
            except Exception:
                pass

    # Rebuild customers list with hidden tags for simulation
    # Hidden tags already stored in customers table but may be None; use synthetic mapping if missing
    # For simulation we need hidden_profile per customer; approximate if missing
    for c in customers:
        if not c.get("hidden_profile_tag"):
            c["hidden_profile_tag"] = "erratic"

    metrics = simulate_baseline_vs_smart(customers, events, n_sim=req.n_sim, seed=req.seed or 123)
    # Persist batch
    batch_saved = db.insert_demo_batch(metrics)
    return _serialize(batch_saved)


@app.post("/webhooks/razorpay")
async def razorpay_webhook(request: Request):
    raw_body = await request.body()
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    # Optional signature verification
    secret = os.getenv("RAZORPAY_WEBHOOK_SECRET", "")
    sig = request.headers.get("X-Razorpay-Signature", "")
    if secret and sig:
        import hmac, hashlib

        expected = hmac.new(secret.encode(), raw_body, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, sig):
            logger.warning("Invalid Razorpay signature")
            raise HTTPException(status_code=400, detail="Invalid signature")
    try:
        result = await handle_razorpay_webhook(payload, dict(request.headers))
        return _serialize(result)
    except ValueError as e:
        logger.warning(f"Webhook validation error: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Webhook handling error: {e}", exc_info=True)
        # Fail soft in UI but loud in logs (spec 11.2)
        return JSONResponse(status_code=500, content={"error": "Internal error processing webhook", "detail": str(e)})


@app.post("/api/demo/fail-groq")
def demo_fail_groq(enable: bool = Body(..., embed=True)):
    """Demo injection: toggle Groq failure to show fallback (extra #6)."""
    os.environ["FORCE_GROQ_FAILURE"] = "1" if enable else "0"
    # Reset singleton so it picks up flag
    try:
        from backend.llm.groq_client import get_groq_client

        client = get_groq_client()
        # force flag is checked per-call, no need to reset
        pass
    except Exception:
        pass
    return {"forced_groq_failure": enable, "message": "Groq fallback will be used on next decision" if enable else "Groq enabled"}


@app.get("/api/webhook/logs")
def webhook_logs():
    db = get_db()
    logs = db.list_webhook_logs()
    return {"logs": _serialize(logs)}


# Global error handler — fail soft in UI, loud in logs
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled error on {request.url.path}: {exc}", exc_info=True)
    if isinstance(exc, HTTPException):
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})
    return JSONResponse(status_code=500, content={"detail": "Internal server error. Check server logs."})
