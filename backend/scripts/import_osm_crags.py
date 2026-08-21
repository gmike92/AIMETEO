"""
Import falesie da OpenStreetMap (sport=climbing, ODbL) → route-db/crags.json.

Come import_osm_cai: fetch Overpass robusto (retry, mirror, skip-non-abort),
quote dal DEM Copernicus (Open-Meteo elevation) quando OSM non ha `ele`,
attribuzione ODbL, tutto unverified. MAI dati inventati:
- aspect SOLO dal tag `climbing:orientation` (se assente resta null e il
  calcolo sole/ombra si dichiara non disponibile);
- ele da tag OSM `ele` se presente (dato reale), altrimenti DEM.

Uso (dal Mac): cd backend && python3 scripts/import_osm_crags.py
               [--max-per-area 6] [--endpoint URL] [--dry-run]
"""
from __future__ import annotations

import argparse
import json
import pathlib
import re
import sys
import time
import unicodedata
from urllib.parse import quote

REPO = pathlib.Path(__file__).resolve().parents[2]
CRAGS = REPO / "route-db" / "crags.json"

MAIN_ENDPOINT = "https://overpass-api.de/api/interpreter"
MIRROR_ENDPOINT = "https://overpass.kumi.systems/api/interpreter"
ELEV_API = "https://api.open-meteo.com/v1/elevation"

AREAS = {
    "area-ortles-cevedale": (46.25, 10.35, 46.55, 10.80),
    "area-dolomiti-fassa": (46.35, 11.75, 46.55, 12.00),
    "area-gran-paradiso": (45.40, 7.05, 45.65, 7.45),
    "area-dolomiti-ampezzo": (46.45, 11.95, 46.65, 12.25),
    "area-orobie": (45.90, 9.75, 46.10, 10.15),
    # Alta Valle Camonica (Vezza d'Oglio) — bbox (s, w, n, e)
    "area-alta-valcamonica": (46.10, 10.20, 46.32, 10.55),
}

VALID_ASPECTS = {"N", "NE", "E", "SE", "S", "SW", "W", "NW"}

PHASE_A_LIMIT = 40  #: max elementi per area nella query (--phase-a-limit)


def slugify(name: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return f"falesia-{s}"


def query(area: tuple[float, float, float, float]) -> str:
    s, w, n, e = area
    return (f"[out:json][timeout:60];("
            f'node["sport"="climbing"]["name"]({s},{w},{n},{e});'
            f'way["sport"="climbing"]["name"]({s},{w},{n},{e});'
            f");out tags center {PHASE_A_LIMIT};")


def overpass_get(url_query: str, endpoint_pref: str) -> dict | None:
    import httpx
    attempts = [(endpoint_pref, 0), (endpoint_pref, 15),
                (MIRROR_ENDPOINT, 5), (MIRROR_ENDPOINT, 25)]
    for endpoint, pause in attempts:
        if pause:
            print(f"  … attendo {pause}s", file=sys.stderr)
            time.sleep(pause)
        url = f"{endpoint}?data={quote(url_query)}"
        try:
            print(f"GET {url[:120]}…", file=sys.stderr)
            r = httpx.get(url, timeout=httpx.Timeout(10.0, read=180.0),
                          headers={"User-Agent": "AIMETEO crag importer"})
            r.raise_for_status()
            return r.json()
        except Exception as exc:  # noqa: BLE001
            print(f"  ! {endpoint}: {exc}", file=sys.stderr)
    print("  ✗ area saltata (Overpass non raggiungibile)", file=sys.stderr)
    return None


def dem_elevations(points: list[tuple[float, float]]) -> list[float]:
    import httpx
    out: list[float] = []
    for i in range(0, len(points), 100):
        batch = points[i:i + 100]
        url = (f"{ELEV_API}?latitude={','.join(f'{p[0]:.5f}' for p in batch)}"
               f"&longitude={','.join(f'{p[1]:.5f}' for p in batch)}")
        r = httpx.get(url, timeout=30.0)
        r.raise_for_status()
        vals = r.json().get("elevation", [])
        if len(vals) != len(batch):
            raise SystemExit("elevation API: conteggio inatteso")
        out.extend(float(v) for v in vals)
        time.sleep(1)
    return out


def normalize_aspect(raw: str | None) -> str | None:
    if not raw:
        return None
    a = raw.strip().upper().replace("NORD", "N").replace("SUD", "S")
    # tag multipli tipo "S;SE" → prendi il primo valido; "SSE" → non forzare
    for part in re.split(r"[;, ]+", a):
        if part in VALID_ASPECTS:
            return part
    return None


def main() -> None:
    global PHASE_A_LIMIT
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--max-per-area", type=int, default=6)
    ap.add_argument("--endpoint", default=MAIN_ENDPOINT)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--area", choices=sorted(AREAS), default=None,
                    help="importa solo quest'area (default: tutte)")
    ap.add_argument("--phase-a-limit", type=int, default=PHASE_A_LIMIT,
                    help="max elementi candidati per area (default 40)")
    args = ap.parse_args()
    PHASE_A_LIMIT = args.phase_a_limit

    data = json.loads(CRAGS.read_text(encoding="utf-8")) if CRAGS.exists() \
        else {"crags": []}
    known = {c["slug"] for c in data["crags"]}
    added: list[dict] = []

    areas = {args.area: AREAS[args.area]} if args.area else AREAS
    for area_id, bbox in areas.items():
        resp = overpass_get(query(bbox), args.endpoint)
        if resp is None:
            continue
        n_area = 0
        for el in resp.get("elements", []):
            if n_area >= args.max_per_area:
                break
            tags = el.get("tags", {})
            name = tags.get("name")
            lat = el.get("lat") or (el.get("center") or {}).get("lat")
            lon = el.get("lon") or (el.get("center") or {}).get("lon")
            if not name or lat is None or lon is None:
                continue
            # non-falesie: palestre indoor e vie ferrate taggate sport=climbing
            if (tags.get("climbing:indoor") == "yes" or tags.get("indoor") == "yes"
                    or any(k in name.lower() for k in ("indoor", "klettersteig"))):
                print(f"  SKIP {name} (indoor/ferrata, non falesia)")
                continue
            slug = slugify(name)
            if slug in known:
                print(f"  SKIP {name} (già presente)")
                continue
            # quota: tag OSM `ele` se numerico (dato reale), altrimenti DEM dopo
            ele = None
            try:
                ele = round(float(tags.get("ele", "").replace("m", "").strip()))
            except (ValueError, AttributeError):
                pass
            crag = {
                "slug": slug, "name": name,
                "area_id": area_id,
                "lat": round(float(lat), 6), "lon": round(float(lon), 6),
                "ele_m": ele,  # None → riempito dal DEM sotto
                "aspect": normalize_aspect(tags.get("climbing:orientation")),
                "rock": tags.get("climbing:rock") or tags.get("rock"),
                "source": f"OpenStreetMap (ODbL) — {el.get('type')} {el.get('id')}",
                "source_url": f"https://www.openstreetmap.org/{el.get('type')}/{el.get('id')}",
                "verified_at": None,
            }
            added.append(crag)
            known.add(slug)
            n_area += 1
            print(f"  ADD  [{area_id.replace('area-','')}] {name} "
                  f"(aspect={crag['aspect'] or 'n.d.'}, ele={ele or 'DEM'})")

    need_dem = [c for c in added if c["ele_m"] is None]
    if need_dem and not args.dry_run:
        print(f"Quote DEM per {len(need_dem)} falesie…")
        eles = dem_elevations([(c["lat"], c["lon"]) for c in need_dem])
        for c, e in zip(need_dem, eles):
            c["ele_m"] = round(e)

    print(f"\nadded: {len(added)}")
    if args.dry_run:
        print("(dry-run: nessuna scrittura)")
        return
    data["crags"].extend(added)
    CRAGS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n",
                     encoding="utf-8")
    print(f"✓ {CRAGS} — {len(data['crags'])} falesie totali")


if __name__ == "__main__":
    main()
