"""
Import MTB trails from OpenStreetMap into route-db/seed_routes.json.

    python scripts/import_osm_mtb.py [--max-per-area 3] [--dry-run]
        [--endpoint URL] [--from-file inputs.json] [--area area-id]

Perché serve: le uniche 27 route mtb_alpino esistenti (import_c2c.py) non
hanno NESSUNA geometria (Camptocamp non la espone in quel modo) — zero
track_points/start_lat/start_lon, quindi zero corrispondenza sulla mappa.
Questo importer usa lo stesso identico pattern di import_osm_hiking.py
(fase A candidati -> fase B geometria -> decima -> quota Open-Meteo ->
sanity gate) ma sul tag globale `route=mtb`, che PORTA sempre una geometria
reale via way members.

Difficoltà: tag `mtb:scale` (0-6, convenzione OSM globale) verbatim se
presente, altrimenti "n.d." — mai inventata.

HARD RULE — nothing is invented: ogni valore viene verbatim da OSM (ODbL) o
dall'Open-Meteo elevation API (Copernicus DEM), o è null. Tutte le route
importate sono UNVERIFIED (verified_at: null).

Modes
-----
- live (default): HTTP via httpx (imported lazily).
- --from-file <json>: offline, stessa forma di import_osm_hiking.py.
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

#: bbox (lat_min, lat_max, lon_min, lon_max). Riusa le stesse aree/bbox già
#: note ad altri importer dove esistono (area-*-ch/at/it), più mete MTB
#: globalmente note per le nuove nazioni (dove mtb_alpino era 0).
AREAS: dict[str, tuple[float, float, float, float]] = {
    "area-finale-ligure": (44.14, 44.22, 8.28, 8.42),        # IT — enduro/MTB mecca europea
    "area-dolomiti-fassa": (46.35, 46.55, 11.75, 12.00),      # IT
    "area-zermatt-ch": (45.95, 46.05, 7.65, 7.85),            # CH
    "area-oetztal-at": (46.80, 47.05, 10.75, 11.05),          # AT
    "area-zillertal-at": (47.00, 47.20, 11.70, 12.00),        # AT
    "area-whistler-ca": (49.95, 50.20, -123.20, -122.80),     # CA — Whistler Bike Park
    "area-moab-us": (38.35, 38.75, -109.75, -109.35),         # US — slickrock/enduro mecca
    "area-queenstown-nz": (-45.15, -44.85, 168.55, 168.90),   # NZ
    "area-niseko-jp": (42.75, 42.95, 140.60, 140.75),         # JP
    "area-morzine-fr": (46.15, 46.25, 6.65, 6.80),            # FR — Portes du Soleil bike park
    "area-winterberg-de": (51.16, 51.22, 8.50, 8.60),         # DE — Bikepark Winterberg
}

PHASE_A_LIMIT = 30
SPACING_M = 50.0     # sentieri MTB più corti/tortuosi dei trekking: spaziatura più fitta
MAX_POINTS = 300
ELEV_BATCH = 100
MAX_GAP_M = 500.0
BBOX_MARGIN_DEG = 0.05
MIN_LEN_M, MAX_LEN_M = 300.0, 40000.0
MIN_ELE_M, MAX_ELE_M = -50.0, 4500.0
SKIP_ROLES = ("alternat", "excursion", "approach", "variant", "connection")


# ── geometry helpers (identiche a import_osm_hiking.py) ─────────────────────
def hav(a: tuple[float, float], b: tuple[float, float]) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = (math.sin((la2 - la1) / 2) ** 2
         + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2)
    return 2 * 6371000 * math.asin(math.sqrt(h))


def path_length(pts: list[tuple[float, float]]) -> float:
    return sum(hav(a, b) for a, b in zip(pts, pts[1:]))


def build_line(rel: dict) -> tuple[Optional[list[tuple[float, float]]], str]:
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

    if len(geoms) >= 2:
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
    return f'[out:json][timeout:25];relation["route"="mtb"]["name"]{bbox};out tags center {PHASE_A_LIMIT};'


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
    cands = []
    for el in resp.get("elements", []):
        if el.get("type") != "relation" or not el.get("tags"):
            continue
        tags = el["tags"]
        name = (tags.get("name") or "").strip()
        ref = (tags.get("ref") or "").strip() or None
        if not name:
            continue
        display = f"{name} ({ref})" if ref and ref not in name else name
        slug = "mtb_alpino-" + slugify(display) + f"-{el['id']}"
        if not slugify(display):
            continue
        cands.append({"id": el["id"], "name": name, "ref": ref,
                      "mtb_scale": (tags.get("mtb:scale") or "").strip(),
                      "display": display, "slug": slug})
    cands.sort(key=lambda c: (c["ref"] is None, c["id"]))
    return cands


def build_route(area_id: str, cand: dict, coords: list[tuple[float, float]],
                eles: list[float], length_m: float) -> dict:
    rid = cand["id"]
    source = f"OpenStreetMap (ODbL) — relation {rid}"
    gain = sum(max(0.0, b - a) for a, b in zip(eles, eles[1:]))
    return {
        "slug": cand["slug"],
        "name": cand["display"],
        "area_id": area_id,
        "activity": "mtb_alpino",
        "diff_scale": "OSM",
        "diff_grade": cand["mtb_scale"] or "n.d.",  # mai inventata
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
    lat_min, lat_max, lon_min, lon_max = AREAS[area_id]
    m = BBOX_MARGIN_DEG
    for lat, lon in coords:
        if not (lat_min - m <= lat <= lat_max + m
                and lon_min - m <= lon <= lon_max + m):
            return f"punto ({lat:.5f},{lon:.5f}) fuori dal bbox di {area_id}"
    if not (MIN_LEN_M <= length_m <= MAX_LEN_M):
        return f"lunghezza {length_m / 1000:.1f} km fuori range {MIN_LEN_M/1000:.1f}-{MAX_LEN_M/1000:.0f} km"
    for e in eles:
        if e is None or not (MIN_ELE_M <= e <= MAX_ELE_M):
            return f"quota {e} m fuori range {MIN_ELE_M:.0f}-{MAX_ELE_M:.0f} m"
    return None


# ── input providers (live vs --from-file) ────────────────────────────────────
class LiveProvider:
    def __init__(self, endpoint: str):
        self.endpoint = endpoint

    def _get(self, url: str, read_timeout: float = 180.0) -> dict:
        import httpx

        resp = httpx.get(url, timeout=httpx.Timeout(10.0, read=read_timeout),
                         headers={"User-Agent": "AIMETEO route importer (contatto: repo gmike92/AIMETEO)"})
        resp.raise_for_status()
        return resp.json()

    def _overpass(self, query: str) -> dict:
        import time
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
            except Exception as exc:  # noqa: BLE001
                last = exc
                print(f"  ! {endpoint}: {exc}", file=sys.stderr)
        print(f"  ✗ rinuncio dopo 4 tentativi ({last})", file=sys.stderr)
        return None

    def phase_a(self, area_id: str) -> Optional[dict]:
        return self._overpass(phase_a_query(area_id))

    PAUSA_TRA_RELAZIONI = 10

    def phase_b(self, rel_id: int) -> Optional[dict]:
        import time
        time.sleep(self.PAUSA_TRA_RELAZIONI)
        el = self._overpass(phase_b_query(rel_id))
        if el is None:
            return None
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
            for pause in (0, 10, 30):
                if pause:
                    print(f"  … riprovo tra {pause}s", file=sys.stderr)
                    time.sleep(pause)
                try:
                    resp = self._get(url, read_timeout=60.0)
                    break
                except Exception as exc:  # noqa: BLE001
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
    global PHASE_A_LIMIT
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--max-per-area", type=int, default=3)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--endpoint", default=DEFAULT_ENDPOINT)
    ap.add_argument("--from-file", type=pathlib.Path, default=None)
    ap.add_argument("--area", choices=sorted(AREAS), default=None,
                    help="importa solo quest'area (default: tutte)")
    ap.add_argument("--phase-a-limit", type=int, default=PHASE_A_LIMIT)
    args = ap.parse_args()
    PHASE_A_LIMIT = args.phase_a_limit

    data = json.loads(SEED.read_text(encoding="utf-8"))
    known_slugs = {r["slug"] for r in data["routes"]}

    provider = (FileProvider(args.from_file, args.endpoint)
                if args.from_file else LiveProvider(args.endpoint))

    added: list[dict] = []
    rows: list[tuple[str, str, str, str]] = []

    for area_id in ([args.area] if args.area else AREAS):
        resp_a = provider.phase_a(area_id)
        if resp_a is None:
            rows.append((area_id, "-", "PEND", "manca la risposta fase A"))
            continue
        n_done = 0
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
                rows.append((area_id, rid, "PEND", "manca la geometria fase B"))
                continue
            line, reason = build_line(rel)
            if line is None:
                rows.append((area_id, rid, "SKIP", reason))
                continue
            length_m = path_length(line)
            if not (MIN_LEN_M <= length_m <= MAX_LEN_M):
                rows.append((area_id, rid, "SKIP",
                             f"lunghezza {length_m / 1000:.1f} km fuori range"))
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
