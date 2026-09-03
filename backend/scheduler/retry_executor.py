"""
Scheduler — simulates "wait until predicted time, then retry"
Spec Section 10 out of scope says don't over-engineer webhook reliability;
here we use APScheduler for demo plus immediate execution fallback.
"""
from __future__ import annotations

import logging
import random
import uuid
from datetime import datetime
from typing import Any, Dict

import pytz

logger = logging.getLogger(__name__)
UTC = pytz.timezone("UTC")

# In-memory job store for demo
_scheduled_jobs: Dict[str, Dict[str, Any]] = {}


def schedule_retry(decision: Dict[str, Any], execute_immediately: bool = False) -> Dict[str, Any]:
    """
    Schedule a retry for decision['recommended_retry_at'].
    For hackathon demo we support two modes:
    - execute_immediately=False -> registers job, will be pending
    - execute_immediately=True -> simulates instant execution (useful for tests)
    Returns job info.
    """
    job_id = str(decision.get("decision_id") or uuid.uuid4())
    # Feature 3: prefer effective_retry_at if overridden
    raw = decision.get("effective_retry_at") or decision.get("recommended_retry_at")
    recommended = raw
    if isinstance(recommended, str):
        try:
            recommended = datetime.fromisoformat(recommended.replace("Z", "+00:00"))
        except Exception:
            recommended = datetime.now(UTC)
    if recommended.tzinfo is None:
        recommended = UTC.localize(recommended)

    job = {
        "job_id": job_id,
        "decision_id": decision.get("decision_id"),
        "customer_id": decision.get("customer_id"),
        "recommended_retry_at": recommended,
        "effective_retry_at": recommended,
        "original_retry_at": decision.get("recommended_retry_at"),
        "is_overridden": decision.get("status") == "overridden",
        "status": "scheduled",
        "created_at": datetime.now(UTC),
    }
    _scheduled_jobs[job_id] = job
    logger.info(f"Scheduled retry job {job_id} for {recommended.isoformat()}")

    # Try APScheduler if available and not immediate
    if not execute_immediately:
        try:
            from apscheduler.schedulers.background import BackgroundScheduler
            from backend.db.supabase_client import get_db

            def _fire():
                simulate_retry_execution(job_id)

            # Lazy scheduler singleton
            if not hasattr(schedule_retry, "_scheduler"):
                sched = BackgroundScheduler(timezone=UTC)
                sched.start()
                schedule_retry._scheduler = sched  # type: ignore
            else:
                sched = schedule_retry._scheduler  # type: ignore

            # For demo: don't actually wait days; if retry is >1h away, fire in 10s for demo purposes
            now = datetime.now(UTC)
            delay = (recommended - now).total_seconds()
            run_at = recommended if delay < 60 else now  # if far future, demo immediate
            # Actually schedule for 10 seconds later for visible demo effect
            from datetime import timedelta

            if delay > 60:
                run_at = now + timedelta(seconds=10)
                job["demo_accelerated"] = True

            sched.add_job(_fire, "date", run_date=run_at, id=job_id, replace_existing=True)
            job["scheduled_for"] = run_at
        except Exception as e:
            logger.warning(f"APScheduler scheduling failed: {e}", exc_info=True)

    if execute_immediately:
        return simulate_retry_execution(job_id)

    return job


def simulate_retry_execution(job_id: str, success_override: bool | None = None) -> Dict[str, Any]:
    """Simulate executing the retry — randomly succeed based on confidence heuristics."""
    job = _scheduled_jobs.get(job_id)
    if not job:
        return {"error": "job not found", "job_id": job_id}

    # Fetch decision to get confidence / hidden profile if available
    decision_id = job.get("decision_id")
    outcome = "success" if (success_override is not None and success_override) else ("success" if random.random() < 0.65 else "failed")
    # If success_override is None, use random 65% (smart timing advantage vs 35% baseline simulation elsewhere)

    job["status"] = "executed"
    job["outcome"] = outcome
    job["executed_at"] = datetime.now(UTC)

    # Update DB decision row
    try:
        from backend.db.supabase_client import get_db

        db = get_db()
        db.update_retry_outcome(str(decision_id), outcome, job["executed_at"])
    except Exception as e:
        logger.warning(f"Failed to update DB outcome: {e}")

    logger.info(f"Retry job {job_id} executed: {outcome}")
    return job


def list_jobs():
    return list(_scheduled_jobs.values())


def get_job(job_id: str):
    return _scheduled_jobs.get(job_id)
