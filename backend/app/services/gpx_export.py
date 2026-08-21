"""
GPX export — GET /routes/{slug}/gpx (competitor-parity feature).

Serves the route's REAL ingested track as a GPX 1.1 file, with the route's
`source` attribution embedded (Camptocamp tracks are CC BY-SA — the license
travels with the file). Routes without an ingested track → 404, never a
fabricated geometry.
"""
from __future__ import annotations
from xml.sax.saxutils import escape
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from .. import store

router = APIRouter(prefix="/routes", tags=["routes"])


def build_gpx(route: dict) -> str:
    pts = [p for p in route.get("track_points", [])
           if p.get("lat") is not None and p.get("lon") is not None]
    if len(pts) < 2:
        raise ValueError("no track")
    seg = "\n".join(
        f'      <trkpt lat="{p["lat"]:.6f}" lon="{p["lon"]:.6f}">'
        + (f'<ele>{float(p["ele"]):.1f}</ele>' if p.get("ele") is not None else "")
        + "</trkpt>"
        for p in pts
    )
    name = escape(route["name"])
    # Track provenance wins over route-sheet provenance (they can differ:
    # curated sheet + Camptocamp CC BY-SA track, license travels with the file).
    src = escape(route.get("track_source") or route.get("source")
                 or "AIMETEO route database")
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!-- Fonte: {src}. Esportato da AIMETEO (Zerotermico).
     Supporto alla decisione, non una raccomandazione: verifica sempre
     bollettino e condizioni. -->
<gpx version="1.1" creator="AIMETEO" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>{name}</name>
    <src>{src}</src>
    <trkseg>
{seg}
    </trkseg>
  </trk>
</gpx>
"""


@router.get("/{slug}/gpx")
def export_gpx(slug: str) -> Response:
    route = store.get_route(slug)
    if not route:
        raise HTTPException(404, f"route '{slug}' not found")
    try:
        gpx_xml = build_gpx(route)
    except ValueError:
        raise HTTPException(
            404, "Questo itinerario non ha ancora una traccia GPX ingerita."
        )
    return Response(
        content=gpx_xml,
        media_type="application/gpx+xml",
        headers={"Content-Disposition": f'attachment; filename="{slug}.gpx"'},
    )
