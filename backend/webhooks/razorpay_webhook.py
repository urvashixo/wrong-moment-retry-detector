"""
Razorpay webhook receiver — Spec Section 3.2
Handles payment.failed / subscription.charged failure events.
Validates payload, logs to webhook_log, triggers deterministic model.
"""
from __future__ import annotations

import logging
import hmac
import hashlib
import os
from datetime import datetime
from typing import Any, Dict

import hashlib
import uuid

import pytz

from backend.db.supabase_client import get_db
from backend.models.pattern_detector import detect_retry_window, compute_population_hour_prior
from backend.models.constants import CONFIDENCE_ESCALATION_THRESHOLD, AB_FIXED_RETRY_DAYS
from backend.models.fallback import fallback_retry_timestamp
from backend.llm.groq_client import get_groq_client
from backend.scheduler.retry_executor import schedule_retry

logger = logging.getLogger(__name__)
UTC = pytz.timezone("UTC")
IST = pytz.timezone("Asia/Kolkata")


def verify_razorpay_signature(payload_body: bytes, signature: str, secret: str) -> bool:
    """HMAC SHA256 verification if secret is set; otherwise skip (test mode)."""
    if not secret:
        return True
    expected = hmac.new(secret.encode(), payload_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


async def handle_razorpay_webhook(raw_payload: Dict[str, Any], headers: Dict[str, str] | None = None) -> Dict[str, Any]:
    """
    Entry point called by FastAPI route.
    raw_payload: parsed JSON body
    Returns decision record (logged before execution per spec rule 4).
    """
    db = get_db()
    event_type = raw_payload.get("event") or raw_payload.get("type") or "payment.failed"

    # Log raw webhook
    try:
        db.insert_webhook_log(event_type, raw_payload, processed=False)
    except Exception as e:
        logger.warning(f"webhook_log insert failed: {e}")

    logger.info(f"Received webhook: {event_type}")

    # Extract fields — support both spec 3.2 and Razorpay's actual webhook shape
    entity = raw_payload.get("payload", {}).get("payment", {}).get("entity", {}) if "payload" in raw_payload else raw_payload

    # Try to handle flexible payload
    customer_id = (
        raw_payload.get("customer_id")
        or entity.get("customer_id")
        or entity.get("notes", {}).get("customer_id")
        or raw_payload.get("customerId")
    )
    mandate_id = raw_payload.get("mandate_id") or entity.get("mandate_id") or raw_payload.get("subscription_id")
    amount = raw_payload.get("amount") or entity.get("amount") or 0
    failure_reason = raw_payload.get("failure_reason") or entity.get("error_description") or "insufficient_funds"
    failed_at_raw = raw_payload.get("failed_at") or raw_payload.get("created_at") or entity.get("created_at")
    retry_attempt = raw_payload.get("retry_attempt_number", 0)
    max_retries = raw_payload.get("max_retries_allowed", 4)
    payment_method = raw_payload.get("payment_method") or entity.get("method")

    if not customer_id:
        logger.error("Webhook missing customer_id")
        raise ValueError("Missing customer_id in webhook payload")

    # Parse failed_at
    failed_at = _parse_timestamp(failed_at_raw)

    # Validate retry quota
    if retry_attempt >= max_retries:
        logger.warning(f"Retry cap reached for {customer_id}: {retry_attempt}/{max_retries}")
        return {
            "status": "rejected",
            "reason": "max_retries_exceeded",
            "customer_id": customer_id,
            "retry_attempt_number": retry_attempt,
            "max_retries_allowed": max_retries,
        }

    # Generate failure event id early for deterministic A/B (Feature 6)
    pre_failure_id = str(uuid.uuid4())
    h = hashlib.md5(f"{customer_id}:{pre_failure_id}".encode()).hexdigest()
    experiment_group = "A" if int(h[:8],16)%2==0 else "B"

    # Fetch history
    success_events = db.get_success_events_for_customer(customer_id)
    all_success = db.get_all_success_events()
    pop_hour = compute_population_hour_prior(all_success)

    if experiment_group == "A":
        recommended = fallback_retry_timestamp(failed_at, pop_hour)
        decision_core = {"customer_id": customer_id, "recommended_retry_at": recommended, "confidence": 0.0, "basis": "naive_fixed_schedule", "data_points_used": 0, "fallback_used": False, "details": {"ab_group":"A"}}
        explanation = "Fixed-schedule retry (control group A) — retry in 3 days, no personalization."
        llm_succeeded = False
    else:
        decision_core = detect_retry_window(
            customer_id=customer_id,
            success_events=success_events,
            failed_at=failed_at,
            payment_method=payment_method,
            population_prior_hour=pop_hour,
            all_customers_hour_prior=pop_hour,
            max_retries_allowed=max_retries,
            retry_attempt_number=retry_attempt,
        )
        groq = get_groq_client()
        explanation, llm_succeeded = groq.explain_merchant(
            customer_id=customer_id,
            recommended_retry_at=decision_core["recommended_retry_at"],
            confidence=decision_core["confidence"],
            basis=decision_core["basis"],
            data_points_used=decision_core["data_points_used"],
            fallback_used=decision_core["fallback_used"],
        )

    # Feature 4 escalation pre-check
    is_last = (retry_attempt + 1) >= max_retries
    should_escalate = is_last and float(decision_core["confidence"]) < CONFIDENCE_ESCALATION_THRESHOLD
    status = "needs_human_review" if should_escalate else "scheduled"

    # Build audit record — written BEFORE execution
    try:
        failure_event = db.insert_payment_event(
            {
                "id": pre_failure_id,
                "customer_id": customer_id,
                "mandate_id": mandate_id,
                "transaction_id": raw_payload.get("transaction_id") or entity.get("id") or f"txn_failed_{customer_id}",
                "amount": amount,
                "status": "failed",
                "failure_reason": failure_reason,
                "payment_method": payment_method or "UPI",
                "attempted_at": failed_at,
            }
        )
        failure_event_id = failure_event.get("id")
    except Exception as e:
        logger.warning(f"Failed to insert failure event: {e}")
        failure_event_id = pre_failure_id

    audit_record = {
        "customer_id": customer_id,
        "mandate_id": mandate_id,
        "original_failure_event_id": failure_event_id,
        "retry_attempt_number": retry_attempt + 1,
        "max_retries_allowed": max_retries,
        "model_basis": decision_core["basis"],
        "data_points_used": decision_core["data_points_used"],
        "confidence": decision_core["confidence"],
        "fallback_used": decision_core["fallback_used"],
        "recommended_retry_at": decision_core["recommended_retry_at"],
        "effective_retry_at": decision_core["recommended_retry_at"],
        "llm_explanation": explanation,
        "llm_call_succeeded": llm_succeeded,
        "actual_retry_outcome": "pending",
        "status": status,
        "experiment_group": experiment_group,
    }

    saved = db.insert_retry_decision(audit_record)
    logger.info(f"Logged retry decision {saved.get('decision_id')} for {customer_id} group={experiment_group} status={status} basis={decision_core['basis']} conf={decision_core['confidence']}")

    job = None
    if status != "needs_human_review":
        try:
            job = schedule_retry(saved, execute_immediately=False)
        except Exception as e:
            logger.warning(f"schedule_retry failed: {e}")
            job = None

    return {
        "status": status,
        "decision": _serialize_decision(saved),
        "experiment_group": experiment_group,
        "escalated": should_escalate,
        "job": job,
    }


def _parse_timestamp(val: Any) -> datetime:
    if val is None:
        return datetime.now(UTC)
    if isinstance(val, datetime):
        if val.tzinfo is None:
            return UTC.localize(val)
        return val
    if isinstance(val, (int, float)):
        # Razorpay uses unix seconds
        try:
            dt = datetime.fromtimestamp(float(val), tz=UTC)
            return dt
        except Exception:
            pass
    if isinstance(val, str):
        try:
            if val.isdigit():
                return datetime.fromtimestamp(int(val), tz=UTC)
            s = val.replace("Z", "+00:00")
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = UTC.localize(dt)
            return dt
        except Exception:
            pass
    return datetime.now(UTC)


def _serialize_decision(d: Dict[str, Any]) -> Dict[str, Any]:
    out = {}
    for k, v in d.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        else:
            out[k] = v
    # Ensure required fields present
    return out
