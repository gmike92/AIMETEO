"""
Vertex AI / Gemini client (REST, ADC auth).

One rule governs everything here: **Gemini decides what to SAY, structured data
decides what's TRUE.** This module only transports pre-assembled, grounded
payloads (built in prompts.py) and enforces JSON output via responseSchema.

Fail-safe contract: any problem (not configured, auth, network, quota, bad JSON)
raises GeminiUnavailable. Callers MUST catch it and fall back to their
deterministic stub — an LLM outage can never take down briefings or the planner,
and can never touch safety decisions (which happen before Gemini is ever called).
"""
from __future__ import annotations
import json
import logging
import httpx
from .config import settings

log = logging.getLogger(__name__)


class GeminiUnavailable(Exception):
    """Gemini could not produce a valid response; caller must use its fallback."""


def is_configured() -> bool:
    """Live Gemini requires a GCP project and mock mode off."""
    return bool(settings.gcp_project) and not settings.use_mock_data


def _access_token() -> str:
    try:
        import google.auth
        from google.auth.transport.requests import Request
    except ImportError as e:  # google-auth not installed
        raise GeminiUnavailable("google-auth non installato") from e
    try:
        creds, _ = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        creds.refresh(Request())
        return creds.token
    except Exception as e:
        raise GeminiUnavailable(f"credenziali GCP non disponibili: {e}") from e


def generate_json(
    system_instruction: str,
    user_payload: str,
    response_schema: dict,
    temperature: float = 0.2,
    timeout_s: float = 30.0,
) -> dict:
    """
    Call Gemini (Vertex AI generateContent) with grounding-by-construction:
    the model sees ONLY `user_payload`, and must answer with JSON matching
    `response_schema`. Returns the parsed dict or raises GeminiUnavailable.
    """
    if not is_configured():
        raise GeminiUnavailable(
            "Vertex non configurato (GCP_PROJECT mancante o USE_MOCK_DATA=true)"
        )
    url = (
        f"https://{settings.vertex_location}-aiplatform.googleapis.com/v1"
        f"/projects/{settings.gcp_project}/locations/{settings.vertex_location}"
        f"/publishers/google/models/{settings.vertex_model}:generateContent"
    )
    body = {
        "systemInstruction": {"parts": [{"text": system_instruction}]},
        "contents": [{"role": "user", "parts": [{"text": user_payload}]}],
        "generationConfig": {
            "temperature": temperature,
            "responseMimeType": "application/json",
            "responseSchema": response_schema,
        },
    }
    try:
        resp = httpx.post(
            url,
            json=body,
            headers={"Authorization": f"Bearer {_access_token()}"},
            timeout=timeout_s,
        )
        resp.raise_for_status()
        data = resp.json()
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        return json.loads(text)
    except GeminiUnavailable:
        raise
    except Exception as e:
        log.warning("Gemini call failed, caller will fall back: %s", e)
        raise GeminiUnavailable(str(e)) from e
