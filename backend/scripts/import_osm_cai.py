"""
Import CAI hiking trails (Rete Escursionistica CAI, catasto REI) from
OpenStreetMap into route-db/seed_routes.json.

    python scripts/import_osm_cai.py [--max-per-area 2] [--dry-run]
        [--endpoint URL] [--from-file inputs.json]

HARD RULE — nothing is invented: every value comes verbatim from OSM (ODbL)
or from the Open-Meteo elevation API (Copernicus DEM), or is null.
All imported routes are UNVERIFIED (verified_at: null).

Pipeline
--------
Phase A (per area, light):
    [out:json][timeout:25];
    relation["route"="hiking"]["cai_scale"]["name"](S,W,N,E);
    out tags center 30;
Selection: name AND cai_scale required (the query enforces both); relations
    WITH ref are preferred; max --max-per-area NEW routes per area (default 2);
    slugs already in the seed are skipped.
Phase B (per chosen relation):
    [out:json][timeout:120];relation(ID);out geom;
    Way members are concatenated in the order given by the relation (a way is
    flipped only when its endpoints say so — always REAL OSM points, never
    interpolated), then decimated to ~100 m spacing, capped at 300 points.
Elevation: OSM has no elevations → Open-Meteo elevation API (Copernicus DEM),
    batched max 100 coordinates per call. start_altitude_m = first point,
    max_altitude_m = max, vertical_gain_m = sum of positive deltas (rounded).
Sanity gate (else DISCARD with reason): every decimated point inside the area
    bbox (+0.05 deg margin); track length 1–30 km; elevations 200–4000 m; no
    gap > 500 m between consecutive way members.

Modes
-----
- live (default): HTTP via httpx (imported lazily).
- --from-file <json>: offline, python stdlib only. The file is
    {"phase_a":   [{"area_id": "<our area id>", "response": <overpass json>}],
     "phase_b":   [{"response": <overpass 'out geom' json>}],
     "elevation": [{"latitude": [...], "longitude": [...],
                    "response": {"elevation": [...]}}]}
  When an input is missing the script prints the exact URLs still needed and
  exits with status 2 — fetch them, append to the file, re-run. Idempotent.
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
from urllib.parse import quote

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
SEED = REPO_ROOT / "route-db" / "seed_routes.json"

DEFAULT_ENDPOINT = "https://overpass-api.de/api/interpreter"
MIRROR_ENDPOINT = "https://overpass.kumi.systems/api/interpreter"
ELEVATION_API = "https://api.open-meteo.com/v1/elevation"

#: Our 5 areas as WGS84 bounding boxes: (lat_min, lat_max, lon_min, lon_max).
AREAS: dict[str, tuple[float, float, float, float]] = {
    "area-ortles-cevedale": (46.25, 46.55, 10.35, 10.80),
    "area-dolomiti-fassa": (46.35, 46.55, 11.75, 12.00),
    "area-gran-paradiso": (45.40, 45.65, 7.05, 7.45),
    "area-dolomiti-ampezzo": (46.45, 46.65, 11.95, 12.25),
    "area-orobie": (45.90, 46.10, 9.75, 10.15),
    # Alta Valle Camonica, centrata su Vezza d'Oglio: Val Grande, Aviolo,
    # Mortirolo, Case di Viso / Gavia sud, Adamello nord.
    "area-alta-valcamonica": (46.10, 46.32, 10.20, 10.55),
    # Appennini — stessa rete escursionistica CAI, fuori copertura AINEVA.
    "area-gran-sasso": (42.35, 42.55, 13.45, 13.75),
    "area-majella": (41.95, 42.20, 13.95, 14.25),
    "area-sibillini": (42.80, 43.05, 13.05, 13.35),
}

PHASE_A_LIMIT = 30       #: max relazioni per area in fase A (--phase-a-limit)
#: --include-unclassified: accetta anche relazioni SENZA cai_scale purché con
#: numero di sentiero (ref). La difficoltà resta "n.d." — mai inventata.
INCLUDE_UNCLASSIFIED = False
SPACING_M = 100.0        #: target decimation spacing
MAX_POINTS = 300         #: hard cap on track points
ELEV_BATCH = 100         #: Open-Meteo elevation API limit per call
MAX_GAP_M = 500.0        #: max gap between consecutive way members
BBOX_MARGIN_DEG = 0.05   #: tolerance around the area bbox
MIN_LEN_M, MAX_LEN_M = 1000.0, 30000.0
MIN_ELE_M, MAX_ELE_M = 200.0, 4000.0
#: member roles that are NOT the main line of the trail.
SKIP_ROLES = ("alternat", "excursion", "approach", "variant", "connection")


# ── geometry helpers ─────────────────────────────────────────────────────────
def hav(a: tuple[float, float], b: tuple[float, float]) -> float:
    """Haversine distance in metres between (lat, lon) pairs."""
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (math.sin((la2 - la1) / 2) ** 2
         + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2)
    return 2 * 6371000 * math.asin(math.sqrt(h))


def path_length(pts: list[tuple[float, float]]) -> float:
    return sum(hav(a, b) for a, b in zip(pts, pts[1:]))


def build_line(rel: dict) -> tuple[Optional[list[tuple[float, float]]], str]:
    """Concatenate way members (in relation order) into one (lat, lon) line.

    Only real OSM nodes are used. A way is reversed when its endpoints show it
    runs against the previous one. Returns (None, reason) when unusable.
    """
    geoms: list[list[tuple[float, float]]] = []
    for m in rel.get("members", []):
        if m.get("type") != "way" or not m.get("geometry"):
            continue
        role = (m.get("role") or "").lower()
        if any(s in role for s in SKIP_ROLES):
            continue
        g = [(p["lat"], p["lon"]) for p in m["geometry"]]
        if len(g) >= 2:
            geoms.append(g)
    if not geoms:
        return None, "nessun membro way con geometria"

    if len(geoms) >= 2:  # orient the first way against the second
        d_end = min(hav(geoms[0][-1], geoms[1][0]), hav(geoms[0][-1], geoms[1][-1]))
        d_start = min(hav(geoms[0][0], geoms[1][0]), hav(geoms[0][0], geoms[1][-1]))
        if d_start < d_end:
            geoms[0] = list(reversed(geoms[0]))

    pts = list(geoms[0])
    max_gap = 0.0
    for g in geoms[1:]:
        if hav(pts[-1], g[-1]) < hav(pts[-1], g[0]):
            g = list(reversed(g))
        gap = hav(pts[-1], g[0])
        max_gap = max(max_gap, gap)
        pts.extend(g[1:] if pts[-1] == g[0] else g)
    if max_gap > MAX_GAP_M:
        return None, f"membri non contigui (gap max {max_gap:.0f} m > {MAX_GAP_M:.0f} m)"
    return pts, "ok"


def decimate(pts: list[tuple[float, float]],
             spacing: float = SPACING_M,
             cap: int = MAX_POINTS) -> list[tuple[float, float]]:
    """Keep real points ~spacing metres apart (never interpolate), cap total."""
    total = path_length(pts)
    if total / spacing + 1 > cap:
        spacing = total / (cap - 1)
    out = [pts[0]]
    acc = 0.0
    for a, b in zip(pts, pts[1:]):
        acc += hav(a, b)
        if acc >= spacing:
            out.append(b)
            acc = 0.0
    if out[-1] != pts[-1]:
        out.append(pts[-1])
    if len(out) > cap:
        out = out[: cap - 1] + [out[-1]]
    return out


# ── queries / URLs ───────────────────────────────────────────────────────────
def phase_a_query(area_id: str) -> str:
    lat_min, lat_max, lon_min, lon_max = AREAS[area_id]
    bbox = f"({lat_min},{lon_min},{lat_max},{lon_max})"
    if INCLUDE_UNCLASSIFIED:
        # unione: classificati (cai_scale) + numerati senza classificazione (ref)
        sel = (f'(relation["route"="hiking"]["cai_scale"]["name"]{bbox};'
               f'relation["route"="hiking"]["ref"]["name"]{bbox};);')
    else:
        sel = f'relation["route"="hiking"]["cai_scale"]["name"]{bbox};'
    return f'[out:json][timeout:25];{sel}out tags center {PHASE_A_LIMIT};'


def phase_b_query(rel_id: int) -> str:
    return f"[out:json][timeout:120];relation({rel_id});out geom;"


def overpass_url(endpoint: str, query: str) -> str:
    return f"{endpoint}?data={quote(query, safe='')}"


def elev_key(lat: float, lon: float) -> tuple[float, float]:
    return (round(float(lat), 6), round(float(lon), 6))


def elevation_batches(coords: list[tuple[float, float]]
                      ) -> list[list[tuple[float, float]]]:
    return [coords[i:i + ELEV_BATCH] for i in range(0, len(coords), ELEV_BATCH)]


def elevation_url(batch: list[tuple[float, float]]) -> str:
    lats = ",".join(f"{lat:.6f}" for lat, _ in batch)
    lons = ",".join(f"{lon:.6f}" for _, lon in batch)
    return f"{ELEVATION_API}?latitude={lats}&longitude={lons}"


# ── mapping helpers (verbatim from OSM tags, or None) ────────────────────────
def slugify(text: str) -> str:
    ascii_text = (unicodedata.normalize("NFKD", text)
                  .encode("ascii", "ignore").decode("ascii"))
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


def candidates_for_area(resp: dict) -> list[dict]:
    """Phase-A relations mapped to candidates, ref-holders first."""
    cands = []
    for el in resp.get("elements", []):
        if el.get("type") != "relation" or not el.get("tags"):
            continue
        tags = el["tags"]
        name = (tags.get("name") or "").strip()
        cai_scale = (tags.get("cai_scale") or "").strip()
        ref = (tags.get("ref") or "").strip() or None
        if not name:
            continue
        if not cai_scale and not (INCLUDE_UNCLASSIFIED and ref):
            continue  # regola: cai_scale, oppure (col flag) almeno il ref
        if ref and not name.lower().startswith(f"sentiero {ref}".lower()):
            display = f"Sentiero {ref} — {name}"
        else:
            display = name
        slug = "escursionismo-" + slugify(display)
        if not slugify(display):
            continue
        cands.append({"id": el["id"], "name": name, "ref": ref,
                      "cai_scale": cai_scale, "display": display, "slug": slug})
    cands.sort(key=lambda c: (c["ref"] is None, c["id"]))
    return cands


def build_route(area_id: str, cand: dict, coords: list[tuple[float, float]],
                eles: list[float], length_m: float) -> dict:
    rid = cand["id"]
    source = f"Rete Escursionistica CAI via OpenStreetMap (ODbL) — relation {rid}"
    gain = sum(max(0.0, b - a) for a, b in zip(eles, eles[1:]))
    return {
        "slug": cand["slug"],
        "name": cand["display"],
        "area_id": area_id,
        "activity": "escursionismo",
        "diff_scale": "cai",
        "diff_grade": cand["cai_scale"] or "n.d.",  # mai inventata
        "diff_index": None,
        "start_altitude_m": round(eles[0]),
        "max_altitude_m": round(max(eles)),
        "vertical_gain_m": round(gain),
        "avg_ascent_min": None,
        "avg_descent_min": None,
        "primary_aspects": [],
        "max_slope_deg": None,
        "ideal_conditions": None,
        "exposure_notes": None,
        "refuges": [],
        "season_months": None,
        "source": source,
        "source_url": f"https://www.openstreetmap.org/relation/{rid}",
        "verified_at": None,
        "start_lat": coords[0][0],
        "start_lon": coords[0][1],
        "track_points": [
            {"lat": lat, "lon": lon, "ele": ele}
            for (lat, lon), ele in zip(coords, eles)
        ],
        "track_source": source,
    }


def sanity(area_id: str, coords: list[tuple[float, float]],
           eles: list[float], length_m: float) -> Optional[str]:
    """Reason to discard, or None if the track passes every gate."""
    lat_min, lat_max, lon_min, lon_max = AREAS[area_id]
    m = BBOX_MARGIN_DEG
    for lat, lon in coords:
        if not (lat_min - m <= lat <= lat_max + m
                and lon_min - m <= lon <= lon_max + m):
            return f"punto ({lat:.5f},{lon:.5f}) fuori dal bbox di {area_id}"
    if not (MIN_LEN_M <= length_m <= MAX_LEN_M):
        return f"lunghezza {length_m / 1000:.1f} km fuori range 1-30 km"
    for e in eles:
        if e is None or not (MIN_ELE_M <= e <= MAX_ELE_M):
            return f"quota {e} m fuori range {MIN_ELE_M:.0f}-{MAX_ELE_M:.0f} m"
    return None


# ── input providers (live vs --from-file) ────────────────────────────────────
class LiveProvider:
    """Fetches from Overpass (with mirror fallback) and Open-Meteo via httpx."""

    def __init__(self, endpoint: str):
        self.endpoint = endpoint

    def _get(self, url: str, read_timeout: float = 180.0) -> dict:
        import httpx  # lazy: --from-file mode is stdlib-only

        # le query "out geom" possono impiegare minuti: read timeout generoso
        resp = httpx.get(url, timeout=httpx.Timeout(10.0, read=read_timeout),
                         headers={"User-Agent": "AIMETEO route importer (contatto: repo gmike92/AIMETEO)"})
        resp.raise_for_status()
        return resp.json()

    def _overpass(self, query: str) -> dict:
        import time
        # Overpass fa rate limiting: 2 tentativi per endpoint con pausa crescente
        attempts = [(self.endpoint, 0), (self.endpoint, 20),
                    (MIRROR_ENDPOINT, 5), (MIRROR_ENDPOINT, 30)]
        last = None
        for endpoint, pause in attempts:
            if pause:
                print(f"  … attendo {pause}s (rate limit Overpass)", file=sys.stderr)
                time.sleep(pause)
            url = overpass_url(endpoint, query)
            try:
                print(f"GET {url}", file=sys.stderr)
                return self._get(url)
            except Exception as exc:  # noqa: BLE001 — retry/mirror
                last = exc
                print(f"  ! {endpoint}: {exc}", file=sys.stderr)
        # NIENTE abort globale: il chiamante salta l'elemento e prosegue.
        print(f"  ✗ rinuncio dopo 4 tentativi ({last})", file=sys.stderr)
        return None

    def phase_a(self, area_id: str) -> Optional[dict]:
        return self._overpass(phase_a_query(area_id))

    PAUSA_TRA_RELAZIONI = 10  # secondi, cortesia verso Overpass

    def phase_b(self, rel_id: int) -> Optional[dict]:
        import time
        time.sleep(self.PAUSA_TRA_RELAZIONI)
        el = self._overpass(phase_b_query(rel_id))
        if el is None:
            return None  # relazione saltata, si prosegue con le altre
        for element in el.get("elements", []):
            if element.get("type") == "relation" and element.get("id") == rel_id:
                return element
        return None

    def elevations(self, coords: list[tuple[float, float]]
                   ) -> Optional[list[float]]:
        import time
        out: list[float] = []
        for batch in elevation_batches(coords):
            url = elevation_url(batch)
            print(f"GET {ELEVATION_API} ({len(batch)} punti)", file=sys.stderr)
            resp = None
            # anche l'API quote può avere timeout transitori: 3 tentativi,
            # poi None → il chiamante marca PEND e la run PROSEGUE.
            for pause in (0, 10, 30):
                if pause:
                    print(f"  … riprovo tra {pause}s", file=sys.stderr)
                    time.sleep(pause)
                try:
                    resp = self._get(url, read_timeout=60.0)
                    break
                except Exception as exc:  # noqa: BLE001 — retry
                    print(f"  ! elevation API: {exc}", file=sys.stderr)
            if resp is None:
                return None
            eles = resp.get("elevation") or []
            if len(eles) != len(batch):
                print(f"  ! elevation API: attesi {len(batch)} valori, "
                      f"ricevuti {len(eles)} — salto", file=sys.stderr)
                return None
            out.extend(float(e) for e in eles)
        return out

    def missing(self) -> list[str]:
        return []


class FileProvider:
    """Serves saved responses; records the URLs still needed."""

    def __init__(self, path: pathlib.Path, endpoint: str):
        payload = json.loads(path.read_text(encoding="utf-8"))
        self.endpoint = endpoint
        self.a_by_area = {e["area_id"]: e["response"]
                          for e in payload.get("phase_a", [])}
        self.b_by_id: dict[int, dict] = {}
        for e in payload.get("phase_b", []):
            for el in (e.get("response") or {}).get("elements", []):
                if el.get("type") == "relation":
                    self.b_by_id[el["id"]] = el
        self.elev: dict[tuple[float, float], float] = {}
        for e in payload.get("elevation", []):
            lats = e.get("latitude") or []
            lons = e.get("longitude") or []
            eles = (e.get("response") or {}).get("elevation") or []
            for lat, lon, ele in zip(lats, lons, eles):
                self.elev[elev_key(lat, lon)] = float(ele)
        self._missing: list[str] = []

    def phase_a(self, area_id: str) -> Optional[dict]:
        resp = self.a_by_area.get(area_id)
        if resp is None:
            self._missing.append(
                f"[phase_a {area_id}] "
                f"{overpass_url(self.endpoint, phase_a_query(area_id))}")
        return resp

    def phase_b(self, rel_id: int) -> Optional[dict]:
        el = self.b_by_id.get(rel_id)
        if el is None:
            self._missing.append(
                f"[phase_b relation {rel_id}] "
                f"{overpass_url(self.endpoint, phase_b_query(rel_id))}")
        return el

    def elevations(self, coords: list[tuple[float, float]]
                   ) -> Optional[list[float]]:
        missing_batches = [
            b for b in elevation_batches(coords)
            if any(elev_key(lat, lon) not in self.elev for lat, lon in b)]
        if missing_batches:
            for b in missing_batches:
                self._missing.append(f"[elevation {len(b)} punti] {elevation_url(b)}")
            return None
        return [self.elev[elev_key(lat, lon)] for lat, lon in coords]

    def missing(self) -> list[str]:
        return self._missing


# ── main ─────────────────────────────────────────────────────────────────────
def main() -> None:
    global PHASE_A_LIMIT, INCLUDE_UNCLASSIFIED
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--max-per-area", type=int, default=2,
                    help="max NEW routes added per area (default 2)")
    ap.add_argument("--dry-run", action="store_true",
                    help="evaluate and print, write nothing")
    ap.add_argument("--endpoint", default=DEFAULT_ENDPOINT,
                    help=f"Overpass endpoint (default {DEFAULT_ENDPOINT})")
    ap.add_argument("--from-file", type=pathlib.Path, default=None,
                    help="offline mode: JSON file with saved responses")
    ap.add_argument("--area", choices=sorted(AREAS), default=None,
                    help="importa solo quest'area (default: tutte)")
    ap.add_argument("--phase-a-limit", type=int, default=PHASE_A_LIMIT,
                    help="max relazioni candidate per area (default 30)")
    ap.add_argument("--include-unclassified", action="store_true",
                    help="accetta sentieri con ref ma senza cai_scale "
                         "(difficoltà resta n.d.)")
    args = ap.parse_args()
    PHASE_A_LIMIT = args.phase_a_limit
    INCLUDE_UNCLASSIFIED = args.include_unclassified

    data = json.loads(SEED.read_text(encoding="utf-8"))
    known_slugs = {r["slug"] for r in data["routes"]}

    provider = (FileProvider(args.from_file, args.endpoint)
                if args.from_file else LiveProvider(args.endpoint))

    added: list[dict] = []
    rows: list[tuple[str, str, str, str]] = []  # area, rel_id, status, detail

    for area_id in ([args.area] if args.area else AREAS):
        resp_a = provider.phase_a(area_id)
        if resp_a is None:
            rows.append((area_id, "-", "PEND", "manca la risposta fase A"))
            continue
        n_done = 0  # ADD + PEND for this area
        for cand in candidates_for_area(resp_a):
            if n_done >= args.max_per_area:
                break
            rid = str(cand["id"])
            if cand["slug"] in known_slugs:
                rows.append((area_id, rid, "SKIP",
                             f"slug già presente ({cand['slug']})"))
                continue
            rel = provider.phase_b(cand["id"])
            if rel is None:
                # geometria non recuperata: NON consuma il posto, prova la prossima
                rows.append((area_id, rid, "PEND", "manca la geometria fase B"))
                continue
            line, reason = build_line(rel)
            if line is None:
                rows.append((area_id, rid, "SKIP", reason))
                continue
            length_m = path_length(line)
            if not (MIN_LEN_M <= length_m <= MAX_LEN_M):
                rows.append((area_id, rid, "SKIP",
                             f"lunghezza {length_m / 1000:.1f} km fuori range 1-30 km"))
                continue
            coords = decimate(line)
            eles = provider.elevations(coords)
            if eles is None:
                rows.append((area_id, rid, "PEND", "mancano le quote DEM"))
                n_done += 1
                continue
            reason = sanity(area_id, coords, eles, length_m)
            if reason:
                rows.append((area_id, rid, "SKIP", reason))
                continue
            route = build_route(area_id, cand, coords, eles, length_m)
            known_slugs.add(route["slug"])
            added.append(route)
            n_done += 1
            rows.append((area_id, rid, "ADD",
                         f"{route['slug']} [{route['diff_grade']}, "
                         f"{length_m / 1000:.1f} km, {len(coords)} punti, "
                         f"{route['start_altitude_m']}→{route['max_altitude_m']} m]"))

    w_area = max([len(r[0]) for r in rows] + [4])
    w_id = max([len(r[1]) for r in rows] + [6])
    print(f"{'AREA':<{w_area}}  {'OSM_REL':<{w_id}}  {'?':<4}  DETAIL")
    for area, rid, status, detail in rows:
        print(f"{area:<{w_area}}  {rid:<{w_id}}  {status:<4}  {detail}")

    missing = provider.missing()
    if missing:
        print(f"\nINPUT MANCANTI ({len(missing)}) — fetch e riesegui:")
        for m in missing:
            print(f"  {m}")
        raise SystemExit(2)

    print(f"\nadded: {len(added)}")
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
