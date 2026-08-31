"""
Synthetic data generator — Spec Section 3.1
Generates fake customer histories with hidden liquidity profiles.
NEVER leaks hidden pattern to detector; detector only sees timestamps.
"""
from __future__ import annotations

import calendar
import random
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Tuple

import pytz

TIMEZONE_IST = "Asia/Kolkata"
TIMEZONE_UTC = "UTC"
IST = pytz.timezone(TIMEZONE_IST)
UTC = pytz.timezone(TIMEZONE_UTC)

# Hidden liquidity profiles — used only for generation & verification
HIDDEN_PROFILES = [
    "flush_days_1_5",       # salaried: flush 1st-5th of month, 09:00-11:00 IST
    "flush_every_friday",   # gig: every Friday
    "flush_after_6pm",      # after 6pm weekdays
    "flush_mid_month_10_15",# days 10-15 mid-month
    "flush_morning_only",   # 8am-11am any day before spending
    "erratic",              # no strong pattern (low confidence test)
]

PAYMENT_METHODS = ["UPI", "card", "netbanking"]
FAILURE_REASONS = ["insufficient_funds", "card_declined", "timeout"]


def _random_amount() -> int:
    return random.choice([199, 299, 499, 999, 1499, 1999, 2999, 4999])


def _to_ist(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = UTC.localize(dt)
    return dt.astimezone(IST)


def _to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        dt = IST.localize(dt)
    return dt.astimezone(UTC)


def _generate_timestamp_for_profile(
    profile: str,
    reference_month: datetime,
    jitter_hours: float = 2.0,
) -> datetime:
    """Generate a successful payment timestamp that follows the hidden profile."""
    # reference_month is in IST
    base = _to_ist(reference_month)
    year, month = base.year, base.month

    if profile == "flush_days_1_5":
        day = random.randint(1, 5)
        hour = random.randint(9, 11)
    elif profile == "flush_every_friday":
        # Find a Friday in this month
        # 4=Friday (0=Mon)
        candidates = [d for d in range(1, calendar.monthrange(year, month)[1] + 1) if datetime(year, month, d).weekday() == 4]
        day = random.choice(candidates)
        hour = random.randint(10, 16)
    elif profile == "flush_after_6pm":
        day = random.randint(1, calendar.monthrange(year, month)[1])
        # Ensure weekday
        # try to pick weekday 0-4
        for _ in range(10):
            d = random.randint(1, calendar.monthrange(year, month)[1])
            if datetime(year, month, d).weekday() < 5:
                day = d
                break
        hour = random.randint(18, 21)
    elif profile == "flush_mid_month_10_15":
        day = random.randint(10, 15)
        hour = random.randint(9, 14)
    elif profile == "flush_morning_only":
        day = random.randint(1, calendar.monthrange(year, month)[1])
        hour = random.randint(8, 11)
    elif profile == "erratic":
        day = random.randint(1, calendar.monthrange(year, month)[1])
        hour = random.randint(0, 23)
    else:
        day = random.randint(1, calendar.monthrange(year, month)[1])
        hour = random.randint(9, 17)

    minute = random.randint(0, 59)
    # Add jitter: sometimes push outside ideal window to inject noise (20% noise)
    if random.random() < 0.2:
        hour = random.randint(0, 23)
        day = random.randint(1, calendar.monthrange(year, month)[1])
        # ensure valid
        _, last = calendar.monthrange(year, month)
        day = min(day, last)

    # Small jitter in minutes
    jitter_minutes = random.randint(-int(jitter_hours * 60), int(jitter_hours * 60))
    try:
        ts_ist = IST.localize(datetime(year, month, day, hour, minute, 0, 0))
    except Exception:
        # Invalid date fallback
        ts_ist = IST.localize(datetime(year, month, 1, hour, minute, 0, 0))
    ts_ist = ts_ist + timedelta(minutes=jitter_minutes)
    # Ensure still in same month? Keep it loosely
    return ts_ist.astimezone(UTC)


def generate_synthetic_customers(
    n_customers: int = 20,
    cold_start_ratio: float = 0.25,
    seed: int | None = 42,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    """
    Returns (customers, payment_events)
    - customers: list of {customer_id, hidden_profile_tag}
    - payment_events: list of events with spec 3.1 schema
    """
    if seed is not None:
        random.seed(seed)

    customers: List[Dict[str, Any]] = []
    events: List[Dict[str, Any]] = []

    now_utc = datetime.now(UTC)
    now_ist = now_utc.astimezone(IST)

    for i in range(n_customers):
        cid = f"cust_{i+1:03d}_{uuid.uuid4().hex[:4]}"
        profile = random.choice(HIDDEN_PROFILES)
        customers.append({"customer_id": cid, "hidden_profile_tag": profile})

        # Determine number of successful events
        is_cold_start = random.random() < cold_start_ratio
        if is_cold_start:
            n_success = random.randint(1, 2)
        else:
            n_success = random.randint(5, 12)

        # Generate successful events spread over last 3 months
        for j in range(n_success):
            # Spread across last 90 days
            months_ago = random.randint(0, 2)
            # Compute reference month
            month = now_ist.month - months_ago
            year = now_ist.year
            while month <= 0:
                month += 12
                year -= 1
            ref = IST.localize(datetime(year, month, 15, 12, 0, 0))
            ts = _generate_timestamp_for_profile(profile, ref)
            # Ensure not in future
            if ts > now_utc:
                ts = now_utc - timedelta(days=random.randint(1, 10), hours=random.randint(1, 12))
            events.append({
                "id": str(uuid.uuid4()),
                "customer_id": cid,
                "mandate_id": f"mandate_{cid}",
                "transaction_id": f"txn_{uuid.uuid4().hex[:8]}",
                "amount": _random_amount(),
                "status": "success",
                "failure_reason": None,
                "payment_method": random.choice(PAYMENT_METHODS),
                "attempted_at": ts,
                "created_at": ts,
            })

        # Generate some failed events (1-3 per customer)
        n_failed = random.randint(0, 3)
        for _ in range(n_failed):
            # Failures are more random, often outside liquidity window
            day = random.randint(1, calendar.monthrange(now_ist.year, now_ist.month)[1])
            hour = random.randint(0, 23)
            # Bias failures to off-window times for realism
            ts_ist = IST.localize(datetime(now_ist.year, now_ist.month, day, hour, random.randint(0, 59), 0, 0))
            if ts_ist > now_ist:
                ts_ist = now_ist - timedelta(days=random.randint(0, 2))
            ts = ts_ist.astimezone(UTC)
            # Choose failure reason: mostly insufficient_funds
            reason = random.choices(FAILURE_REASONS, weights=[0.7, 0.2, 0.1])[0]
            events.append({
                "id": str(uuid.uuid4()),
                "customer_id": cid,
                "mandate_id": f"mandate_{cid}",
                "transaction_id": f"txn_{uuid.uuid4().hex[:8]}",
                "amount": _random_amount(),
                "status": "failed",
                "failure_reason": reason,
                "payment_method": random.choice(PAYMENT_METHODS),
                "attempted_at": ts,
                "created_at": ts,
            })

    # Sort events by attempted_at
    events.sort(key=lambda e: e["attempted_at"])
    return customers, events


def generate_failure_batch(
    customers: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    n_failures: int = 10,
    seed: int | None = None,
) -> List[Dict[str, Any]]:
    """Generate a live failure batch (spec 3.2) triggered for demo baseline comparison."""
    if seed is not None:
        random.seed(seed)
    batch = []
    now = datetime.now(UTC)
    for _ in range(n_failures):
        cust = random.choice(customers)
        batch.append({
            "customer_id": cust["customer_id"],
            "mandate_id": f"mandate_{cust['customer_id']}",
            "subscription_id": f"sub_{cust['customer_id']}",
            "amount": _random_amount(),
            "failure_reason": "insufficient_funds",
            "failed_at": now - timedelta(hours=random.randint(0, 12)),
            "retry_attempt_number": random.randint(0, 2),
            "max_retries_allowed": 4,
            "hidden_profile": cust.get("hidden_profile_tag"),
        })
    return batch


def simulate_baseline_vs_smart(
    customers: List[Dict[str, Any]],
    events: List[Dict[str, Any]],
    n_sim: int = 50,
    seed: int | None = 123,
) -> Dict[str, Any]:
    """
    Simulate baseline (fixed +3d retry) vs smart timing on same synthetic batch.
    Returns aggregate metrics per spec 6.2. This is the single most important demo artifact.
    """
    if seed is not None:
        random.seed(seed)
    import collections
    from backend.models.pattern_detector import detect_retry_window, compute_population_hour_prior

    # Build per-customer success events
    per_customer: Dict[str, List[Dict[str, Any]]] = collections.defaultdict(list)
    all_success = []
    for e in events:
        if e["status"] == "success":
            per_customer[e["customer_id"]].append(e)
            all_success.append(e)
    pop_hour = compute_population_hour_prior(all_success)

    total = n_sim
    smart_recovered = 0
    baseline_recovered = 0
    smart_amount = 0
    baseline_amount = 0
    cold_start_count = 0

    for _ in range(n_sim):
        cust = random.choice(customers)
        hidden = cust.get("hidden_profile_tag")
        amount = _random_amount()
        failed_at = datetime.now(UTC) - timedelta(days=random.randint(0, 2))

        succ = per_customer.get(cust["customer_id"], [])
        decision = detect_retry_window(
            customer_id=cust["customer_id"],
            success_events=succ,
            failed_at=failed_at,
            population_prior_hour=pop_hour,
            all_customers_hour_prior=pop_hour,
            max_retries_allowed=4,
            retry_attempt_number=1,
        )
        if decision["fallback_used"]:
            cold_start_count += 1

        # Simulate whether retry would succeed: check if retry timestamp falls inside hidden profile window
        smart_retry = decision["recommended_retry_at"]
        baseline_retry = failed_at + timedelta(days=3)
        # Set baseline hour to 10:15 IST
        baseline_ist = _to_ist(baseline_retry).replace(hour=10, minute=15, second=0, microsecond=0)
        baseline_retry = baseline_ist.astimezone(UTC)

        def _would_succeed(retry_ts: datetime, profile: str) -> bool:
            rt_ist = _to_ist(retry_ts)
            if profile == "flush_days_1_5":
                ok = 1 <= rt_ist.day <= 5 and 9 <= rt_ist.hour <= 11
            elif profile == "flush_every_friday":
                ok = rt_ist.weekday() == 4
            elif profile == "flush_after_6pm":
                ok = rt_ist.weekday() < 5 and 18 <= rt_ist.hour <= 21
            elif profile == "flush_mid_month_10_15":
                ok = 10 <= rt_ist.day <= 15
            elif profile == "flush_morning_only":
                ok = 8 <= rt_ist.hour <= 11
            else:  # erratic
                ok = random.random() < 0.3
            # Add noise: even in window, 80% succeed; outside, 15% succeed
            if ok:
                return random.random() < 0.80
            else:
                return random.random() < 0.15

        if _would_succeed(smart_retry, hidden):
            smart_recovered += 1
            smart_amount += amount
        if _would_succeed(baseline_retry, hidden):
            baseline_recovered += 1
            baseline_amount += amount

    improvement = 0.0
    if baseline_recovered > 0:
        improvement = round((smart_recovered - baseline_recovered) / baseline_recovered * 100, 1)
    elif smart_recovered > 0:
        improvement = 100.0

    return {
        "batch_id": f"demo_batch_{uuid.uuid4().hex[:6]}",
        "total_failed_payments": total,
        "retried_with_smart_timing": total,
        "recovered_count": smart_recovered,
        "recovered_amount_total": smart_amount,
        "baseline_fixed_schedule_recovered_count": baseline_recovered,
        "baseline_fixed_schedule_recovered_amount": baseline_amount,
        "improvement_pct": improvement,
        "cold_start_fallback_count": cold_start_count,
    }
