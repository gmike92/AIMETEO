"""
AIMETEO — Hard safety filters (canonical implementation).

Design principle: the AI never decides what is SAFE. These deterministic filters run
in the backend BEFORE any candidate route is shown to Gemini. A route that fails any
hard filter is removed from the candidate set, so the model literally cannot suggest it.

FAIL-CLOSED: when safety-relevant data is missing (no official bulletin during the
snow season, unknown max slope under a snow alert), the route is BLOCKED, not passed.
Missing data is never treated as good news.

We never author danger ratings: avalanche danger comes verbatim from the official
AINEVA/Meteomont bulletin (per aspect/altitude where available).

Pure functions, no I/O, no AI. Fully unit-testable.
(`trip-planner/safety_filters.py` re-exports this module for the spec/docs side.)
"""
from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional


class Activity(str, Enum):
    SCIALPINISMO = "scialpinismo"
    ALPINISMO = "alpinismo"
    ARRAMPICATA = "arrampicata"
    VIA_FERRATA = "via_ferrata"
    ESCURSIONISMO = "escursionismo"
    TRAIL_RUNNING = "trail_running"
    MTB_ALPINO = "mtb_alpino"
    VOLO_LIBERO = "volo_libero"


SNOW_ACTIVITIES = {Activity.SCIALPINISMO, Activity.ALPINISMO}
EXPOSED_TERRAIN = {Activity.ALPINISMO, Activity.VIA_FERRATA, Activity.ARRAMPICATA}
#: Seasons in which an official avalanche bulletin is expected to be in force.
SNOW_SEASONS = {"winter", "spring"}
#: Southern sector for wet-snow / warming checks (not just literal "S").
SOUTH_SECTOR = {"S", "SE", "SW"}


@dataclass
class Route:
    id: str
    name: str
    activity: Activity
    primary_aspects: list[str]          # e.g. ["N", "NE"]
    max_slope_deg: Optional[int]        # None = not surveyed yet (treated conservatively)
    start_altitude_m: int
    max_altitude_m: int


@dataclass
class Forecast:
    freezing_level_m: int               # zero termico
    wind_avg_kmh: int                   # average wind on exposed parts
    wind_gust_kmh: int
    temp_rise_c: float                  # forecast temperature rise over the outing
    precip_mm: float
    thunderstorm_prob: float            # 0..1
    season: str                         # "winter" | "spring" | "summer" | "autumn"


@dataclass
class AvalancheBulletin:
    danger_by_aspect: dict[str, int]    # {"N":4,"NE":4,...} official EAWS scale 1..5
    overall_danger: int                 # 1..5
    source: str                         # "AINEVA" | "Meteomont" | "ARPA ..."
    source_url: str


@dataclass
class FilterResult:
    passed: bool
    reasons: list[str] = field(default_factory=list)   # human-readable Italian reasons


# ── Tunable thresholds (single source of truth) ────────────────────────────
WIND_EXPOSED_MAX_KMH = 60          # avg wind on exposed ridges
TEMP_RISE_S_ASPECT_MAX_C = 5.0     # warming on southern sector (wet-snow / rockfall)
SLOPE_AVY_MIN_DEG = 30             # avalanche-relevant slope angle
SNOW_ALERT_DANGER = 3              # bulletin level that constitutes a "snow alert"
THUNDERSTORM_PROB_MAX = 0.4        # block exposed terrain above this prob
DANGER_HARD_BLOCK = 4              # AINEVA 4–5 on route aspects → block


def _route_aspect_danger(route: Route, bulletin: AvalancheBulletin) -> int:
    """Max official danger across the route's own aspects (fallback to overall)."""
    levels = [bulletin.danger_by_aspect.get(a) for a in route.primary_aspects]
    levels = [l for l in levels if l is not None]
    return max(levels) if levels else bulletin.overall_danger


def evaluate(route: Route, fc: Forecast, bulletin: Optional[AvalancheBulletin]) -> FilterResult:
    """Return FilterResult. passed=False => route removed from candidates (Gemini never sees it)."""
    reasons: list[str] = []

    # 0) FAIL-CLOSED: snow activity in the snow season with NO official bulletin
    #    (off-season gap, fetch failure upstream) → never assume it's safe.
    if route.activity in SNOW_ACTIVITIES and bulletin is None and fc.season in SNOW_SEASONS:
        reasons.append(
            "Nessun bollettino valanghe ufficiale disponibile in stagione nevosa: "
            "itinerario escluso per prudenza (il pericolo non è verificabile)."
        )

    # 1) AINEVA 4–5 on the route's aspects → hard block (snow activities)
    if route.activity in SNOW_ACTIVITIES and bulletin is not None:
        danger = _route_aspect_danger(route, bulletin)
        if danger >= DANGER_HARD_BLOCK:
            reasons.append(
                f"Pericolo valanghe ufficiale {danger}/5 ({bulletin.source}) "
                f"sulle esposizioni dell'itinerario ({', '.join(route.primary_aspects)})."
            )

    # 2) Freezing level below valley/start altitude in summer → alpine routes filtered
    if fc.season == "summer" and route.activity in {Activity.ALPINISMO, Activity.SCIALPINISMO}:
        if fc.freezing_level_m < route.start_altitude_m:
            reasons.append(
                f"Zero termico ({fc.freezing_level_m} m) sotto la quota di partenza "
                f"({route.start_altitude_m} m): condizioni invernali su itinerario alpino estivo."
            )

    # 3) Average wind > 60 km/h on exposed ridges → removed
    if route.activity in EXPOSED_TERRAIN and fc.wind_avg_kmh > WIND_EXPOSED_MAX_KMH:
        reasons.append(
            f"Vento medio {fc.wind_avg_kmh} km/h su terreno esposto "
            f"(soglia {WIND_EXPOSED_MAX_KMH} km/h)."
        )

    # 4) Snow alert AND steep (or unsurveyed) slope → block. Missing slope data is
    #    treated as dangerous under an alert, never as 0°.
    if bulletin is not None and route.activity in SNOW_ACTIVITIES:
        snow_alert = _route_aspect_danger(route, bulletin) >= SNOW_ALERT_DANGER
        if snow_alert:
            if route.max_slope_deg is None:
                reasons.append(
                    f"Allerta neve (pericolo ≥{SNOW_ALERT_DANGER}) e pendenza massima "
                    f"non censita: itinerario escluso per prudenza."
                )
            elif route.max_slope_deg > SLOPE_AVY_MIN_DEG:
                reasons.append(
                    f"Allerta neve (pericolo ≥{SNOW_ALERT_DANGER}) con pendio massimo "
                    f"{route.max_slope_deg}° (> {SLOPE_AVY_MIN_DEG}°)."
                )
    south = SOUTH_SECTOR & set(route.primary_aspects)
    if fc.temp_rise_c > TEMP_RISE_S_ASPECT_MAX_C and south:
        reasons.append(
            f"Forte rialzo termico (+{fc.temp_rise_c:.0f}°C) su esposizioni del settore Sud "
            f"({', '.join(sorted(south))}): rischio neve bagnata / scariche."
        )

    # 5) Thunderstorm risk on exposed terrain (ferrate, creste) → block
    if route.activity in EXPOSED_TERRAIN and fc.thunderstorm_prob > THUNDERSTORM_PROB_MAX:
        reasons.append(
            f"Probabilità temporali {int(fc.thunderstorm_prob*100)}% su terreno esposto "
            f"(soglia {int(THUNDERSTORM_PROB_MAX*100)}%): rischio fulminazione."
        )

    return FilterResult(passed=len(reasons) == 0, reasons=reasons)


def filter_candidates(routes, fc, bulletin):
    """Split routes into (safe_candidates, blocked). Gemini only ever receives safe_candidates."""
    safe, blocked = [], []
    for r in routes:
        res = evaluate(r, fc, bulletin)
        (safe if res.passed else blocked).append((r, res))
    return safe, blocked


# ── Inline sanity checks (run: python -m app.safety_filters / via trip-planner shim) ──
def run_sanity_checks() -> None:
    vioz = Route("r1", "Monte Vioz", Activity.SCIALPINISMO, ["N", "NE"], 35, 1400, 3645)
    ferrata = Route("r2", "Punta Anna", Activity.VIA_FERRATA, ["S", "SE"], 60, 2400, 3244)

    # Danger 4 on N/NE → Vioz must be blocked
    b = AvalancheBulletin({"N": 4, "NE": 4, "E": 3}, 4, "AINEVA", "https://aineva.it")
    good_fc = Forecast(3200, 20, 35, 2, 0, 0.1, "winter")
    res = evaluate(vioz, good_fc, b)
    assert not res.passed and "Pericolo valanghe" in res.reasons[0], res
    print("OK  blocked Vioz on AINEVA 4:", res.reasons[0])

    # Thunderstorms 60% on a ferrata → blocked
    storm_fc = Forecast(3500, 15, 30, 1, 0.5, 0.6, "summer")
    res2 = evaluate(ferrata, storm_fc, None)
    assert not res2.passed, res2
    print("OK  blocked ferrata on storms:", res2.reasons[0])

    # Calm winter day, danger 2 → Vioz passes
    calm = AvalancheBulletin({"N": 2, "NE": 2}, 2, "AINEVA", "https://aineva.it")
    res3 = evaluate(vioz, good_fc, calm)
    assert res3.passed, res3
    print("OK  Vioz passes on calm day, danger 2")

    # FAIL-CLOSED: winter snow activity with NO bulletin → blocked
    res4 = evaluate(vioz, good_fc, None)
    assert not res4.passed and "escluso per prudenza" in res4.reasons[0], res4
    print("OK  blocked Vioz with missing bulletin in winter (fail-closed)")

    # Summer alpinism with no bulletin in force → no avalanche-based block
    summer_fc = Forecast(4200, 10, 20, 2, 0, 0.1, "summer")
    gp = Route("r3", "Gran Paradiso", Activity.ALPINISMO, ["N", "NW"], 35, 1960, 4061)
    assert evaluate(gp, summer_fc, None).passed
    print("OK  summer alpinism passes without a bulletin (none expected)")

    # Unknown slope under snow alert → blocked (missing data ≠ safe)
    nos = Route("r4", "Slope ignota", Activity.SCIALPINISMO, ["N"], None, 1500, 3000)
    alert = AvalancheBulletin({"N": 3}, 3, "AINEVA", "https://aineva.it")
    res5 = evaluate(nos, good_fc, alert)
    assert not res5.passed and "non censita" in res5.reasons[0], res5
    print("OK  blocked unknown max slope under snow alert")

    # Warming applies to the whole southern sector (SE/SW), not just literal "S"
    se = Route("r5", "Canale SE", Activity.SCIALPINISMO, ["SE", "SW"], 38, 1800, 3200)
    hot_fc = Forecast(3800, 10, 20, 8.0, 0, 0.05, "spring")
    res6 = evaluate(se, hot_fc, AvalancheBulletin({"SE": 2, "SW": 2}, 2, "AINEVA", "https://x"))
    assert not res6.passed and "settore Sud" in res6.reasons[0], res6
    print("OK  blocked +8°C warming on SE/SW aspects")

    print("All safety-filter sanity checks passed.")


if __name__ == "__main__":
    run_sanity_checks()
