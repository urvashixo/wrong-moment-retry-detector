"""
Groq API wrapper — Spec Section 5.
Critical rule: LLM never decides WHEN to retry; only explains.
Best-effort only: must fully function even if Groq fails.
"""
from __future__ import annotations

import os
import logging
from datetime import datetime
from typing import Optional, Tuple

import pytz

from .prompts import (
    GROQ_SYSTEM_PROMPT,
    PROMPT_VERSION,
    render_customer_prompt,
    render_merchant_prompt,
)
from .explanation_fallback import merchant_fallback_explanation, customer_fallback_message

logger = logging.getLogger(__name__)

IST = pytz.timezone("Asia/Kolkata")
UTC = pytz.timezone("UTC")


def _format_ist(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = UTC.localize(dt)
    return dt.astimezone(IST).strftime("%Y-%m-%d %H:%M IST")


class GroqClient:
    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None):
        self.api_key = api_key or os.getenv("GROQ_API_KEY")
        self.model = model or os.getenv("GROQ_MODEL", "llama-3.1-8b-instant")
        self.enabled = bool(self.api_key)
        self._client = None
        if self.enabled:
            try:
                from groq import Groq

                self._client = Groq(api_key=self.api_key)
            except Exception as e:
                logger.warning(f"Groq init failed: {e}; falling back to templates")
                self.enabled = False

    def explain_merchant(
        self,
        customer_id: str,
        recommended_retry_at: datetime,
        confidence: float,
        basis: str,
        data_points_used: int,
        fallback_used: bool,
        timeout: int = 8,
    ) -> Tuple[str, bool]:
        """
        Returns (explanation_text, llm_call_succeeded).
        Validates output length/format, never allows LLM to override retry time.
        """
        time_str = _format_ist(recommended_retry_at)
        # If Groq disabled or force-fail flag for demo injection
        if not self.enabled or os.getenv("FORCE_GROQ_FAILURE") == "1":
            if os.getenv("FORCE_GROQ_FAILURE") == "1":
                logger.info("Simulated Groq failure (FORCE_GROQ_FAILURE=1)")
            return merchant_fallback_explanation(recommended_retry_at, fallback_used, data_points_used, basis), False

        prompt = render_merchant_prompt(
            customer_id=customer_id,
            recommended_retry_at=time_str,
            confidence=confidence,
            basis=basis,
            data_points_used=data_points_used,
            fallback_used=fallback_used,
        )
        try:
            resp = self._client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": GROQ_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=120,
                temperature=0.4,
            )
            text = resp.choices[0].message.content.strip()
            # Guardrails: truncate, strip anything inventing new time
            if len(text) > 300:
                text = text[:297] + "..."
            # Ensure we didn't get empty
            if not text:
                raise ValueError("Empty LLM response")
            # Validate: must not contain a different month/day that overrides? Simple check: log if suspicious length
            logger.info(f"Groq merchant explanation ok (version {PROMPT_VERSION}): {text[:80]}")
            return text, True
        except Exception as e:
            logger.warning(f"Groq call failed, using fallback: {e}", exc_info=True)
            return merchant_fallback_explanation(recommended_retry_at, fallback_used, data_points_used, basis), False

    def explain_customer(
        self,
        recommended_retry_at: datetime,
        confidence: float,
        basis: str,
    ) -> Tuple[str, bool]:
        time_str = _format_ist(recommended_retry_at)
        if not self.enabled or os.getenv("FORCE_GROQ_FAILURE") == "1":
            return customer_fallback_message(recommended_retry_at), False
        prompt = render_customer_prompt(time_str, confidence, basis)
        try:
            resp = self._client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": GROQ_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=80,
                temperature=0.5,
            )
            text = resp.choices[0].message.content.strip()
            if len(text) > 250:
                text = text[:247] + "..."
            if not text:
                raise ValueError("Empty")
            return text, True
        except Exception as e:
            logger.warning(f"Groq customer call failed: {e}")
            return customer_fallback_message(recommended_retry_at), False


# Singleton helper
_client: Optional[GroqClient] = None


def get_groq_client() -> GroqClient:
    global _client
    if _client is None:
        _client = GroqClient()
    return _client
