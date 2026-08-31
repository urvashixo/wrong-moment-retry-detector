"""
Deterministic pattern detector — Spec Section 4.
Implements Level 1 (histogram / frequency clustering) + Level 2 (weighted recency)
and optionally Level 3 (KDE) as stretch goal.

Every money-relevant function is unit-testable in isolation:
- takes a list of timestamps / event dicts
- returns a decision object with zero dependency on DB, webhook, or LLM
"""
from __future__ import annotations

import math
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pytz

from .constants import (
    CONFIDENCE_LOW_THRESHOLD,
    CONFIDENCE_VOLUME_NORM,
    FALLBACK_RETRY_HOUR_IST,
    FALLBACK_RETRY_MINUTE_IST,
    MIN_DATA_POINTS_FOR_CONFIDENCE,
    RECENCY_DECAY_LAMBDA,
    RECENCY_WEIGHTING_ENABLED,
    TIMEZONE_IST,
    TIMEZONE_UTC,
    QUOTA_CAP_DAYS_SINGLE_RETRY_LEFT,
    KDE_ENABLED,
)
from .fallback import fallback_retry_timestamp

IST = pytz.timezone(TIMEZONE_IST)
UTC = pytz.timezone(TIMEZONE_UTC)


def _ensure_aware(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return UTC.localize(dt)
    return dt


def _to_ist(dt: datetime) -> datetime:
    return _ensure_aware(dt).astimezone(IST)


def _to_utc(dt: datetime) -> datetime:
    return _ensure_aware(dt).astimezone(UTC)


def _recency_weight(attempted_at: datetime, reference: datetime) -> float:
    if not RECENCY_WEIGHTING_ENABLED:
        return 1.0
    days_ago = max(0.0, (reference - _ensure_aware(attempted_at)).total_seconds() / 86400.0)
    return math.exp(-RECENCY_DECAY_LAMBDA * days_ago)


def _volume_factor(n: int) -> float:
    """Adjust confidence downward if history is thin. Honest, data-volume-aware."""
    if n <= 0:
        return 0.0
    return min(1.0, n / CONFIDENCE_VOLUME_NORM)


def _weighted_histograms(
    success_events: List[Dict[str, Any]],
    reference: datetime,
) -> Tuple[Dict[int, float], Dict[int, float], Dict[int, float], float]:
    """
    Returns weighted histograms for dom, dow, hod plus total weight.
    Each event dict must have 'attempted_at' (datetime).
    """
    dom_w: Dict[int, float] = defaultdict(float)
    dow_w: Dict[int, float] = defaultdict(float)
    hod_w: Dict[int, float] = defaultdict(float)
    total = 0.0
    for ev in success_events:
        ts = _to_ist(ev["attempted_at"])
        w = _recency_weight(ev["attempted_at"], reference)
        total += w
        dom_w[ts.day] += w
        dow_w[ts.weekday()] += w  # 0=Mon
        hod_w[ts.hour] += w
    return dom_w, dow_w, hod_w, total


def _best_bucket(hist: Dict[int, float], total: float) -> Tuple[int, float, float]:
    """Return (bucket_key, weight_in_bucket, raw_confidence)."""
    if not hist or total == 0:
        return -1, 0.0, 0.0
    best_key = max(hist, key=lambda k: hist[k])
    best_w = hist[best_key]
    raw_conf = best_w / total if total > 0 else 0.0
    return best_key, best_w, raw_conf


def _next_dom_timestamp(target_dom: int, failed_at: datetime, hour_hint: Optional[int]) -> datetime:
    """
    Find next occurrence of target_dom after failed_at.
    Hour is set to hour_hint or FALLBACK hour in IST, then converted to UTC.
    """
    base = _to_ist(_ensure_aware(failed_at))
    # Try current month, then next months until valid date
    for month_offset in range(0, 13):
        year = base.year
        month = base.month + month_offset
        while month > 12:
            month -= 12
            year += 1
        # Check if target_dom valid for this month
        import calendar
        _, last_day = calendar.monthrange(year, month)
        if target_dom > last_day:
            continue
        candidate_ist = IST.localize(
            datetime(year, month, target_dom, hour_hint if hour_hint is not None else FALLBACK_RETRY_HOUR_IST, FALLBACK_RETRY_MINUTE_IST, 0, 0)
        )
        if candidate_ist > base:
            return candidate_ist.astimezone(UTC)
    # Fallback
    return fallback_retry_timestamp(failed_at, hour_hint)


def _next_dow_timestamp(target_dow: int, failed_at: datetime, hour_hint: Optional[int]) -> datetime:
    base = _to_ist(_ensure_aware(failed_at))
    # Find next occurrence of target_dow (0=Mon ..6=Sun)
    days_ahead = (target_dow - base.weekday()) % 7
    if days_ahead == 0:
        # If today is target dow, check if hour has passed; if so, next week
        hour = hour_hint if hour_hint is not None else FALLBACK_RETRY_HOUR_IST
        candidate = base.replace(hour=hour, minute=FALLBACK_RETRY_MINUTE_IST, second=0, microsecond=0)
        if candidate > base:
            return candidate.astimezone(UTC)
        days_ahead = 7
    candidate_date = base + timedelta(days=days_ahead)
    candidate_ist = IST.localize(
        datetime(candidate_date.year, candidate_date.month, candidate_date.day, hour_hint if hour_hint is not None else FALLBACK_RETRY_HOUR_IST, FALLBACK_RETRY_MINUTE_IST, 0, 0)
    )
    return candidate_ist.astimezone(UTC)


def _next_hod_timestamp(target_hod: int, failed_at: datetime) -> datetime:
    base = _to_ist(_ensure_aware(failed_at))
    candidate = base.replace(hour=target_hod, minute=FALLBACK_RETRY_MINUTE_IST, second=0, microsecond=0)
    if candidate <= base:
        candidate = candidate + timedelta(days=1)
    return candidate.astimezone(UTC)


def _kde_refined_day_of_month(success_events: List[Dict[str, Any]]) -> Optional[float]:
    """Stretch goal: use KDE to get smooth peak. Returns fractional day 1-31 or None."""
    if not KDE_ENABLED or len(success_events) < 5:
        return None
    try:
        from scipy.stats import gaussian_kde

        dom_values = np.array([_to_ist(ev["attempted_at"]).day for ev in success_events], dtype=float)
        if len(set(dom_values)) < 2:
            return None
        kde = gaussian_kde(dom_values, bw_method=0.8)
        xs = np.linspace(1, 31, 310)
        ys = kde(xs)
        peak = float(xs[int(np.argmax(ys))])
        return peak
    except Exception:
        return None


def detect_retry_window(
    customer_id: str,
    success_events: List[Dict[str, Any]],
    failed_at: datetime,
    payment_method: Optional[str] = None,
    population_prior_hour: Optional[int] = None,
    all_customers_hour_prior: Optional[int] = None,
    max_retries_allowed: Optional[int] = None,
    retry_attempt_number: Optional[int] = None,
    use_kde: bool = False,
) -> Dict[str, Any]:
    """
    Core deterministic model — spec 4.
    - success_events: list of dicts with at least 'attempted_at' (datetime), optionally 'payment_method'
    - failed_at: datetime of the failure
    - Returns dict with recommended_retry_at (UTC aware), confidence, basis, data_points_used, fallback_used

    Payment-method-aware: if payment_method supplied and enough method-specific data exists,
    filter to that method (spec extra feature #2).
    Retry-quota-aware: if max_retries_allowed / retry_attempt_number supplied, caps far-future windows (spec #3).
    """
    failed_at = _ensure_aware(failed_at)
    n_total = len(success_events)

    # Payment-method-aware filtering (only if we have sufficient method-specific history)
    original_events = success_events
    if payment_method is not None:
        method_events = [e for e in success_events if e.get("payment_method") == payment_method]
        if len(method_events) >= MIN_DATA_POINTS_FOR_CONFIDENCE:
            success_events = method_events

    n = len(success_events)

    # Cold-start fallback
    if n < MIN_DATA_POINTS_FOR_CONFIDENCE:
        # Use population prior if available, else default
        pop_hour = all_customers_hour_prior if all_customers_hour_prior is not None else population_prior_hour
        retry_at = fallback_retry_timestamp(failed_at, pop_hour)
        # Quota cap still applies
        retry_at = _apply_quota_cap(retry_at, failed_at, max_retries_allowed, retry_attempt_number)
        return {
            "customer_id": customer_id,
            "recommended_retry_at": retry_at,
            "confidence": round(0.2 + 0.1 * min(n, 2) / 2, 3),  # honest low confidence: 0.2-0.3
            "basis": "fallback_default",
            "data_points_used": n,
            "fallback_used": True,
            "details": {
                "fallback_reason": f"only {n} successful payments, need {MIN_DATA_POINTS_FOR_CONFIDENCE}+",
                "total_events_before_filter": n_total,
                "payment_method_filtered": payment_method if success_events is not original_events else None,
            },
        }

    # Build weighted histograms
    reference = failed_at
    dom_w, dow_w, hod_w, total_w = _weighted_histograms(success_events, reference)

    dom_key, dom_w_best, dom_raw = _best_bucket(dom_w, total_w)
    dow_key, dow_w_best, dow_raw = _best_bucket(dow_w, total_w)
    hod_key, hod_w_best, hod_raw = _best_bucket(hod_w, total_w)

    vol_factor = _volume_factor(n)

    candidates = [
        ("day_of_month_cluster", dom_key, dom_raw, dom_w, FALLBACK_RETRY_HOUR_IST),
        ("day_of_week_cluster", dow_key, dow_raw, dow_w, None),
        ("hour_of_day_cluster", hod_key, hod_raw, hod_w, None),
    ]
    # Compute volume-adjusted confidence per dimension
    scored = []
    for basis_name, key, raw, hist, _ in candidates:
        adj_conf = raw * vol_factor
        # Additional adjustment: if histogram is flat (many buckets close), reduce confidence?
        # We approximate by entropy: if best bucket not dominant, lower confidence slightly.
        # Simple: if raw <0.4, already low.
        scored.append((adj_conf, basis_name, key, raw))

    scored.sort(reverse=True, key=lambda x: x[0])
    best_adj_conf, best_basis, best_key, best_raw = scored[0]

    # Determine hour_hint: most common hour
    hod_best_key = hod_key
    hour_hint = int(hod_best_key) if isinstance(hod_best_key, int) and 0 <= hod_best_key <= 23 else None

    # Optionally refine with KDE for dom
    kde_peak = None
    if use_kde and best_basis == "day_of_month_cluster":
        kde_peak = _kde_refined_day_of_month(success_events)
        if kde_peak is not None:
            best_basis = "day_of_month_kde"
            # kde_peak fractional, round to nearest int for dom selection
            best_key = int(round(kde_peak))

    # Build recommended timestamp
    if "day_of_month" in best_basis:
        recommended = _next_dom_timestamp(int(best_key), failed_at, hour_hint)
    elif "day_of_week" in best_basis:
        recommended = _next_dow_timestamp(int(best_key), failed_at, hour_hint)
    else:  # hour_of_day
        recommended = _next_hod_timestamp(int(best_key), failed_at)

    # Quota awareness
    recommended_before_quota = recommended
    recommended = _apply_quota_cap(recommended, failed_at, max_retries_allowed, retry_attempt_number)
    quota_capped = recommended != recommended_before_quota
    if quota_capped:
        best_basis = best_basis + "_quota_capped"

    # Confidence-based routing marker (spec extra #5)
    confidence = round(float(max(0.0, min(1.0, best_adj_conf))), 3)
    # If confidence very low even with data, mark routing suggestion (but still return decision)
    routing_hint = "standard_schedule" if confidence < CONFIDENCE_LOW_THRESHOLD else "smart_retry"

    # Ensure we include basis and confidence always (spec rule 11.4)
    result: Dict[str, Any] = {
        "customer_id": customer_id,
        "recommended_retry_at": recommended,  # UTC aware
        "confidence": confidence,
        "basis": best_basis,
        "data_points_used": n,
        "fallback_used": False,
        "details": {
            "dom_best": {"bucket": dom_key, "raw_confidence": round(dom_raw, 3)},
            "dow_best": {"bucket": dow_key, "raw_confidence": round(dow_raw, 3)},
            "hod_best": {"bucket": hod_key, "raw_confidence": round(hod_raw, 3)},
            "volume_factor": round(vol_factor, 3),
            "routing_hint": routing_hint,
            "hour_hint": hour_hint,
            "kde_peak": kde_peak,
            "quota_capped": quota_capped,
            "payment_method_filtered": payment_method if success_events is not original_events else None,
        },
    }
    return result


def _apply_quota_cap(
    recommended: datetime,
    failed_at: datetime,
    max_retries_allowed: Optional[int],
    retry_attempt_number: Optional[int],
) -> datetime:
    if max_retries_allowed is None or retry_attempt_number is None:
        return recommended
    retries_remaining = max_retries_allowed - retry_attempt_number
    if retries_remaining <= 1:
        # If only one retry left, cap to +QUOTA_CAP_DAYS_SINGLE_RETRY_LEFT
        cap = fallback_retry_timestamp(failed_at, None)  # +3 days at default hour
        # Actually compute cap as failed_at + quota_days (preserve hour from fallback)
        if recommended > cap:
            return cap
    return recommended


def compute_population_hour_prior(all_success_events: List[Dict[str, Any]]) -> Optional[int]:
    """Compute most common successful hour across ALL customers (population prior for cold start)."""
    if not all_success_events:
        return None
    hours = [_to_ist(ev["attempted_at"]).hour for ev in all_success_events if ev.get("attempted_at")]
    if not hours:
        return None
    most_common = Counter(hours).most_common(1)
    return most_common[0][0] if most_common else None
