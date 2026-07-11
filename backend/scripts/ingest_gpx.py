"""
Ingest a curator-provided GPX track for an existing route (roadmap #4a).

    python scripts/ingest_gpx.py --route <slug> path/to/track.gpx
        [--spacing 50] [--dry-run] [--force]

What it does (idempotent, per route):
- Parses the GPX and decimates to ~spacing_m real points (never interpolates).
- SANITY GATE against curated route facts: GPX start/max elevation must agree
  with route.start_altitude_m / max_altitude_m within ±TOLERANCE_M, otherwise
  the ingestion is refused (wrong-file protection). --force overrides with a
  loud warning — the curator owns that call.
- DATABASE_URL set  → writes route.start_point, route.summit_point (highest GPX
  point, only if the GPX has elevations), route.track (LINESTRINGZ) and replaces
  route_sample rows (seq, point, altitude_m; slope/aspect stay NULL until the
  Earth Engine pass fills them). Requires PostGIS.
- DATABASE_URL empty → writes start_lat/start_lon/track_points into
  route-db/seed_routes.json so the in-memory store serves the same shapes.

Unlocks: live per-route forecasts (planner), DEM slope/aspect sampling (terrain),
and removes the planner's mock-forecast notice for ingested routes.
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app import gpx  # noqa: E402
from app.config import settings  # noqa: E402

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
SEED = REPO_ROOT / "route-db" / "seed_routes.json"

#: Max allowed disagreement between GPX elevations and curated route altitudes.
TOLERANCE_M = 150


def sanity_check(route: dict, stats: gpx.TrackStats, force: bool) -> list[str]:
    """Wrong-file protection: GPX must match the curated altitude facts."""
    problems: list[str] = []
    if stats.start.ele is not None:
        delta = abs(stats.start.ele - route["start_altitude_m"])
        if delta > TOLERANCE_M:
            problems.append(
                f"quota di partenza GPX {stats.start.ele:.0f} m vs scheda "
                f"{route['start_altitude_m']} m (Δ{delta:.0f} m > {TOLERANCE_M} m)")
    if stats.max_ele_m is not None:
        delta = abs(stats.max_ele_m - route["max_altitude_m"])
        if delta > TOLERANCE_M:
            problems.append(
                f"quota massima GPX {stats.max_ele_m:.0f} m vs scheda "
                f"{route['max_altitude_m']} m (Δ{delta:.0f} m > {TOLERANCE_M} m)")
    if stats.min_ele_m is None:
        problems.append("il GPX non contiene quote (<ele>): summit_point e "
                        "altitude_m non saranno popolati — verifica che sia voluto")
    if problems and force:
        print("⚠️  --force: ignoro i controlli di coerenza:", file=sys.stderr)
        for p in problems:
            print(f"   - {p}", file=sys.stderr)
        return []
    return problems


def ingest_memory(slug: str, points: list[gpx.TrackPoint],
                  stats: gpx.TrackStats, track_source: str | None = None) -> None:
    data = json.loads(SEED.read_text(encoding="utf-8"))
    route = next((r for r in data["routes"] if r["slug"] == slug), None)
    if route is None:
        sys.exit(f"route '{slug}' non trovata in {SEED}")
    if track_source:
        route["track_source"] = track_source  # license/attribution of the TRACK
    route["start_lat"] = points[0].lat
    route["start_lon"] = points[0].lon
    route["track_points"] = [
        {"lat": p.lat, "lon": p.lon, "ele": p.ele} for p in points
    ]
    SEED.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n",
                    encoding="utf-8")
    print(f"✓ seed aggiornato: {slug} — {len(points)} punti, "
          f"{stats.length_m/1000:.1f} km")


def ingest_pg(slug: str, points: list[gpx.TrackPoint],
              stats: gpx.TrackStats) -> None:
    from app import db
    wkt_line = "LINESTRING Z (" + ", ".join(
        f"{p.lon} {p.lat} {p.ele if p.ele is not None else 0}" for p in points
    ) + ")"
    with db.cursor() as cur:
        cur.execute("SELECT id FROM route WHERE slug = %s", (slug,))
        row = cur.fetchone()
        if row is None:
            sys.exit(f"route '{slug}' non trovata nel DB")
        rid = row["id"]
        cur.execute(
            """UPDATE route SET
                 start_point = ST_GeogFromText(%s),
                 summit_point = CASE WHEN %s THEN ST_GeogFromText(%s)
                                     ELSE summit_point END,
                 track = ST_GeogFromText(%s)
               WHERE id = %s""",
            (f"POINT({points[0].lon} {points[0].lat})",
             stats.highest is not None,
             (f"POINT({stats.highest.lon} {stats.highest.lat})"
              if stats.highest else "POINT(0 0)"),
             wkt_line, rid),
        )
        cur.execute("DELETE FROM route_sample WHERE route_id = %s", (rid,))
        for seq, p in enumerate(points):
            cur.execute(
                """INSERT INTO route_sample (route_id, seq, point, altitude_m)
                   VALUES (%s, %s, ST_GeogFromText(%s), %s)""",
                (rid, seq,
                 f"POINT Z ({p.lon} {p.lat} {p.ele if p.ele is not None else 0})",
                 round(p.ele) if p.ele is not None else None),
            )
    print(f"✓ DB aggiornato: {slug} — {len(points)} route_sample, "
          f"{stats.length_m/1000:.1f} km (slope/aspect: passa Earth Engine)")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("gpx_file", type=pathlib.Path)
    ap.add_argument("--route", required=True, help="route slug")
    ap.add_argument("--spacing", type=float, default=gpx.DEFAULT_SPACING_M)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true",
                    help="ignora i controlli di coerenza quota (usalo consapevolmente)")
    ap.add_argument("--track-source", default=None,
                    help='attribuzione/licenza della traccia, es. "Camptocamp.org route 123 (CC BY-SA)"')
    args = ap.parse_args()

    try:
        raw = gpx.parse_gpx(args.gpx_file.read_text(encoding="utf-8"))
    except (OSError, gpx.GpxError) as e:
        sys.exit(f"errore GPX: {e}")
    points = gpx.decimate(raw, args.spacing)
    stats = gpx.track_stats(points)

    # Route facts for the sanity gate (memory seed is the reference offline too).
    data = json.loads(SEED.read_text(encoding="utf-8"))
    route = next((r for r in data["routes"] if r["slug"] == args.route), None)
    if route is None:
        sys.exit(f"route '{args.route}' non trovata (seed). Crea prima la scheda.")

    problems = sanity_check(route, stats, args.force)
    if problems:
        print("✗ ingestione rifiutata (il GPX non corrisponde alla scheda?):",
              file=sys.stderr)
        for p in problems:
            print(f"   - {p}", file=sys.stderr)
        sys.exit(2)

    print(f"{args.route}: {stats.n_points} punti (da {len(raw)}), "
          f"{stats.length_m/1000:.2f} km, "
          f"quote {stats.min_ele_m}–{stats.max_ele_m} m, "
          f"D+ {stats.vertical_gain_m and round(stats.vertical_gain_m)} m")
    if args.dry_run:
        print("(dry-run: nessuna scrittura)")
        return
    if settings.database_url:
        ingest_pg(args.route, points, stats)
    ingest_memory(args.route, points, stats, track_source=args.track_source)


if __name__ == "__main__":
    main()
