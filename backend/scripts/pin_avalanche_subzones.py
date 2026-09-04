"""
Pin the exact EAWS micro-region (`avalanche_subzone`) for areas that only have
a macro-region (`avalanche_zone`) — i.e. areas whose bulletin still falls back
to caaml.py's conservative rule ("most dangerous bulletin in the whole file")
instead of the bulletin for their actual valley.

    python scripts/pin_avalanche_subzones.py [--dry-run]
        [--verify-date YYYY-MM-DD] [--skip-verify] [--area area-id ...]

HARD RULE — nothing is invented: every subzone written here is a real EAWS
regionID, taken verbatim from the official eaws-regions boundary dataset and
then CONFIRMED to appear in an actual bulletin before being written. A point
that doesn't resolve cleanly (falls outside every polygon, or sits on a real
boundary between two micro-regions) is reported and left null — never guessed,
never a coin flip resolved silently.

Source: https://gitlab.com/eaws/eaws-regions (public, no auth), one GeoJSON
file per macro-region:
    https://gitlab.com/eaws/eaws-regions/-/raw/master/public/micro-regions/{ZONE}_micro-regions.geojson.json
Some of these files carry retired boundary revisions alongside the current
ones (verified for IT-25) — only features with end_date == null are ever
matched against.

Idempotent: only areas with avalanche_subzone == null are considered, and a
pin is only written after it's confirmed present in a real bulletin (see
--verify-date). Prints a table of area -> resolved subzone (or why not).
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
from datetime import date
from typing import Optional

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from import_c2c import AREAS  # noqa: E402 — bbox source of truth, shared with the c2c importer

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
SEED = REPO_ROOT / "route-db" / "seed_routes.json"

REGIONS_BASE = "https://gitlab.com/eaws/eaws-regions/-/raw/master/public/micro-regions"
BULLETIN_BASE = "https://static.avalanche.report/eaws_bulletins"

# A real winter date, so the verification fetch actually finds a published
# bulletin — "today" during dev is very often off-season and would 404 every
# zone regardless of whether the pin itself is correct.
DEFAULT_VERIFY_DATE = date(2026, 2, 15)

# Small same-ZONE-only offset ring — never crosses into a neighbouring zone's
# file. Used only when the bbox center itself lands on no polygon at all, to
# tell "a few km off, one clear answer" apart from "genuine tie" or "nothing
# nearby" (see module docstring — the tie case must stay null).
OFFSET_DEGREES = (0.03, 0.05, 0.08, 0.12)
OFFSET_DIRECTIONS = [(1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)]


# ── geometry: hand-rolled point-in-polygon, no new dependency ──────────────
def _point_in_ring(lon: float, lat: float, ring: list) -> bool:
    """Even-odd ray casting. Ring points are [lon, lat, elevation] — elevation ignored."""
    inside = False
    n = len(ring)
    j = n - 1
    for i in range(n):
        xi, yi = ring[i][0], ring[i][1]
        xj, yj = ring[j][0], ring[j][1]
        if ((yi > lat) != (yj > lat)) and (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside


def _point_in_polygon(lon: float, lat: float, polygon: list) -> bool:
    """polygon = [outer_ring, hole_ring, ...] (GeoJSON Polygon.coordinates)."""
    if not _point_in_ring(lon, lat, polygon[0]):
        return False
    return not any(_point_in_ring(lon, lat, hole) for hole in polygon[1:])


def point_in_geometry(lon: float, lat: float, geometry: dict) -> bool:
    if geometry["type"] == "Polygon":
        return _point_in_polygon(lon, lat, geometry["coordinates"])
    if geometry["type"] == "MultiPolygon":
        return any(_point_in_polygon(lon, lat, poly) for poly in geometry["coordinates"])
    return False


def find_region(lon: float, lat: float, features: list) -> Optional[str]:
    for f in features:
        if f["properties"].get("end_date") is not None:
            continue  # retired boundary revision — never match against these
        if point_in_geometry(lon, lat, f["geometry"]):
            return f["properties"]["id"]
    return None


def fetch_regions(zone: str) -> list:
    import httpx  # lazy: keeps this module importable offline (e.g. from tests)

    url = f"{REGIONS_BASE}/{zone}_micro-regions.geojson.json"
    resp = httpx.get(url, timeout=20.0, headers={"Accept": "application/json"})
    resp.raise_for_status()
    return resp.json().get("features", [])


def fetch_bulletin_region_ids(zone: str, on: date) -> set[str]:
    import httpx

    url = f"{BULLETIN_BASE}/{on.isoformat()}/{on.isoformat()}-{zone}.json"
    resp = httpx.get(url, timeout=20.0, headers={"Accept": "application/json"})
    if resp.status_code != 200:
        return set()
    data = resp.json()
    return {
        r.get("regionID")
        for b in data.get("bulletins", [])
        for r in b.get("regions", [])
        if r.get("regionID")
    }


def resolve_with_offsets(lat: float, lon: float, features: list) -> tuple[Optional[str], str]:
    """
    Center matched nothing — sample a small same-zone ring around it.
    Returns (candidate_or_None, explanation). A single agreeing candidate is
    "resolved via offset"; disagreeing candidates are a genuine tie (never
    picked for you); no candidates at all means no reliable answer nearby.
    """
    found: set[str] = set()
    for deg in OFFSET_DEGREES:
        for dx, dy in OFFSET_DIRECTIONS:
            rid = find_region(lon + dx * deg, lat + dy * deg, features)
            if rid:
                found.add(rid)
        if found:
            break  # smallest radius that found anything wins — don't widen further
    if len(found) == 1:
        return next(iter(found)), f"offset match (±{deg}°)"
    if len(found) > 1:
        return None, f"TIE — candidates {sorted(found)} (±{deg}°), a real boundary case, not a data gap"
    return None, "no candidate found even with offset search"


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true", help="Evaluate and print, write nothing")
    ap.add_argument("--verify-date", type=date.fromisoformat, default=DEFAULT_VERIFY_DATE,
                     help="Winter date (YYYY-MM-DD) used to confirm a candidate subzone is real")
    ap.add_argument("--skip-verify", action="store_true",
                     help="Write candidates without live verification (escape hatch if the mirror is down)")
    ap.add_argument("--area", action="append", default=[], help="Limit to these area ids (repeatable)")
    args = ap.parse_args()

    data = json.loads(SEED.read_text(encoding="utf-8"))
    areas_by_id = {a["id"]: a for a in data["areas"]}

    targets = [
        a for a in data["areas"]
        if a.get("avalanche_subzone") is None
        and a.get("avalanche_zone")
        and a["id"] in AREAS
        and (not args.area or a["id"] in args.area)
    ]
    if not targets:
        print("nothing to pin — every area already has a subzone (or none matched --area)")
        return

    zones_needed = sorted({a["avalanche_zone"] for a in targets})
    print(f"fetching {len(zones_needed)} region file(s): {', '.join(zones_needed)}")
    regions_by_zone: dict[str, list] = {}
    for zone in zones_needed:
        try:
            regions_by_zone[zone] = fetch_regions(zone)
        except Exception as e:  # noqa: BLE001 — report and skip, never crash the whole run
            print(f"  ! could not fetch {zone}: {e}")
            regions_by_zone[zone] = []

    rows = []  # (area_id, zone, status, subzone_or_None, detail)
    for a in targets:
        area_id = a["id"]
        zone = a["avalanche_zone"]
        lat_min, lat_max, lon_min, lon_max = AREAS[area_id]
        lat, lon = (lat_min + lat_max) / 2, (lon_min + lon_max) / 2
        features = regions_by_zone.get(zone) or []
        if not features:
            rows.append((area_id, zone, "NO DATA", None, "region file unavailable"))
            continue

        candidate = find_region(lon, lat, features)
        detail = "center match"
        if candidate is None:
            candidate, detail = resolve_with_offsets(lat, lon, features)
            if candidate is None:
                rows.append((area_id, zone, "NO MATCH", None, detail))
                continue

        corners = {
            find_region(clon, clat, features)
            for clat in (lat_min, lat_max) for clon in (lon_min, lon_max)
        }
        corners.discard(candidate)
        corners.discard(None)
        if corners:
            detail += f" (bbox corners also touch: {', '.join(sorted(corners))})"

        if args.skip_verify:
            rows.append((area_id, zone, "PINNED (unverified)", candidate, detail))
            continue

        real_ids = fetch_bulletin_region_ids(zone, args.verify_date)
        if not real_ids:
            rows.append((area_id, zone, "NO MATCH", None,
                         f"{detail} — could not verify (no bulletin for {args.verify_date} in {zone})"))
            continue
        if candidate not in real_ids:
            rows.append((area_id, zone, "NO MATCH", None,
                         f"{detail} — {candidate} not found in live bulletin, refusing to write it"))
            continue
        rows.append((area_id, zone, "PINNED", candidate, f"{detail} — verified in live bulletin"))

    w_area = max(len(r[0]) for r in rows)
    w_zone = max(len(r[1]) for r in rows)
    w_status = max(len(r[2]) for r in rows)
    print(f"\n{'AREA':<{w_area}}  {'ZONE':<{w_zone}}  {'STATUS':<{w_status}}  {'SUBZONE':<16}  DETAIL")
    for area_id, zone, status, subzone, detail in rows:
        print(f"{area_id:<{w_area}}  {zone:<{w_zone}}  {status:<{w_status}}  {str(subzone or '—'):<16}  {detail}")

    pinned = [(a, s) for a, _, status, s, _ in rows if status.startswith("PINNED")]
    left_null = len(rows) - len(pinned)
    print(f"\npinned: {len(pinned)}  left null: {left_null}")

    if args.dry_run:
        print("(dry-run: nessuna scrittura)")
        return
    if not pinned:
        print("nothing to write — seed unchanged")
        return
    for area_id, subzone in pinned:
        areas_by_id[area_id]["avalanche_subzone"] = subzone
    SEED.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"✓ seed aggiornato: {SEED} — {len(pinned)} avalanche_subzone pinnati")


if __name__ == "__main__":
    main()
