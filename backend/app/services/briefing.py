"""
Briefing service.

Live: forecast + official bulletin → Gemini Flash (Vertex AI) → Italian relazione,
via prompts.py (gemini_prompt_v1.md). The bulletin is fetched and validated BEFORE
Gemini is called: the model can phrase, never decide. If Gemini is unavailable for
any reason, the deterministic stub answers instead (model="deterministic-stub") —
an LLM outage never takes briefings down, and never changes the facts shown.
"""
from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from ..models import Briefing, BriefingRequest
from ..config import settings
from ..connectors import registry
from ..connectors.base import BulletinFetchError
from .. import store
from .. import llm, prompts

router = APIRouter(prefix="/briefing", tags=["briefing"])


@router.post("", response_model=Briefing)
def make_briefing(req: BriefingRequest) -> Briefing:
    route = store.get_route(req.route_id)
    if not route:
        raise HTTPException(404, f"route '{req.route_id}' not found")
    area = store.area_for_route(route) or {}
    country = area.get("country", settings.default_country)
    try:
        connector = registry.get_for_country(country)
    except KeyError:
        raise HTTPException(
            503, f"Nessun connettore valanghe disponibile per il paese '{country}'."
        )
    try:
        bulletin = connector.fetch(
            region=area.get("avalanche_zone", "UNKNOWN"),
            subzone=area.get("avalanche_subzone"),
        )
    except BulletinFetchError:
        raise HTTPException(
            503,
            "Impossibile recuperare il bollettino valanghe ufficiale in questo momento. "
            "Riprova più tardi.",
        )

    # bulletin can be None (off-season): the relazione is generated without the
    # avalanche section — never with a fabricated rating.

    # Weather along the route at REAL track elevations (when a GPX is ingested):
    # lets the relazione say "zero termico in vetta", not "al parcheggio".
    rw = None
    try:
        from .route_weather import route_weather as _rw_endpoint
        rw = _rw_endpoint(route["slug"])
    except Exception:
        rw = None  # no track / live weather down → relazione without the block

    # Try Gemini first (live mode). The payload contains ONLY verified structured
    # data; the enforced JSON schema keeps output predictable and auditable.
    text: str | None = None
    model = "deterministic-stub"
    try:
        payload = prompts.build_briefing_payload(route, bulletin, None, req.locale,
                                                 route_weather=rw)
        result = llm.generate_json(
            prompts.SYSTEM_INSTRUCTION, payload, prompts.BRIEFING_SCHEMA
        )
        relazione = (result.get("relazione") or "").strip()
        if relazione:
            text = relazione
            model = settings.vertex_model
    except llm.GeminiUnavailable:
        pass  # fall through to the deterministic stub

    if text is None:
        # Deterministic stand-in. Echoes official danger + source when in force;
        # out of season it simply omits the avalanche section.
        bl = (
            f"Bollettino ufficiale {bulletin.avalanche_service}: pericolo {bulletin.danger_level}/5. "
            if bulletin is not None
            else ""
        )
        text = (
            f"{route['name']} ({route['activity']}). {bl}"
            f"Esposizioni dell'itinerario: {', '.join(route['primary_aspects'])}. "
            f"Valuta con prudenza"
            + ("; il bollettino ufficiale prevale. " if bulletin is not None else ". ")
            + "[Testo dimostrativo — in produzione generato da Gemini con gemini_prompt_v1.md]"
        )

    # `model` reports the truth for the audit trail: the actual generator of `text`.
    return Briefing(
        route_id=route["slug"], locale=req.locale, text=text, bulletin=bulletin,
        generated_at=datetime.now(timezone.utc), model=model,
    )
