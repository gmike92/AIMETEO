"""
Import piste da sci (discesa + fondo) da OpenStreetMap (piste:type, ODbL)
-> route-db/pistes.json.

Come import_osm_crags: fetch Overpass robusto (retry, mirror), attribuzione
ODbL, tutto unverified. MAI dati inventati: la geometria e la difficolta
(piste:difficulty) sono prese verbatim dai tag OSM; se piste:difficulty
manca resta null (il frontend la disegna neutra, non inventa un colore).

Uso: cd backend && ./.venv/Scripts/python.exe scripts/import_osm_pistes.py
     [--max-per-area 20] [--endpoint URL] [--dry-run] [--area area-id]
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
PISTES = REPO / "route-db" / "pistes.json"

MAIN_ENDPOINT = "https://overpass-api.de/api/interpreter"
MIRROR_ENDPOINT = "https://overpass.kumi.systems/api/interpreter"

#: Aree con comprensori sciistici noti (per una prima importazione mirata,
#: non tutte le 31 aree di seed_routes.json) — bbox (s, w, n, e).
AREAS = {
    "area-dolomiti-fassa": (46.35, 11.75, 46.55, 12.00),       # Sella Ronda
    "area-dolomiti-ampezzo": (46.45, 11.95, 46.65, 12.25),     # Cortina
    "area-ortles-cevedale": (46.25, 10.35, 46.55, 10.80),      # Solda/Sulden
    "area-alta-valcamonica": (46.10, 10.20, 46.32, 10.55),     # Ponte di Legno-Tonale
    "area-zermatt-ch": (45.95, 7.65, 46.05, 7.85),
    "area-oetztal-at": (46.80, 10.75, 47.05, 11.05),           # Soelden
    "area-zillertal-at": (47.00, 11.70, 47.20, 12.00),         # Mayrhofen
}

PHASE_LIMIT = 60  #: max elementi per area nella query (--max-per-area li screma dopo)


def slugify(name: str, kind: str) -> str:
    s = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return f"piste-{kind}-{s}"


def query(area: tuple[float, float, float, float]) -> str:
    s, w, n, e = area
    return (f"[out:json][timeout:90];("
            f'way["piste:type"~"^(downhill|nordic)$"]({s},{w},{n},{e});'
            f");out geom {PHASE_LIMIT};")


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
                          headers={"User-Agent": "AIMETEO piste importer"})
            r.raise_for_status()
            return r.json()
        except Exception as exc:  # noqa: BLE001
            print(f"  ! {endpoint}: {exc}", file=sys.stderr)
    print("  ✗ area saltata (Overpass non raggiungibile)", file=sys.stderr)
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--max-per-area", type=int, default=20)
    ap.add_argument("--endpoint", default=MAIN_ENDPOINT)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--area", choices=sorted(AREAS), default=None,
                    help="importa solo quest'area (default: tutte)")
    args = ap.parse_args()

    data = json.loads(PISTES.read_text(encoding="utf-8")) if PISTES.exists() \
        else {"pistes": []}
    known = {p["slug"] for p in data["pistes"]}
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
            if el.get("type") != "way":
                continue
            tags = el.get("tags", {})
            piste_type = tags.get("piste:type")
            kind = "downhill" if piste_type == "downhill" else "nordic" if piste_type == "nordic" else None
            if kind is None:
                continue
            geom = el.get("geometry") or []
            if len(geom) < 2:
                continue
            name = tags.get("name") or tags.get("piste:name") or f"Pista {el.get('id')}"
            slug = slugify(f"{name}-{el.get('id')}", kind)
            if slug in known:
                print(f"  SKIP {name} (già presente)")
                continue
            difficulty = tags.get("piste:difficulty")
            piste = {
                "slug": slug, "name": name,
                "area_id": area_id, "kind": kind,
                "difficulty": difficulty,
                "coords": [[round(pt["lat"], 6), round(pt["lon"], 6)] for pt in geom],
                "source": f"OpenStreetMap (ODbL) — way {el.get('id')}",
                "source_url": f"https://www.openstreetmap.org/way/{el.get('id')}",
                "verified_at": None,
            }
            added.append(piste)
            known.add(slug)
            n_area += 1
            print(f"  ADD  [{area_id.replace('area-','')}] {name} "
                  f"({kind}, difficulty={difficulty or 'n.d.'}, {len(geom)} pt)")

    print(f"\nadded: {len(added)}")
    if args.dry_run:
        print("(dry-run: nessuna scrittura)")
        return
    if not added:
        print("nothing to add — seed unchanged")
        return
    data["pistes"].extend(added)
    PISTES.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n",
                      encoding="utf-8")
    print(f"✓ {PISTES} — {len(data['pistes'])} piste totali")


if __name__ == "__main__":
    main()
