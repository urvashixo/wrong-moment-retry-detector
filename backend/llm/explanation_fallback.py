"""
Hardcoded template fallback if Groq call fails — Spec Section 5 guardrail.
"""
from datetime import datetime
import pytz

IST = pytz.timezone("Asia/Kolkata")
UTC = pytz.timezone("UTC")


def _format_ist(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = UTC.localize(dt)
    ist = dt.astimezone(IST)
    return ist.strftime("%b %d at %I:%M %p IST")


def merchant_fallback_explanation(recommended_retry_at: datetime, fallback_used: bool, data_points_used: int, basis: str) -> str:
    time_str = _format_ist(recommended_retry_at)
    if fallback_used:
        return f"Retry scheduled for {time_str} based on your payment history. (Insufficient history: {data_points_used} data points; using default window.)"
    # Generic explainable fallback
    basis_human = basis.replace("_", " ").replace(" cluster", "")
    return f"Retry scheduled for {time_str} based on {basis_human} pattern from {data_points_used} successful payments."


def customer_fallback_message(recommended_retry_at: datetime) -> str:
    time_str = _format_ist(recommended_retry_at)
    return f"Heads up — we'll retry your payment on {time_str}, which tends to work better for your account."
