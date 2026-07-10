"""Shared Pydantic models — the typed contracts between services and clients."""
from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# ── Forecast service ───────────────────────────────────────────────
class PointForecast(BaseModel):
    lat: float
    lon: float
    valid_at: datetime
    temp_c: float
    freezing_level_m: int = Field(..., description="zero termico")
    wind_avg_kmh: int
    wind_gust_kmh: int
    precip_mm: float
    thunderstorm_prob: float = Field(..., ge=0, le=1)
    source: str


# ── Terrain service ────────────────────────────────────────────────
class TerrainSample(BaseModel):
    seq: int
    altitude_m: int
    slope_deg: int
    aspect: str  # N, NE, E, ...


class TerrainProfile(BaseModel):
    route_id: str
    max_slope_deg: int
    primary_aspects: list[str]
    samples: list[TerrainSample]
    source: str = "route-metadata"  # route-metadata | earth-engine-dem


# ── Avalanche bulletin (official, never authored by us) ────────────
class Bulletin(BaseModel):
    avalanche_service: str          # AINEVA | Meteomont | LWD | SLF | ANENA | ARSO
    avalanche_zone: str
    country: str = "IT"
    issued_at: datetime
    valid_until: Optional[datetime] = None
    danger_level: int = Field(..., ge=1, le=5, description="official EAWS scale")
    danger_by_aspect: dict[str, int] = {}
    problem_types: list[str] = []
    raw_text: str
    raw_locale: str = "it"
    source_url: str


# ── Briefing service ───────────────────────────────────────────────
class BriefingRequest(BaseModel):
    route_id: str
    locale: str = "it"


class Briefing(BaseModel):
    route_id: str
    locale: str
    text: str
    bulletin: Optional[Bulletin] = None  # None = no bulletin in force (off-season)
    generated_at: datetime
    model: str


# ── Trip planner ───────────────────────────────────────────────────
class PlanRequest(BaseModel):
    intent_text: str
    activity: str
    area: Optional[str] = None
    start_location: Optional[str] = None
    max_difficulty: Optional[str] = None
    locale: str = "it"


class PlanCandidate(BaseModel):
    route_id: str
    name: str
    passed_safety: bool
    block_reasons: list[str] = []


class PlanResponse(BaseModel):
    request: PlanRequest
    safe_candidates: list[PlanCandidate]
    blocked: list[PlanCandidate]
    plan_text: Optional[str] = None   # human-readable summary (Gemini or fallback)
    plan: Optional[dict] = None       # full render_trip_plan JSON when Gemini answered
    plan_model: Optional[str] = None  # audit: what generated plan_text/plan
    forecast_notice: Optional[str] = None  # data-provenance disclosure (e.g. mock forecast)


# ── Alert service ──────────────────────────────────────────────────
class AlertSnapshot(BaseModel):
    """Conditions at subscribe time — the baseline the scheduled job diffs against."""
    taken_at: datetime
    bulletin_issued_at: Optional[datetime] = None
    bulletin_danger: Optional[int] = None       # official EAWS level, never ours
    bulletin_unavailable: bool = False          # fetch failed / off-season at subscribe


class AlertSubscription(BaseModel):
    user_id: str
    route_id: str
    triggers: list[str] = Field(
        default_factory=lambda: ["freezing_level", "wind", "new_bulletin"]
    )
    snapshot: Optional[AlertSnapshot] = None    # set by the server, not the client


class AlertEvent(BaseModel):
    user_id: str
    route_id: str
    trigger: str            # new_bulletin | danger_up | bulletin_unavailable
    message: str
    fired_at: datetime
