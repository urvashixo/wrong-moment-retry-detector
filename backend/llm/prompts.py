"""
Versioned prompt templates — Spec Section 5 + 11 rule #6.
No inline f-strings scattered; keep named versioned templates.
"""

# Prompt version tracker
PROMPT_VERSION = "v1.0.0"

# Merchant-facing audit explanation prompt
MERCHANT_PROMPT_TEMPLATE = """You are a payment operations assistant. Explain a retry decision in 1-2 sentences.

Decision:
- customer_id: {customer_id}
- recommended_retry_at: {recommended_retry_at} (IST)
- confidence: {confidence}
- basis: {basis}
- data_points_used: {data_points_used}
- fallback_used: {fallback_used}

Rules:
- Be concise (1-2 sentences max, under 40 words).
- Mention the pattern detected (basis) and confidence.
- Do NOT invent a new retry time; use exactly {recommended_retry_at}.
- Do NOT mention raw amounts or full transaction history.
- Suitable for a merchant support agent.

Example: "Retrying on Sept 3 at 10:15 AM — this customer's last 8 successful payments cluster strongly around the 2nd–4th of the month, giving high confidence (81%)."
"""

# Customer-facing notification prompt
CUSTOMER_PROMPT_TEMPLATE = """You are a helpful assistant writing a short customer notification.

Decision:
- recommended_retry_at: {recommended_retry_at} (IST)
- confidence: {confidence}
- basis: {basis}

Rules:
- Write a short, non-alarming, friendly message (1 sentence, under 25 words).
- Do NOT reveal internal confidence scores or technical basis.
- Do NOT mention failure reason in a scary way.
- Do NOT invent a new time.

Example: "Heads up — we'll automatically retry your payment on Friday, which tends to work better for your account."
"""

# System prompt for Groq
GROQ_SYSTEM_PROMPT = "You are a concise, helpful assistant. Follow the instructions exactly and keep outputs short."


def render_merchant_prompt(
    customer_id: str,
    recommended_retry_at: str,
    confidence: float,
    basis: str,
    data_points_used: int,
    fallback_used: bool,
) -> str:
    return MERCHANT_PROMPT_TEMPLATE.format(
        customer_id=customer_id,
        recommended_retry_at=recommended_retry_at,
        confidence=confidence,
        basis=basis,
        data_points_used=data_points_used,
        fallback_used=fallback_used,
    )


def render_customer_prompt(
    recommended_retry_at: str,
    confidence: float,
    basis: str,
) -> str:
    return CUSTOMER_PROMPT_TEMPLATE.format(
        recommended_retry_at=recommended_retry_at,
        confidence=confidence,
        basis=basis,
    )
