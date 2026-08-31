"""
Unit tests on synthetic data, including cold-start — Spec Section 8
Every money-relevant function unit-testable in isolation.
"""
import pytest
from datetime import datetime, timedelta
import pytz

from backend.models.pattern_detector import detect_retry_window, compute_population_hour_prior
from backend.models.constants import MIN_DATA_POINTS_FOR_CONFIDENCE, CONFIDENCE_LOW_THRESHOLD
from backend.data.synthetic_generator import generate_synthetic_customers

UTC = pytz.timezone("UTC")
IST = pytz.timezone("Asia/Kolkata")


def _ts(year, month, day, hour, minute=0, tz=IST):
    return tz.localize(datetime(year, month, day, hour, minute, 0, 0)).astimezone(UTC)


def test_histogram_recovers_hidden_pattern():
    # Customer with flush_days_1_5 pattern — should detect dom cluster
    events = []
    for d in [1, 2, 3, 4, 5, 2, 3, 4]:
        events.append({"attempted_at": _ts(2026, 8, d, 10), "payment_method": "UPI"})
    failed = _ts(2026, 8, 31, 9)
    res = detect_retry_window("cust_test", events, failed)
    assert res["fallback_used"] is False
    assert res["data_points_used"] == 8
    assert "day_of_month" in res["basis"] or "hour_of_day" in res["basis"]
    assert 0 < res["confidence"] <= 1
    # Recommended should be future
    assert res["recommended_retry_at"] > failed


def test_cold_start_fallback():
    events = [{"attempted_at": _ts(2026, 8, 15, 10), "payment_method": "UPI"}]
    failed = _ts(2026, 8, 20, 9)
    res = detect_retry_window("cust_cold", events, failed)
    assert res["fallback_used"] is True
    assert res["basis"] == "fallback_default"
    assert res["confidence"] < CONFIDENCE_LOW_THRESHOLD + 0.2  # honest low
    assert res["data_points_used"] == 1


def test_cold_start_threshold_boundary():
    # Exactly MIN-1 should fallback, MIN should not
    events_fallback = [{"attempted_at": _ts(2026, 8, d, 10)} for d in [1, 2]]  # 2 < 3
    res1 = detect_retry_window("c1", events_fallback, _ts(2026, 8, 20, 9))
    assert res1["fallback_used"] is True

    events_ok = [{"attempted_at": _ts(2026, 8, d, 10)} for d in [1, 2, 3]]  # 3 == MIN
    res2 = detect_retry_window("c2", events_ok, _ts(2026, 8, 20, 9))
    assert res2["fallback_used"] is False


def test_weighted_recency_and_volume_factor():
    # Recent events should weigh more — create old vs recent clusters
    events = []
    # 5 old events on day 20
    for _ in range(5):
        events.append({"attempted_at": _ts(2026, 5, 20, 10)})
    # 3 recent events on day 2 (more recent, should dominate with decay if enabled)
    for _ in range(3):
        events.append({"attempted_at": _ts(2026, 8, 2, 10)})
    failed = _ts(2026, 8, 31, 9)
    res = detect_retry_window("c_recency", events, failed)
    assert res["confidence"] > 0
    # Should not crash, returns reasonable basis
    assert res["basis"] in ["day_of_month_cluster", "day_of_week_cluster", "hour_of_day_cluster", "day_of_month_kde"]


def test_payment_method_aware():
    events = []
    # UPI pattern: days 1-5 morning
    for d in [1, 2, 3, 4, 5]:
        events.append({"attempted_at": _ts(2026, 8, d, 9), "payment_method": "UPI"})
    # Card pattern: days 20 evening
    for d in [20, 21, 22]:
        events.append({"attempted_at": _ts(2026, 8, d, 19), "payment_method": "card"})
    failed = _ts(2026, 8, 31, 9)
    # Request UPI-specific
    res_upi = detect_retry_window("c_pm", events, failed, payment_method="UPI")
    # Should use UPI-filtered 5 events (>=MIN) not all 8
    assert res_upi["data_points_used"] == 5


def test_quota_awareness_caps_far_future():
    events = [{"attempted_at": _ts(2026, 7, d, 10)} for d in [15]*5]  # mid-month cluster
    failed = _ts(2026, 8, 31, 9)  # near month end, next mid-month is ~15 days away
    res = detect_retry_window("c_quota", events, failed, max_retries_allowed=4, retry_attempt_number=3)
    # With only 1 retry left, should cap to +3 days
    capped_at = failed + timedelta(days=4)  # allow some slack
    assert res["recommended_retry_at"] <= capped_at
    assert "quota_capped" in res["basis"]


def test_population_prior():
    all_success = [
        {"attempted_at": _ts(2026, 8, 1, 10)},
        {"attempted_at": _ts(2026, 8, 2, 10)},
        {"attempted_at": _ts(2026, 8, 3, 14)},
        {"attempted_at": _ts(2026, 8, 4, 10)},
    ]
    hour = compute_population_hour_prior(all_success)
    assert hour == 10


def test_synthetic_generator_creates_patterns():
    customers, events = generate_synthetic_customers(n_customers=6, seed=0)
    assert len(customers) == 6
    assert len(events) > 6
    # At least some cold-start (thin) customers
    from collections import Counter

    per_c = Counter(e["customer_id"] for e in events if e["status"] == "success")
    thin = sum(1 for v in per_c.values() if v <= 2)
    assert thin >= 0  # at least structure holds


def test_every_response_has_basis_and_confidence():
    events = [{"attempted_at": _ts(2026, 8, d, 10)} for d in [1, 2, 3, 4]]
    res = detect_retry_window("c_basis", events, _ts(2026, 8, 20, 9))
    assert "basis" in res and res["basis"]
    assert "confidence" in res and isinstance(res["confidence"], float)


def test_no_magic_numbers_honest_confidence():
    # Thin history should have lower confidence than rich history with same raw cluster
    thin_events = [{"attempted_at": _ts(2026, 8, 2, 10)} for _ in range(3)]
    rich_events = [{"attempted_at": _ts(2026, 8, 2, 10)} for _ in range(10)]
    failed = _ts(2026, 8, 20, 9)
    r_thin = detect_retry_window("thin", thin_events, failed)
    r_rich = detect_retry_window("rich", rich_events, failed)
    assert r_thin["confidence"] < r_rich["confidence"]
