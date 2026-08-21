"""
Google Earth Engine DEM provider (roadmap #4).

Samples slope/aspect/elevation from a DEM (default COPERNICUS/DEM/GLO30) at a
list of real coordinates — typically ~50 m spaced points along an ingested GPX
track. We NEVER fabricate coordinates: no GPX → no live terrain profile.

The earthengine-api dependency is optional and imported lazily; live mode also
requires GCP_PROJECT + application-default credentials with EE enabled.
Any failure raises TerrainFetchError — callers fall back to the route-metadata
skeleton and say so, they never invent samples.
"""
from __future__ import annotations
import logging
from ..config import settings
from ..models import TerrainSample

log = logging.getLogger(__name__)

_ASPECT_CARDINALS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]

_initialized = False


class TerrainFetchError(Exception):
    """Live terrain sampling failed or is not configured. Callers fall back."""


def is_configured() -> bool:
    if settings.use_mock_data or not settings.gcp_project:
        return False
    try:
        import ee  # noqa: F401
        return True
    except ImportError:
        return False


def aspect_to_cardinal(aspect_deg: float) -> str:
    """0–360° aspect → 8-point cardinal (N-centred sectors of 45°)."""
    return _ASPECT_CARDINALS[round(aspect_deg / 45.0) % 8]


def _init():
    global _initialized
    if _initialized:
        return
    import ee
    try:
        ee.Initialize(project=settings.gcp_project)
        _initialized = True
    except Exception as e:
        raise TerrainFetchError(f"Earth Engine init fallita: {e}") from e


def sample_track(points: list[tuple[float, float]]) -> list[TerrainSample]:
    """
    Slope/aspect/elevation for each (lat, lon) point, sampled from the DEM at
    native (~30 m) scale. Returns TerrainSamples in input order.
    """
    if not points:
        raise TerrainFetchError("nessuna coordinata reale (GPX non ingerito)")
    if not is_configured():
        raise TerrainFetchError(
            "Earth Engine non configurato (earthengine-api / GCP_PROJECT / USE_MOCK_DATA)"
        )
    import ee
    _init()
    try:
        dem = ee.ImageCollection(settings.ee_dem_asset).select("DEM").mosaic() \
            if "/" in settings.ee_dem_asset else ee.Image(settings.ee_dem_asset)
        terrain = ee.Terrain.products(dem)  # adds slope (deg) + aspect (deg)
        fc = ee.FeatureCollection([
            ee.Feature(ee.Geometry.Point([lon, lat]), {"seq": i})
            for i, (lat, lon) in enumerate(points)
        ])
        sampled = terrain.sampleRegions(collection=fc, scale=30, geometries=False) \
                         .getInfo()
        out: list[TerrainSample] = []
        for feat in sorted(sampled["features"], key=lambda f: f["properties"]["seq"]):
            p = feat["properties"]
            out.append(TerrainSample(
                seq=int(p["seq"]),
                altitude_m=round(float(p.get("DEM", p.get("elevation", 0)))),
                slope_deg=round(float(p["slope"])),
                aspect=aspect_to_cardinal(float(p["aspect"])),
            ))
        if not out:
            raise TerrainFetchError("il DEM non ha restituito campioni per il tracciato")
        return out
    except TerrainFetchError:
        raise
    except Exception as e:
        raise TerrainFetchError(f"campionamento DEM fallito: {e}") from e
