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

# Ensure .env is loaded even when this module is imported directly (e.g. via supabase_client)
try:
    from dotenv import load_dotenv

    load_dotenv()
    load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), ".env"))
except Exception:
    pass

# Preferred models in order (Groq decommissioned older llama models as of 2026)
GROQ_FALLBACK_MODELS = [
    "qwen/qwen3.8-27b",
    "openai/gpt-oss-20b",
    "openai/gpt-oss-120b",
    "allam-2-7b",
]

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
        requested = model or os.getenv("GROQ_MODEL", "qwen/qwen3.8-27b")
        # validate against known fallback list; if requested is decommissioned, map to first fallback
        decommissioned = {"llama-3.1-8b-instant", "llama3-8b-8192", "llama-3.1-70b-versatile", "mixtral-8x7b-32768", "gemma2-9b-it"}
        if requested in decommissioned:
            logger.warning(f"Model {requested} decommissioned, using fallback {GROQ_FALLBACK_MODELS[0]}")
            requested = GROQ_FALLBACK_MODELS[0]
        self.model = requested
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
        # Try primary model, then fallbacks on 404/decommission
        models_to_try = [self.model] + [m for m in GROQ_FALLBACK_MODELS if m != self.model]
        last_err = None
        for m in models_to_try:
            try:
                resp = self._client.chat.completions.create(
                    model=m,
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
                if not text:
                    raise ValueError("Empty LLM response")
                # Strip thinking tags that some models emit (e.g., Qwen3)
                if "<think>" in text:
                    # keep only after </think>
                    if "</think>" in text:
                        text = text.split("</think>", 1)[1].strip()
                logger.info(f"Groq merchant explanation ok model={m} version {PROMPT_VERSION}: {text[:80]}")
                return text, True
            except Exception as e:
                last_err = e
                # Only retry on model_not_found / decommission, otherwise break
                msg = str(e)
                if "decommissioned" in msg or "does not exist" in msg or "model_not_found" in msg or "404" in msg:
                    logger.warning(f"Groq model {m} failed, trying fallback: {e}")
                    continue
                break
        logger.warning(f"Groq call failed, using fallback: {last_err}", exc_info=True)
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
        models_to_try = [self.model] + [m for m in GROQ_FALLBACK_MODELS if m != self.model]
        last_err = None
        for m in models_to_try:
            try:
                resp = self._client.chat.completions.create(
                    model=m,
                    messages=[
                        {"role": "system", "content": GROQ_SYSTEM_PROMPT},
                        {"role": "user", "content": prompt},
                    ],
                    max_tokens=80,
                    temperature=0.5,
                )
                text = resp.choices[0].message.content.strip()
                if "<think>" in text and "</think>" in text:
                    text = text.split("</think>", 1)[1].strip()
                if len(text) > 250:
                    text = text[:247] + "..."
                if not text:
                    raise ValueError("Empty")
                return text, True
            except Exception as e:
                last_err = e
                msg = str(e)
                if "decommissioned" in msg or "does not exist" in msg or "model_not_found" in msg or "404" in msg:
                    continue
                break
        logger.warning(f"Groq customer call failed: {last_err}")
        return customer_fallback_message(recommended_retry_at), False


# Singleton helper
_client: Optional[GroqClient] = None


def get_groq_client() -> GroqClient:
    global _client
    if _client is None:
        _client = GroqClient()
    return _client
