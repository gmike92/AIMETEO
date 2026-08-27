"""
Import candidate routes from Camptocamp.org into route-db/seed_routes.json.

    python scripts/import_c2c.py [--max-per-area 3] [--dry-run]
        [--act skitouring --act hiking ...] [--from-file responses.json]

HARD RULE — nothing is invented: every value in an imported route comes
verbatim from the Camptocamp API or is null/omitted. All imported routes are
UNVERIFIED (verified_at: null); curation happens later.

Modes
-----
- live (default): queries https://api.camptocamp.org/routes per area bbox
  (EPSG:3857 metres), optionally filtered by --act (repeatable, c2c activity
  names). Requires httpx.
- --from-file <json>: offline mode, python stdlib only. The file is a JSON
  list whose items are either
    {"area_id": "<our area id>", "act": "<c2c act or null>", "response": <raw c2c response>}
  or a raw c2c search response ({"documents": [...]}) — in that case the area
  is inferred per document from its EPSG:3857 point geometry.

Idempotent: slugs already present in the seed are skipped. Prints a table of
added/skipped candidates with reasons.
"""
from __future__ import annotations

import argparse
import json
import math
import pathlib
import re
import sys
import unicodedata
from typing import Optional

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
SEED = REPO_ROOT / "route-db" / "seed_routes.json"

API_BASE = "https://api.camptocamp.org/routes"
EARTH_R = 6378137.0  # WGS84 spherical mercator radius (EPSG:3857)

#: Our 5 areas as WGS84 bounding boxes: (lat_min, lat_max, lon_min, lon_max).
AREAS: dict[str, tuple[float, float, float, float]] = {
    "area-ortles-cevedale": (46.25, 46.55, 10.35, 10.80),
    "area-dolomiti-fassa": (46.35, 46.55, 11.75, 12.00),
    "area-gran-paradiso": (45.40, 45.65, 7.05, 7.45),
    "area-dolomiti-ampezzo": (46.45, 46.65, 11.95, 12.25),
    "area-orobie": (45.90, 46.10, 9.75, 10.15),
    "area-alta-valcamonica": (46.10, 46.32, 10.20, 10.55),
    # Appennini (IT) — fuori copertura AINEVA, vedi area._note in seed_routes.json.
    "area-gran-sasso": (42.35, 42.55, 13.45, 13.75),
    "area-majella": (41.95, 42.20, 13.95, 14.25),
    "area-sibillini": (42.80, 43.05, 13.05, 13.35),
    # Alpi francesi (FR) — connettore bollettino non ancora integrato (placeholder).
    "area-ecrins": (44.80, 45.05, 6.15, 6.55),
    "area-vanoise": (45.25, 45.50, 6.75, 7.15),
    "area-mont-blanc-fr": (45.80, 45.98, 6.70, 7.00),
    # Alpi (IT) — copertura AINEVA reale, zone verificate in connectors/aineva.py.
    "area-alpi-giulie": (46.35, 46.55, 13.35, 13.65),
    "area-grigna-resegone": (45.78, 45.95, 9.35, 9.55),
    "area-alpi-marittime": (44.05, 44.25, 7.10, 7.40),
    "area-monte-rosa-it": (45.85, 46.05, 7.85, 8.05),
    "area-adamello-presanella": (46.10, 46.35, 10.82, 11.05),
    # Centro-sud e isole (IT) — fuori copertura AINEVA, vedi area._note in
    # seed_routes.json. Solo escursionismo/via_ferrata (niente scialpinismo/
    # alpinismo atteso: il c2c ACTIVITY_MAP li mapperebbe comunque se presenti,
    # ma il planner li bloccherebbe fail-closed senza bollettino).
    "area-apuane": (43.95, 44.15, 10.15, 10.45),
    "area-pollino": (39.85, 40.10, 15.95, 16.30),
    "area-finale-ligure": (44.14, 44.22, 8.28, 8.42),
    "area-sardegna-iglesiente": (39.15, 39.35, 8.50, 8.70),
    "area-sardegna-supramonte": (40.15, 40.35, 9.35, 9.60),
    "area-etna": (37.65, 37.85, 14.95, 15.15),
    "area-san-vito-lo-capo": (38.15, 38.22, 12.70, 12.80),
    "area-costiera-amalfitana": (40.60, 40.68, 14.48, 14.68),
    # Alpi svizzere (CH) / austriache (AT) / slovene (SI) — connettore
    # bollettino non ancora integrato (placeholder, vedi area._note).
    "area-zermatt-ch": (45.95, 46.05, 7.65, 7.85),
    "area-engadin-ch": (46.40, 46.60, 9.80, 10.10),
    "area-jungfrau-ch": (46.50, 46.70, 7.85, 8.10),
    "area-oetztal-at": (46.80, 47.05, 10.75, 11.05),
    "area-zillertal-at": (47.00, 47.20, 11.70, 12.00),
    "area-triglav-si": (46.28, 46.45, 13.70, 13.95),
}

#: Camptocamp activity -> our activity. Anything else (rock_climbing,
#: paragliding, ...) is ignored — non richiesto, resta fuori scope qui.
ACTIVITY_MAP = {
    "skitouring": "scialpinismo",
    "snow_ice_mixed": "alpinismo",
    "mountain_climbing": "alpinismo",
    "via_ferrata": "via_ferrata",
    "hiking": "escursionismo",
    "mountain_biking": "mtb_alpino",
}

#: Activities for which empty "orientations" is NOT acceptable (snow terrain).
SNOW_ACTIVITIES = {"scialpinismo", "alpinismo"}

#: c2c rating fields, in priority order, for diff_grade.
RATING_FIELDS = (
    "ski_rating",
    "global_rating",
    "via_ferrata_rating",
    "hiking_rating",
    "rock_free_rating",
)

#: Locale preference for the route title.
LOCALE_PREF = ("it", "fr", "en", "de", "sl")


# ── projections ─────────────────────────────────────────────────────────────
def to_mercator(lon: float, lat: float) -> tuple[float, float]:
    """WGS84 degrees -> EPSG:3857 metres."""
    x = lon * EARTH_R * math.pi / 180.0
    y = EARTH_R * math.log(math.tan(math.pi / 4.0 + lat * math.pi / 360.0))
    return x, y


def from_mercator(x: float, y: float) -> tuple[float, float]:
    """EPSG:3857 metres -> WGS84 degrees (lon, lat)."""
    lon = x / EARTH_R * 180.0 / math.pi
    lat = (2.0 * math.atan(math.exp(y / EARTH_R)) - math.pi / 2.0) * 180.0 / math.pi
    return lon, lat


def area_bbox_3857(area_id: str) -> tuple[float, float, float, float]:
    lat_min, lat_max, lon_min, lon_max = AREAS[area_id]
    xmin, ymin = to_mercator(lon_min, lat_min)
    xmax, ymax = to_mercator(lon_max, lat_max)
    return xmin, ymin, xmax, ymax


def build_url(area_id: str, act: Optional[str] = None, limit: int = 30) -> str:
    xmin, ymin, xmax, ymax = area_bbox_3857(area_id)
    url = f"{API_BASE}?bbox={xmin:.0f},{ymin:.0f},{xmax:.0f},{ymax:.0f}&limit={limit}"
    if act:
        url += f"&act={act}"
    return url


def area_for_point(lon: float, lat: float) -> Optional[str]:
    for area_id, (lat_min, lat_max, lon_min, lon_max) in AREAS.items():
        if lat_min <= lat <= lat_max and lon_min <= lon <= lon_max:
            return area_id
    return None


def area_for_doc(doc: dict) -> Optional[str]:
    """Infer our area from the document's EPSG:3857 point geometry."""
    geom = (doc.get("geometry") or {}).get("geom")
    if not geom:
        return None
    if isinstance(geom, str):
        try:
            geom = json.loads(geom)
        except ValueError:
            return None
    coords = geom.get("coordinates") if isinstance(geom, dict) else None
    if not coords or len(coords) < 2:
        return None
    lon, lat = from_mercator(float(coords[0]), float(coords[1]))
    return area_for_point(lon, lat)


# ── fetching (live mode only — never called in --from-file mode) ────────────
def fetch_json(url: str) -> dict:
    import httpx  # imported lazily: --from-file mode is stdlib-only

    resp = httpx.get(url, timeout=30.0,
                     headers={"User-Agent": "AIMETEO route importer"})
    resp.raise_for_status()
    return resp.json()


# ── mapping helpers (verbatim from the c2c document, or None) ───────────────
def slugify(text: str) -> str:
    ascii_text = (unicodedata.normalize("NFKD", text)
                  .encode("ascii", "ignore").decode("ascii"))
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def pick_title(doc: dict) -> Optional[str]:
    """Title in preferred locale (it > fr > en), 'prefix - title' when both exist."""
    locales = doc.get("locales") or []
    by_lang = {l.get("lang"): l for l in locales if isinstance(l, dict)}
    for lang in LOCALE_PREF:
        loc = by_lang.get(lang)
        if not loc:
            continue
        title = (loc.get("title") or "").strip()
        prefix = (loc.get("title_prefix") or "").strip()
        if not title and not prefix:
            continue
        return f"{prefix} - {title}" if prefix and title else (title or prefix)
    return None


def pick_activity(doc: dict, act_hint: Optional[str]) -> Optional[str]:
    """Our activity for this document. act_hint = c2c act used in the query
    (may be comma-separated, as accepted by the c2c API)."""
    acts = doc.get("activities") or []
    for hint in (act_hint.split(",") if act_hint else []):
        if hint in ACTIVITY_MAP and hint in acts:
            return ACTIVITY_MAP[hint]
    for a in acts:
        if a in ACTIVITY_MAP:
            return ACTIVITY_MAP[a]
    return None


def _is_int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def evaluate(doc: dict, area_id: str, act_hint: Optional[str],
             known_slugs: set[str]) -> tuple[Optional[dict], str]:
    """Map one c2c document to our route shape, or (None, reason)."""
    doc_id = doc.get("document_id")
    if doc_id is None:
        return None, "no document_id"

    if doc.get("quality") in ("draft", "empty"):
        return None, f"quality={doc.get('quality')}"

    activity = pick_activity(doc, act_hint)
    if activity is None:
        return None, "no mappable activity"

    if not _is_int(doc.get("elevation_min")) or not _is_int(doc.get("elevation_max")):
        return None, "missing elevation_min/elevation_max"

    name = pick_title(doc)
    if not name:
        return None, "no it/fr/en title"

    orientations = doc.get("orientations") or []
    if activity in SNOW_ACTIVITIES and not orientations:
        return None, "snow activity without orientations"

    name_slug = slugify(name)
    if not name_slug:
        return None, "empty slug after slugify"
    slug = f"{activity}-{name_slug}"
    if slug in known_slugs:
        return None, f"slug already exists ({slug})"

    diff_grade = next(
        (doc[f] for f in RATING_FIELDS if doc.get(f) is not None), "n.d.")

    route = {
        "slug": slug,
        "name": name,
        "area_id": area_id,
        "activity": activity,
        "diff_scale": "c2c",
        "diff_grade": diff_grade,
        "diff_index": None,
        "start_altitude_m": doc["elevation_min"],
        "max_altitude_m": doc["elevation_max"],
        "vertical_gain_m": doc.get("height_diff_up"),
        "avg_ascent_min": None,
        "avg_descent_min": None,
        "primary_aspects": orientations,
        "max_slope_deg": None,
        "ideal_conditions": None,
        "exposure_notes": None,
        "refuges": [],
        "source": f"Camptocamp.org route {doc_id} (CC BY-SA)",
        "source_url": f"https://www.camptocamp.org/routes/{doc_id}",
        "verified_at": None,
    }
    return route, "ok"


# ── batches: (area_id, act_hint, documents) ─────────────────────────────────
def batches_from_file(path: pathlib.Path) -> list[tuple[Optional[str], Optional[str], list[dict]]]:
    entries = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(entries, list):
        entries = [entries]
    out = []
    for entry in entries:
        if "documents" in entry:  # raw c2c response — infer area per document
            out.append((None, None, entry.get("documents") or []))
        else:
            resp = entry.get("response") or {}
            out.append((entry.get("area_id"), entry.get("act"),
                        resp.get("documents") or []))
    return out


def batches_live(acts: list[str]) -> list[tuple[Optional[str], Optional[str], list[dict]]]:
    out = []
    for area_id in AREAS:
        for act in (acts or [None]):
            url = build_url(area_id, act)
            print(f"GET {url}", file=sys.stderr)
            resp = fetch_json(url)
            out.append((area_id, act, resp.get("documents") or []))
    return out


# ── main ────────────────────────────────────────────────────────────────────
def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--max-per-area", type=int, default=3,
                    help="max NEW routes added per area (default 3)")
    ap.add_argument("--dry-run", action="store_true",
                    help="evaluate and print, write nothing")
    ap.add_argument("--act", action="append", default=[],
                    help="c2c activity filter for live queries (repeatable)")
    ap.add_argument("--from-file", type=pathlib.Path, default=None,
                    help="offline mode: JSON file with saved c2c search responses")
    args = ap.parse_args()

    data = json.loads(SEED.read_text(encoding="utf-8"))
    known_slugs = {r["slug"] for r in data["routes"]}

    if args.from_file:
        batches = batches_from_file(args.from_file)
    else:
        batches = batches_live(args.act)

    added_per_area = {a: 0 for a in AREAS}
    added: list[dict] = []
    rows: list[tuple[str, str, str, str]] = []  # area, doc_id, status, detail

    for batch_area, act_hint, documents in batches:
        for doc in documents:
            doc_id = str(doc.get("document_id", "?"))
            area_id = batch_area or area_for_doc(doc)
            if area_id is None:
                rows.append(("?", doc_id, "SKIP", "outside all area bboxes"))
                continue
            if added_per_area[area_id] >= args.max_per_area:
                rows.append((area_id, doc_id, "SKIP", "area quota reached"))
                continue
            route, reason = evaluate(doc, area_id, act_hint, known_slugs)
            if route is None:
                rows.append((area_id, doc_id, "SKIP", reason))
                continue
            known_slugs.add(route["slug"])
            added_per_area[area_id] += 1
            added.append(route)
            rows.append((area_id, doc_id, "ADD",
                         f"{route['slug']} [{route['activity']} "
                         f"{route['diff_grade']}]"))

    # report table
    w_area = max([len(r[0]) for r in rows] + [4])
    w_id = max([len(r[1]) for r in rows] + [6])
    print(f"{'AREA':<{w_area}}  {'C2C_ID':<{w_id}}  {'?':<4}  DETAIL")
    for area, doc_id, status, detail in rows:
        print(f"{area:<{w_area}}  {doc_id:<{w_id}}  {status:<4}  {detail}")
    print(f"\nadded: {len(added)} " +
          " ".join(f"{a}={n}" for a, n in added_per_area.items()))

    if args.dry_run:
        print("(dry-run: nessuna scrittura)")
        return
    if not added:
        print("nothing to add — seed unchanged")
        return
    data["routes"].extend(added)
    SEED.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n",
                    encoding="utf-8")
    print(f"✓ seed aggiornato: {SEED} — {len(data['routes'])} routes totali")


if __name__ == "__main__":
    main()
