"""
Constants — no magic numbers without a named constant.
Spec Section 11 rule #3.
"""

# Minimum data points to trust personal pattern (cold-start threshold)
MIN_DATA_POINTS_FOR_CONFIDENCE = 3

# Confidence thresholds
CONFIDENCE_LOW_THRESHOLD = 0.40
CONFIDENCE_HIGH_THRESHOLD = 0.70

# Volume normalization for confidence adjustment (thin history penalty)
CONFIDENCE_VOLUME_NORM = 8  # confidence volume-adjusted via min(1, n / NORM)

# Recency weighting
RECENCY_DECAY_LAMBDA = 0.05  # exponential decay per day; recent payments weight more
RECENCY_WEIGHTING_ENABLED = True

# Fallback defaults
FALLBACK_RETRY_DAYS = 3
FALLBACK_RETRY_HOUR_IST = 10
FALLBACK_RETRY_MINUTE_IST = 15

# Timezones
TIMEZONE_IST = "Asia/Kolkata"
TIMEZONE_UTC = "UTC"

# Retry quota awareness
QUOTA_CAP_DAYS_SINGLE_RETRY_LEFT = 3  # if only 1 retry left, don't schedule beyond failed_at + 3d

# KDE
KDE_BANDWIDTH = 0.8  # for scipy gaussian_kde stretch goal
KDE_ENABLED = True
