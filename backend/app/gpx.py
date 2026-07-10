"""
GPX parsing + track decimation (roadmap #4a).

Guardrail: we NEVER fabricate coordinates. This module only *selects* real
trackpoints from a curator-provided GPX file — decimation, not interpolation:
every output point exists verbatim in the input file. Elevation is taken from
the GPX <ele> tags when present, never estimated here (the DEM service is the
authority for terrain, and it also only reads real coordinates).

Stdlib-only (xml.etree + math): no new dependencies.
"""
from __future__ import annotations

import math
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from typing import Optional

EARTH_RADIUS_M = 6_371_000.0
DEFAULT_SPACING_M = 50.0


class GpxError(Exception):
    """The GPX file is missing, empty, or malformed."""


@dataclass(frozen=True)
class TrackPoint:
    lat: float
    lon: float
    ele: Optional[float] = None  # metres, only if present in the GPX


def haversine_m(a: TrackPoint, b: TrackPoint) -> float:
    """Great-circle distance in metres."""
    la1, lo1, la2, lo2 = map(math.radians, (a.lat, a.lon, b.lat, b.lon))
    h = (math.sin((la2 - la1) / 2) ** 2
         + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2)
    return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_gpx(xml_text: str) -> list[TrackPoint]:
    """
    Extract ordered trackpoints from a GPX document (any GPX 1.0/1.1 namespace).
    Prefers <trkpt> (recorded tracks); falls back to <rtept> (planned routes).
    Raises GpxError if nothing usable is found.
    """
    try:
        root = ET.fromstring(xml_text)
    except ET.ParseError as e:
        raise GpxError(f"GPX non valido (XML malformato): {e}") from e

    def collect(point_tag: str) -> list[TrackPoint]:
        pts: list[TrackPoint] = []
        for el in root.iter():
            if _local_name(el.tag) != point_tag:
                continue
            try:
                lat, lon = float(el.attrib["lat"]), float(el.attrib["lon"])
            except (KeyError, ValueError) as e:
                raise GpxError(f"trackpoint senza lat/lon validi: {e}") from e
            if not (-90 <= lat <= 90 and -180 <= lon <= 180):
                raise GpxError(f"coordinate fuori range: {lat},{lon}")
            ele = None
            for child in el:
                if _local_name(child.tag) == "ele" and child.text:
                    try:
                        ele = float(child.text)
                    except ValueError:
                        ele = None
                    break
            pts.append(TrackPoint(lat=lat, lon=lon, ele=ele))
        return pts

    points = collect("trkpt") or collect("rtept")
    if len(points) < 2:
        raise GpxError("il GPX non contiene una traccia (almeno 2 punti richiesti)")
    return points


def decimate(points: list[TrackPoint],
             spacing_m: float = DEFAULT_SPACING_M) -> list[TrackPoint]:
    """
    Keep the first point, then every real point that adds >= spacing_m of
    along-track distance, and always the last point. No synthetic points.
    """
    if not points:
        raise GpxError("traccia vuota")
    out = [points[0]]
    acc = 0.0
    for prev, cur in zip(points, points[1:]):
        acc += haversine_m(prev, cur)
        if acc >= spacing_m:
            out.append(cur)
            acc = 0.0
    if out[-1] != points[-1]:
        out.append(points[-1])
    return out


@dataclass(frozen=True)
class TrackStats:
    n_points: int
    length_m: float
    start: TrackPoint
    end: TrackPoint
    highest: Optional[TrackPoint]      # None if the GPX carries no elevations
    min_ele_m: Optional[float]
    max_ele_m: Optional[float]
    vertical_gain_m: Optional[float]   # sum of positive elevation deltas


def track_stats(points: list[TrackPoint]) -> TrackStats:
    if len(points) < 2:
        raise GpxError("traccia troppo corta")
    length = sum(haversine_m(a, b) for a, b in zip(points, points[1:]))
    eles = [(p.ele, p) for p in points if p.ele is not None]
    highest = max(eles, key=lambda t: t[0])[1] if eles else None
    gain = None
    if len(eles) >= 2:
        gain = sum(max(0.0, b.ele - a.ele)
                   for a, b in zip(points, points[1:])
                   if a.ele is not None and b.ele is not None)
    return TrackStats(
        n_points=len(points), length_m=length,
        start=points[0], end=points[-1], highest=highest,
        min_ele_m=min(e for e, _ in eles) if eles else None,
        max_ele_m=max(e for e, _ in eles) if eles else None,
        vertical_gain_m=gain,
    )
