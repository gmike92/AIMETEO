"""
Terrain service (vertical-agnostic).

Live: Google Earth Engine DEM → slope/aspect per ~50 m along the route's GPX
track points (providers/earth_engine.py). Requires real ingested coordinates —
we never fabricate them, so routes without a GPX fall back to the metadata
profile and the response `source` says which one you got.
"""
from __future__ import annotations
from fastapi import APIRouter, HTTPException
from ..models import TerrainProfile, TerrainSample
from ..providers import earth_engine
from .. import store

router = APIRouter(prefix="/terrain", tags=["terrain"])


def _metadata_profile(route: dict) -> TerrainProfile:
    """Minimal profile from curated route fields (no DEM)."""
    sample = TerrainSample(
        seq=0,
        altitude_m=route["max_altitude_m"],
        slope_deg=route.get("max_slope_deg") or 0,
        aspect=(route["primary_aspects"] or ["N"])[0],
    )
    return TerrainProfile(
        route_id=route["slug"],
        max_slope_deg=route.get("max_slope_deg") or 0,
        primary_aspects=route["primary_aspects"],
        samples=[sample],
        source="route-metadata",
    )


@router.get("/{slug}", response_model=TerrainProfile)
def terrain_profile(slug: str) -> TerrainProfile:
    route = store.get_route(slug)
    if not route:
        raise HTTPException(404, f"route '{slug}' not found")

    # Live DEM sampling needs real track points from GPX ingestion.
    track: list[tuple[float, float]] = [
        (p["lat"], p["lon"]) for p in route.get("track_points", [])
        if p.get("lat") is not None and p.get("lon") is not None
    ]
    if track and earth_engine.is_configured():
        try:
            samples = earth_engine.sample_track(track)
            return TerrainProfile(
                route_id=route["slug"],
                max_slope_deg=max(s.slope_deg for s in samples),
                primary_aspects=sorted({s.aspect for s in samples}),
                samples=samples,
                source="earth-engine-dem",
            )
        except earth_engine.TerrainFetchError:
            pass  # fall back to curated metadata, disclosed via `source`

    return _metadata_profile(route)
