"""
Trip planner pipeline (steps 3–5 of trip-planner/spec.md).

Deterministic backend does the work: filter routes -> fetch forecast + official bulletin
-> APPLY HARD SAFETY FILTERS -> top candidates -> (Gemini writes the plan in prod).
Gemini NEVER sees filtered-out routes.

FAIL-CLOSED: a bulletin we cannot retrieve is UNKNOWN danger, not "no danger" —
snow-activity routes are blocked when verification is impossible.

The canonical safety logic lives in app/safety_filters.py (the container is
self-contained; trip-planner/safety_filters.py re-exports it for the spec side).
"""
from __future__ import annotations
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from ..models import PlanRequest, PlanResponse, PlanCandidate, PointForecast
from ..config import settings
from ..connectors import registry
from ..connectors.base import BulletinFetchError
from ..providers import google_weather
from .. import store
from .. import safety_filters as sf
from .. import llm, prompts

log = logging.getLogger(__name__)

router = APIRouter(prefix="/planner", tags=["planner"])

#: Block reason when the official bulletin cannot be retrieved (fail-closed).
FETCH_ERROR_REASON = (
    "Impossibile recuperare il bollettino valanghe ufficiale: "
    "itinerario escluso per prudenza (il pericolo non è verificabile)."
)

#: Default plausibility windows per activity (months). Policy defaults, not
#: facts: a curator can override any single route with `season_months` (seed)
#: / `ideal_season` (DB). Purpose: never PLAN scialpinismo in August — the
#: route stays browsable, it is just excluded from planning with a clear reason.
ACTIVITY_SEASON_MONTHS: dict[str, set[int]] = {
    "scialpinismo": {11, 12, 1, 2, 3, 4, 5},
    "via_ferrata": {4, 5, 6, 7, 8, 9, 10, 11},
    # alpinismo / escursionismo: all year (conditions filters do the work)
}


def _now_month() -> int:
    return datetime.now(timezone.utc).month


def _season_block_reason(route: dict) -> str | None:
    """None if the route is plannable this month, else the block reason."""
    months = route.get("season_months") or ACTIVITY_SEASON_MONTHS.get(route["activity"])
    if months is None or _now_month() in months:
        return None
    return (
        f"Attività '{route['activity']}' tipicamente fuori stagione in questo periodo: "
        "itinerario escluso dalla pianificazione (finestra modificabile dal curatore)."
    )


def _to_sf_route(route: dict) -> "sf.Route":
    return sf.Route(
        id=route["slug"], name=route["name"],
        activity=sf.Activity(route["activity"]),
        primary_aspects=route["primary_aspects"],
        max_slope_deg=route.get("max_slope_deg"),   # None = unknown (handled fail-closed)
        start_altitude_m=route["start_altitude_m"],
        max_altitude_m=route["max_altitude_m"],
    )


def _mock_forecast() -> "sf.Forecast":
    # Calm-ish day; used when the live provider is off or a route has no coords.
    # Season tracks the real calendar so demo behaviour matches live behaviour
    # (e.g. no spurious "snow season, no bulletin" blocks in July).
    return sf.Forecast(
        freezing_level_m=2100, wind_avg_kmh=25, wind_gust_kmh=55,
        temp_rise_c=2.0, precip_mm=0.0, thunderstorm_prob=0.05,
        season=_season(datetime.now(timezone.utc)),
    )


def _season(now: datetime) -> str:
    """Meteorological season (N hemisphere) for the safety filters."""
    return {12: "winter", 1: "winter", 2: "winter",
            3: "spring", 4: "spring", 5: "spring",
            6: "summer", 7: "summer", 8: "summer"}.get(now.month, "autumn")


def _route_forecast(route: dict) -> tuple["sf.Forecast", PointForecast | None, bool]:
    """
    Per-route forecast for the safety filters.
    Returns (sf.Forecast, PointForecast|None for the Gemini payload, is_mock).

    Live path requires the provider configured AND real route coordinates
    (start_lat/start_lon from GPX ingestion — never fabricated). Until then,
    or on any fetch error, we fall back to the disclosed mock (fail-safe:
    the mock is disclosed via forecast_notice, and avalanche blocking never
    depends on the forecast — bulletins have their own fail-closed path).
    """
    lat, lon = route.get("start_lat"), route.get("start_lon")
    if google_weather.is_configured() and lat is not None and lon is not None:
        try:
            pf, temp_change = google_weather.fetch_point(
                float(lat), float(lon), int(route["start_altitude_m"])
            )
            fc = sf.Forecast(
                freezing_level_m=pf.freezing_level_m,
                wind_avg_kmh=pf.wind_avg_kmh, wind_gust_kmh=pf.wind_gust_kmh,
                temp_rise_c=max(0.0, temp_change),
                precip_mm=pf.precip_mm, thunderstorm_prob=pf.thunderstorm_prob,
                season=_season(datetime.now(timezone.utc)),
            )
            return fc, pf, False
        except google_weather.ForecastFetchError as e:
            log.warning("live forecast failed for %s, using disclosed mock: %s",
                        route["slug"], e)
    return _mock_forecast(), None, True


def _make_bulletin_fetcher(_cache: dict):
    """
    Request-scoped memoizer: N routes in the same (service, zone, subzone) hit the
    official mirror ONCE per plan request, not once per route (audit M6). Persistent
    caching across requests belongs in the avalanche_bulletin table (forecast/ETL side).
    A BulletinFetchError is cached too, so a failing zone isn't retried per route.
    """
    def fetch(connector, region: str, subzone):
        key = (connector.service, region, subzone)
        if key not in _cache:
            try:
                _cache[key] = connector.fetch(region=region, subzone=subzone)
            except BulletinFetchError as e:
                _cache[key] = e
        cached = _cache[key]
        if isinstance(cached, BulletinFetchError):
            raise cached
        return cached
    return fetch


@router.post("/plan", response_model=PlanResponse)
def plan(req: PlanRequest) -> PlanResponse:
    routes = [r for r in store.list_routes() if r["activity"] == req.activity]
    fetch_bulletin = _make_bulletin_fetcher({})
    any_mock_forecast = False

    safe: list[PlanCandidate] = []
    blocked: list[PlanCandidate] = []
    safe_ctx: list[tuple[dict, object, PointForecast | None]] = []  # for Gemini
    for route in routes:
        # Seasonality gate first: out-of-window routes are excluded with a clear
        # reason before any bulletin/forecast work (they stay browsable elsewhere).
        season_reason = _season_block_reason(route)
        if season_reason:
            blocked.append(PlanCandidate(
                route_id=route["slug"], name=route["name"],
                passed_safety=False, block_reasons=[season_reason],
            ))
            continue
        sf_route = _to_sf_route(route)
        area = store.area_for_route(route) or {}
        country = area.get("country", settings.default_country)
        try:
            connector = registry.get_for_country(country)
        except KeyError:
            raise HTTPException(
                503,
                f"Nessun connettore valanghe disponibile per il paese '{country}'. "
                f"Itinerario '{route['slug']}' non pianificabile.",
            )
        try:
            bulletin = fetch_bulletin(
                connector,
                area.get("avalanche_zone", "UNKNOWN"),
                area.get("avalanche_subzone"),
            )
        except BulletinFetchError:
            # Could not VERIFY the official danger. For snow activities that is a
            # hard block (fail-closed); other activities proceed without a bulletin.
            if sf_route.activity in sf.SNOW_ACTIVITIES:
                blocked.append(PlanCandidate(
                    route_id=route["slug"], name=route["name"],
                    passed_safety=False, block_reasons=[FETCH_ERROR_REASON],
                ))
                continue
            bulletin = None
        sf_bulletin = None
        if bulletin is not None:
            sf_bulletin = sf.AvalancheBulletin(
                danger_by_aspect=bulletin.danger_by_aspect,
                overall_danger=bulletin.danger_level,
                source=bulletin.avalanche_service, source_url=bulletin.source_url,
            )
        fc, pf, is_mock = _route_forecast(route)
        any_mock_forecast = any_mock_forecast or is_mock
        res = sf.evaluate(sf_route, fc, sf_bulletin)
        cand = PlanCandidate(route_id=route["slug"], name=route["name"],
                             passed_safety=res.passed, block_reasons=res.reasons)
        if res.passed:
            safe.append(cand)
            safe_ctx.append((route, bulletin, pf))
        else:
            blocked.append(cand)

    # M1 disclosure: say so whenever ANY route was filtered with placeholder weather.
    forecast_notice = None
    if any_mock_forecast:
        forecast_notice = (
            "⚠️ Meteo dimostrativo: per uno o più itinerari mancano coordinate o il "
            "servizio meteo non è configurato, quindi i filtri meteo usano valori "
            "segnaposto. Le valutazioni valanghe sono invece quelle ufficiali. "
            "Non usare per decisioni reali finché il meteo non è live."
        )

    # Step 5: top-3 SAFE candidates only → Gemini render_trip_plan.
    # Gemini never sees blocked routes and cannot resurrect them.
    plan_text = None
    plan_json = None
    plan_model = None
    if safe and settings.trip_planner_enabled:
        try:
            payload = prompts.build_trip_payload(req, safe_ctx[:3])
            plan_json = llm.generate_json(
                prompts.SYSTEM_INSTRUCTION, payload, prompts.RENDER_TRIP_PLAN_SCHEMA
            )
            plan_text = plan_json.get("itinerario") or plan_json.get("titolo")
            plan_model = settings.vertex_model
            # Liability black box: exact prompt + data snapshots + final response.
            # (DB plan_audit write lands with the auth layer; structured log meanwhile.)
            log.info("plan_audit", extra={"audit": {
                "prompt_sent": payload,
                "candidate_routes": [c.route_id for c in safe[:3]],
                "final_response": plan_json,
            }})
        except llm.GeminiUnavailable:
            plan_model = "deterministic-stub"
            plan_text = (
                f"{len(safe)} itinerari superano i filtri di sicurezza: "
                f"{', '.join(c.name for c in safe[:3])}. "
                f"Consulta sempre il bollettino ufficiale prima di partire."
            )
    elif not safe:
        plan_model = "deterministic-stub"
        plan_text = "Nessun itinerario supera i filtri di sicurezza oggi. Valuta di rimandare."

    return PlanResponse(
        request=req, safe_candidates=safe, blocked=blocked,
        plan_text=plan_text, plan=plan_json, plan_model=plan_model,
        forecast_notice=forecast_notice,
    )
