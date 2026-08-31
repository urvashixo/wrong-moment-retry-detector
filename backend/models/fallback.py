"""
Cold-start fallback logic — Section 4 + Section 11.
Mandatory fallback when < MIN_DATA_POINTS_FOR_CONFIDENCE.
"""
from datetime import datetime, timedelta
import pytz

from .constants import (
    FALLBACK_RETRY_DAYS,
    FALLBACK_RETRY_HOUR_IST,
    FALLBACK_RETRY_MINUTE_IST,
    TIMEZONE_IST,
    TIMEZONE_UTC,
)

IST = pytz.timezone(TIMEZONE_IST)
UTC = pytz.timezone(TIMEZONE_UTC)


def fallback_retry_timestamp(failed_at: datetime, population_prior_hour: int | None = None) -> datetime:
    """
    Return a sensible fallback retry timestamp.
    - Default: failed_at + FALLBACK_RETRY_DAYS at FALLBACK_RETRY_HOUR_IST:FALLBACK_RETRY_MINUTE_IST IST
    - If population_prior_hour is available (most common successful hour across ALL customers),
      use that hour instead.
    Timestamps: input may be naive or aware; output is UTC-aware.
    """
    if failed_at.tzinfo is None:
        failed_at = UTC.localize(failed_at)
    # Convert to IST for calendar math
    failed_ist = failed_at.astimezone(IST)
    retry_ist_naive = (failed_ist + timedelta(days=FALLBACK_RETRY_DAYS)).replace(
        hour=population_prior_hour if population_prior_hour is not None else FALLBACK_RETRY_HOUR_IST,
        minute=FALLBACK_RETRY_MINUTE_IST,
        second=0,
        microsecond=0,
    )
    # Localize correctly handling DST (IST has no DST but use localize for safety)
    # retry_ist_naive is already aware? We constructed via replace on aware datetime so it's aware.
    # Ensure it's IST
    if retry_ist_naive.tzinfo is None:
        retry_ist = IST.localize(retry_ist_naive)
    else:
        retry_ist = retry_ist_naive
    return retry_ist.astimezone(UTC)


def fallback_explanation(data_points_used: int) -> str:
    return (
        f"Insufficient history ({data_points_used} successful payments, "
        f"need {3}+). Falling back to default retry window."
    )
