"""
Prompt assembly for Gemini — the ONLY place where model-facing text is built.

Implements trip-planner/gemini_prompt_v1.md. Every value in a payload comes
verbatim from structured data (route store, official bulletin, forecast
service). Missing data is rendered as "non disponibile" — never invented.
The official danger rating is passed through with source + link and the system
instruction forbids the model from authoring its own.
"""
from __future__ import annotations
import json
from typing import Optional
from .models import Bulletin, PlanRequest, PointForecast

# ── System instructions (from gemini_prompt_v1.md) ─────────────────

SYSTEM_INSTRUCTION = """Agisci come una Guida Alpina UIAGM esperta che scrive una relazione di gita.
Tono: asciutto, tecnico, prudente, in italiano. Niente entusiasmo da brochure.

REGOLE ASSOLUTE (non derogabili):
1. Usa ESCLUSIVAMENTE i dati forniti nel contesto. Non inventare itinerari, rifugi,
   quote, orari o gradi di difficoltà. Se un dato non c'è, scrivi "non disponibile".
2. Non esprimere MAI un tuo grado di pericolo valanghe. Riporta solo il grado ufficiale
   AINEVA/Meteomont presente nel contesto, sempre con la fonte e il link.
3. Il piano è un SUPPORTO ALLA DECISIONE, non una raccomandazione. La responsabilità
   finale è del capogita. Il bollettino ufficiale prevale sempre.
4. Metti sempre in evidenza il bollettino valanghe ufficiale e i punti decisionali.
5. Rispondi SOLO con il JSON richiesto. Nessun testo fuori dal JSON."""

# ── Enforced output schemas (Vertex responseSchema, OpenAPI subset) ─

BRIEFING_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "relazione": {
            "type": "STRING",
            "description": "Relazione tecnica in italiano: condizioni, bollettino "
                           "ufficiale con fonte, esposizioni, prudenza.",
        },
    },
    "required": ["relazione"],
}

RENDER_TRIP_PLAN_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "titolo": {"type": "STRING"},
        "itinerario": {"type": "STRING"},
        "timing": {
            "type": "OBJECT",
            "properties": {
                "alba": {"type": "STRING"},
                "partenza_consigliata": {"type": "STRING"},
                "vetta_entro": {"type": "STRING"},
                "rientro_stimato": {"type": "STRING"},
            },
        },
        "condizioni": {"type": "STRING"},
        "bollettino_valanghe": {
            "type": "OBJECT",
            "properties": {
                "grado_ufficiale": {"type": "STRING"},
                "fonte": {"type": "STRING"},
                "link": {"type": "STRING"},
                "sintesi": {"type": "STRING"},
            },
            "required": ["grado_ufficiale", "fonte", "link"],
        },
        "equipaggiamento_consigliato": {"type": "ARRAY", "items": {"type": "STRING"}},
        "punti_decisionali": {"type": "ARRAY", "items": {"type": "STRING"}},
        "piano_b": {"type": "STRING"},
        "allerta_sicurezza": {"type": "STRING", "nullable": True},
    },
    "required": ["titolo", "itinerario", "bollettino_valanghe"],
}

_ND = "non disponibile"


def _fmt(value) -> str:
    return _ND if value in (None, "", []) else str(value)


def _forecast_block(fc: Optional[PointForecast]) -> str:
    if fc is None:
        return f"  METEO sull'itinerario: {_ND} (servizio meteo non collegato)"
    return (
        f"  METEO sull'itinerario ({fc.valid_at.date().isoformat()}, fonte {fc.source}): "
        f"zero termico {fc.freezing_level_m} m, vento {fc.wind_avg_kmh} km/h "
        f"(raffiche {fc.wind_gust_kmh}), precip {fc.precip_mm} mm, "
        f"temporali {round(fc.thunderstorm_prob * 100)}%"
    )


def route_context(route: dict, bulletin: Optional[Bulletin],
                  forecast: Optional[PointForecast]) -> str:
    """One candidate block of the context payload — all values verbatim from data."""
    refuges = ", ".join(r.get("id", "?") for r in route.get("refuges", [])) or _ND
    bl = (
        f"  BOLLETTINO UFFICIALE: grado {bulletin.danger_level}/5 — "
        f"fonte {bulletin.avalanche_service} — {bulletin.source_url}\n"
        f'    testo: "{bulletin.raw_text}"'
        if bulletin is not None
        else f"  BOLLETTINO UFFICIALE: {_ND} (nessun bollettino in vigore)"
    )
    return "\n".join([
        f"- Itinerario: {route['name']} ({route['activity']}, {_fmt(route.get('diff_grade'))})",
        f"  Quote: partenza {route['start_altitude_m']} m, massima {route['max_altitude_m']} m, "
        f"dislivello {_fmt(route.get('vertical_gain_m'))} m",
        f"  Tempi medi: salita {_fmt(route.get('avg_ascent_min'))} min, "
        f"discesa {_fmt(route.get('avg_descent_min'))} min",
        f"  Esposizioni: {', '.join(route['primary_aspects'])}; "
        f"pendio massimo {_fmt(route.get('max_slope_deg'))}°",
        f"  Note esposizione: {_fmt(route.get('exposure_notes'))}",
        f"  Rifugi: {refuges}",
        _forecast_block(forecast),
        bl,
        f"  ALBA prevista: {_ND}",  # wired when the sun/ephemeris helper lands
    ])


def weather_along_route_block(points) -> str:
    """
    Per-point weather at REAL track elevations (partenza/metà/vetta).
    `points` = list of RoutePointWeather. Verbatim numbers only.
    """
    lines = ["  METEO LUNGO L'ITINERARIO (quote reali della traccia):"]
    for p in points:
        f = p.forecast
        lines.append(
            f"  - {p.label} ({p.ele_m} m): {f.temp_c}°C, vento {f.wind_avg_kmh} km/h "
            f"(raffiche {f.wind_gust_kmh}), zero termico {f.freezing_level_m} m, "
            f"precip {f.precip_mm} mm"
            + (" [DATI DIMOSTRATIVI]" if f.source.startswith("mock") else "")
        )
    return "\n".join(lines)


def model_insights_block(m) -> str:
    """Modello v0 diagnostics (ModelInsights) — verbatim, with provenance."""
    lines = [f"  MODELLO (profilo verticale, fonte {m.source}):"]
    if m.zero_termico_m is not None:
        lines.append(f"  - zero termico dal profilo: {m.zero_termico_m} m")
    elif m.colonna_sotto_zero:
        lines.append("  - colonna interamente sotto zero (nessuno zero termico)")
    if m.inversione:
        lines.append("  - INVERSIONE TERMICA rilevata: " + "; ".join(m.inversione_strati))
    for aspect, t in (m.warming_onset or {}).items():
        lines.append(
            f"  - riscaldamento pendio {aspect}: "
            + (f"dalle {t.strftime('%H:%M')} UTC" if t else "mai sopra soglia oggi")
        )
    return "\n".join(lines)


def build_briefing_payload(route: dict, bulletin: Bulletin,
                           forecast: Optional[PointForecast], locale: str,
                           route_weather=None) -> str:
    return "\n".join([
        f"LINGUA RISPOSTA: {locale}",
        "DATI ITINERARIO E CONDIZIONI (usa solo questi):",
        route_context(route, bulletin, forecast),
        *( [weather_along_route_block(route_weather.points)]
           if route_weather and route_weather.points else [] ),
        *( [model_insights_block(route_weather.model)]
           if route_weather and getattr(route_weather, "model", None) else [] ),
        "",
        "ISTRUZIONE: scrivi una breve relazione tecnica (campo 'relazione') per questo "
        "itinerario nelle condizioni date. Cita sempre grado ufficiale, fonte e link. "
        "Chiudi ricordando che è un supporto alla decisione e che il bollettino "
        "ufficiale prevale.",
    ])


def build_trip_payload(req: PlanRequest,
                       candidates: list[tuple[dict, Optional[Bulletin], Optional[PointForecast]]]) -> str:
    blocks = "\n".join(route_context(r, b, f) for r, b, f in candidates)
    return "\n".join([
        "RICHIESTA UTENTE:",
        req.intent_text,
        "",
        "PARAMETRI ESTRATTI:",
        json.dumps(req.model_dump(), ensure_ascii=False),
        "",
        "CANDIDATI SICURI (già filtrati dai filtri di sicurezza — usa solo questi):",
        blocks,
        "",
        "ISTRUZIONE: scegli il candidato migliore per la richiesta e scrivi la relazione "
        "nel formato render_trip_plan. Se nessun candidato è adeguato, dillo chiaramente "
        'in "allerta_sicurezza" e proponi di rimandare.',
    ])
