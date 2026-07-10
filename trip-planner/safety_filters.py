"""
AIMETEO — Hard safety filters (compatibility shim).

The canonical implementation now lives in `backend/app/safety_filters.py` so the
production container is self-contained (audit H2) and there is exactly ONE copy of
the safety logic. This file re-exports it for the trip-planner spec/docs side and
keeps the historical entrypoint working:

    python trip-planner/safety_filters.py   # runs the sanity checks
"""
from __future__ import annotations

import pathlib
import sys

_BACKEND = pathlib.Path(__file__).resolve().parents[1] / "backend"
if str(_BACKEND) not in sys.path:
    sys.path.insert(0, str(_BACKEND))

from app.safety_filters import (  # noqa: E402,F401
    Activity,
    AvalancheBulletin,
    DANGER_HARD_BLOCK,
    EXPOSED_TERRAIN,
    FilterResult,
    Forecast,
    Route,
    SLOPE_AVY_MIN_DEG,
    SNOW_ACTIVITIES,
    SNOW_ALERT_DANGER,
    SNOW_SEASONS,
    SOUTH_SECTOR,
    TEMP_RISE_S_ASPECT_MAX_C,
    THUNDERSTORM_PROB_MAX,
    WIND_EXPOSED_MAX_KMH,
    evaluate,
    filter_candidates,
    run_sanity_checks,
)

if __name__ == "__main__":
    run_sanity_checks()
