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

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

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
    # Appennini (IT) — bbox (s, w, n, e)
    "area-gran-sasso": (42.35, 13.45, 42.55, 13.75),
    "area-majella": (41.95, 13.95, 42.20, 14.25),
    "area-sibillini": (42.80, 13.05, 43.05, 13.35),
    # Alpi francesi (FR) — bbox (s, w, n, e)
    "area-ecrins": (44.80, 6.15, 45.05, 6.55),
    "area-vanoise": (45.25, 6.75, 45.50, 7.15),
    "area-mont-blanc-fr": (45.80, 6.70, 45.98, 7.00),
    # Alpi (IT) — bbox (s, w, n, e)
    "area-alpi-giulie": (46.35, 13.35, 46.55, 13.65),
    "area-grigna-resegone": (45.78, 9.35, 45.95, 9.55),
    "area-alpi-marittime": (44.05, 7.10, 44.25, 7.40),
    "area-monte-rosa-it": (45.85, 7.85, 46.05, 8.05),
    "area-adamello-presanella": (46.10, 10.82, 46.35, 11.05),
    # Centro-sud e isole (IT) — mete di arrampicata note, fuori copertura
    # AINEVA — bbox (s, w, n, e)
    "area-apuane": (43.95, 10.15, 44.15, 10.45),
    "area-pollino": (39.85, 15.95, 40.10, 16.30),
    "area-finale-ligure": (44.14, 8.28, 44.22, 8.42),
    "area-sardegna-iglesiente": (39.15, 8.50, 39.35, 8.70),
    "area-sardegna-supramonte": (40.15, 9.35, 40.35, 9.60),
    "area-etna": (37.65, 14.95, 37.85, 15.15),
    "area-san-vito-lo-capo": (38.15, 12.70, 38.22, 12.80),
    "area-costiera-amalfitana": (40.60, 14.48, 40.68, 14.68),
    # Espansione internazionale (falesie note, tag sport=climbing globale) —
    # bbox (s, w, n, e).
    "area-yosemite-us": (37.50, -119.90, 38.05, -119.15),
    "area-zion-us": (37.10, -113.10, 37.45, -112.75),
    "area-jotunheimen-no": (61.35, 8.05, 61.75, 8.90),
    "area-lofoten-no": (67.85, 12.80, 68.35, 15.30),
    "area-banff-ca": (51.05, -116.30, 51.55, -115.30),
    "area-queenstown-nz": (-45.15, 168.55, -44.85, 168.90),
    "area-hakuba-jp": (36.55, 137.75, 36.85, 137.95),
}

#: area_id -> (country ISO2, region). Assente da questo script finora (le 258
#: falesie IT/FR esistenti hanno country/region da un backfill manuale
#: one-off, vedi commit b3b4dcc) — da qui in poi ogni nuova falesia importata
#: lo porta già, senza passaggi a parte.
AREA_META: dict[str, tuple[str, str]] = {
    "area-ortles-cevedale": ("IT", "Trentino-Alto Adige"),
    "area-dolomiti-fassa": ("IT", "Trentino-Alto Adige"),
    "area-gran-paradiso": ("IT", "Valle d'Aosta"),
    "area-dolomiti-ampezzo": ("IT", "Veneto"),
    "area-orobie": ("IT", "Lombardia"),
    "area-alta-valcamonica": ("IT", "Lombardia"),
    "area-gran-sasso": ("IT", "Abruzzo"),
    "area-majella": ("IT", "Abruzzo"),
    "area-sibillini": ("IT", "Marche"),
    "area-ecrins": ("FR", "Hautes-Alpes"),
    "area-vanoise": ("FR", "Savoie"),
    "area-mont-blanc-fr": ("FR", "Haute-Savoie"),
    "area-alpi-giulie": ("IT", "Friuli-Venezia Giulia"),
    "area-grigna-resegone": ("IT", "Lombardia"),
    "area-alpi-marittime": ("IT", "Piemonte"),
    "area-monte-rosa-it": ("IT", "Piemonte"),
    "area-adamello-presanella": ("IT", "Trentino-Alto Adige"),
    "area-apuane": ("IT", "Toscana"),
    "area-pollino": ("IT", "Calabria"),
    "area-finale-ligure": ("IT", "Liguria"),
    "area-sardegna-iglesiente": ("IT", "Sardegna"),
    "area-sardegna-supramonte": ("IT", "Sardegna"),
    "area-etna": ("IT", "Sicilia"),
    "area-san-vito-lo-capo": ("IT", "Sicilia"),
    "area-costiera-amalfitana": ("IT", "Campania"),
    "area-yosemite-us": ("US", "California"),
    "area-zion-us": ("US", "Utah"),
    "area-jotunheimen-no": ("NO", "Innlandet"),
    "area-lofoten-no": ("NO", "Nordland"),
    "area-banff-ca": ("CA", "Alberta"),
    "area-queenstown-nz": ("NZ", "Otago"),
    "area-hakuba-jp": ("JP", "Nagano"),
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
            country, region = AREA_META.get(area_id, (None, None))
            crag = {
                "slug": slug, "name": name,
                "area_id": area_id,
                "country": country, "region": region,
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
