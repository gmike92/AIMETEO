"""
Cerca sentieri (relazioni OSM route=hiking) per nome nell'alta Valcamonica.

Uso (dal Mac):
    cd backend && python3 scripts/find_trail.py Aviolo
    python3 scripts/find_trail.py "Paghera|Occhi"        # regex, case-insensitive
    python3 scripts/find_trail.py --all                  # tutte nel bbox, anche senza cai_scale

Mostra id, ref, cai_scale e nome: serve a capire perché un sentiero non è
entrato nell'import (manca il tag cai_scale? è mappato solo come way?).
"""
from __future__ import annotations

import argparse
import sys
from urllib.parse import quote

BBOX = (46.10, 10.20, 46.32, 10.55)  # alta Valcamonica (s, w, n, e)
ENDPOINTS = ["https://overpass-api.de/api/interpreter",
             "https://overpass.kumi.systems/api/interpreter"]


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("pattern", nargs="?", default=None,
                    help="regex sul nome (case-insensitive)")
    ap.add_argument("--all", action="store_true",
                    help="elenca tutte le relazioni hiking nel bbox")
    args = ap.parse_args()
    if not args.pattern and not args.all:
        ap.error("indica un pattern (es. Aviolo) oppure --all")

    s, w, n, e = BBOX
    name_filter = f'["name"~"{args.pattern}",i]' if args.pattern else ""
    q = (f'[out:json][timeout:30];'
         f'relation["route"="hiking"]{name_filter}({s},{w},{n},{e});'
         f'out tags center;')

    import httpx
    data = None
    for ep in ENDPOINTS:
        try:
            r = httpx.get(f"{ep}?data={quote(q)}", timeout=httpx.Timeout(10, read=60),
                          headers={"User-Agent": "AIMETEO trail finder"})
            r.raise_for_status()
            data = r.json()
            break
        except Exception as exc:  # noqa: BLE001
            print(f"! {ep}: {exc}", file=sys.stderr)
    if data is None:
        raise SystemExit("Overpass non raggiungibile, riprova tra un minuto")

    els = data.get("elements", [])
    print(f"{len(els)} relazioni trovate:")
    for el in sorted(els, key=lambda x: x.get("tags", {}).get("ref", "")):
        t = el.get("tags", {})
        print(f" - id={el['id']:<12} ref={t.get('ref', '?'):<6} "
              f"cai_scale={t.get('cai_scale', 'MANCA'):<6} | {t.get('name', '(senza nome)')}")


if __name__ == "__main__":
    main()
