"""
Import falesie internazionali da OpenBeta (api.openbeta.io, dati CC0) →
route-db/crags.json.

    python scripts/import_openbeta.py [--max-per-country 15] [--dry-run]
        [--country US --country FR ...] [--from-file responses.json]

HARD RULE — nothing is invented: every value comes verbatim dalla risposta
GraphQL di OpenBeta, o dall'Open-Meteo elevation API (Copernicus DEM) quando
OpenBeta non ha una quota, o è null. Tutte le falesie importate sono
UNVERIFIED (verified_at: null) — la curatela avviene dopo.

Perché OpenBeta e non lo stesso importer OSM usato per l'Italia: fuori
dall'Italia la copertura sport=climbing di OpenStreetMap è molto più rada,
mentre OpenBeta ha dataset reali e sostanziosi per USA/Sudafrica/Canada (dati
verificati via query dirette all'API, vedi countries{ totalClimbs }). L'Italia
resta fuori scope qui (33 vie in tutto il paese su OpenBeta contro le
centinaia già importate da OSM): questo script è per l'espansione
internazionale, non per l'Italia.

Modello dati OpenBeta: un'area con metadata.leaf=true è una falesia reale
(non un contenitore geografico come "USA" o "California"); pathTokens dà la
gerarchia (["USA","California","Yosemite National Park","Yosemite Valley"]).
Non esistono campi elevation/aspect per l'area — coerente con lib le altre
fonti, restano null finché un DEM o un curatore non li forniscono.

Modes
-----
- live (default): ricerca best-first sull'albero delle aree, un nodo alla
  volta via area(uuid){children} (una query nested a più livelli manda
  l'endpoint in 502 sui paesi grandi). Richiede httpx.
- --from-file <json>: offline, python stdlib only. Il file è una lista di
  {"country": "<nome esatto OpenBeta, es. USA>", "leaves": [<aree foglia già
  raccolte, ciascuna con uuid/area_name/pathTokens/totalClimbs/metadata>]}.

Idempotente: gli slug già presenti in crags.json sono saltati.
"""
from __future__ import annotations

import argparse
import heapq
import json
import pathlib
import re
import sys
import time
import unicodedata
from typing import Optional

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

REPO = pathlib.Path(__file__).resolve().parents[2]
CRAGS = REPO / "route-db" / "crags.json"

API = "https://api.openbeta.io"
ELEV_API = "https://api.open-meteo.com/v1/elevation"

#: Nome esatto dell'area-paese su OpenBeta -> nostro codice ISO2. Verificato
#: via `query{ countries{ areaName totalClimbs } }` (2026-08-26): questi
#: quattro sono i mercati con dati reali sostanziosi oltre gli USA stessi.
COUNTRIES: dict[str, str] = {
    "USA": "US",
    "Switzerland": "CH",
    "France": "FR",
    "Spain": "ES",
}

#: Sottoalberi con NOME specifico invece della radice-paese (--landmark).
#: Gli USA hanno un albero troppo grande per la ricerca best-first da radice
#: (206k vie: anche con budget alto l'API gratuita di OpenBeta comincia a
#: rispondere 502/timeout sotto il carico, osservato 2026-08-26). Puntare
#: a parchi/mete NOTE invece che esplorare alla cieca costa poche chiamate
#: (sottoalbero piccolo, stesso principio di CH/FR/ES) E dà nomi
#: riconoscibili — più utile di boulder ignoti pescati a caso.
LANDMARKS: dict[str, str] = {
    "Yosemite National Park": "US",
    "Joshua Tree National Park": "US",
    "Red Rock Canyon": "US",
    "Red River Gorge": "US",
}

#: Un solo livello per chiamata: una query con children annidati 3 livelli
#: (country -> L1 -> L2 -> L3) manda l'endpoint in 502 su paesi grandi come
#: gli USA (albero enorme). Si cammina l'albero un nodo alla volta con
#: area(uuid) — più chiamate, ciascuna leggera.
FIND_AREA_QUERY = """
query FindArea($name: String!) {
  areas(filter: {area_name: {match: $name}}) {
    uuid
    pathTokens
    totalClimbs
  }
}
"""

CHILDREN_QUERY = """
query Children($uuid: ID!) {
  area(uuid: $uuid) {
    children {
      uuid
      area_name
      pathTokens
      totalClimbs
      metadata { leaf lat lng }
    }
  }
}
"""

#: Budget di chiamate area(uuid) nella ricerca best-first (ogni chiamata è
#: leggera: un solo livello di children). Un --landmark (sottoalbero
#: piccolo, es. un singolo parco) basta con poco; un --country da RADICE
#: (l'intero paese) su un albero enorme come gli USA (206k vie) andrebbe
#: esplorato con un budget molto più alto — ma l'API gratuita di OpenBeta
#: comincia a rispondere 502/timeout sotto quel carico (osservato
#: 2026-08-26 con budget 600). Per gli USA usa --landmark, non --country.
BUDGET_LANDMARK = 100
BUDGET_COUNTRY = 150


def slugify(text: str) -> str:
    ascii_text = (unicodedata.normalize("NFKD", text)
                  .encode("ascii", "ignore").decode("ascii"))
    return re.sub(r"[^a-z0-9]+", "-", ascii_text.lower()).strip("-")


#: OpenBeta è un'API community-run gratuita: risponde 502 in modo
#: intermittente anche a query leggere (osservato in dev). Ritenta con
#: backoff prima di arrendersi, come import_osm_crags.py fa per Overpass.
GRAPHQL_RETRY_PAUSES = (0, 3, 8, 15)


def graphql(query: str, variables: dict) -> dict:
    import httpx  # imported lazily: --from-file mode is stdlib-only

    last_exc: Exception | None = None
    for pause in GRAPHQL_RETRY_PAUSES:
        if pause:
            time.sleep(pause)
        try:
            resp = httpx.post(API, json={"query": query, "variables": variables},
                              timeout=30.0, headers={"User-Agent": "AIMETEO crag importer"})
            resp.raise_for_status()
        except httpx.HTTPError as e:
            last_exc = e
            print(f"  ! OpenBeta {e!r}, ritento…", file=sys.stderr)
            continue
        data = resp.json()
        if data.get("errors"):
            raise SystemExit(f"OpenBeta GraphQL error: {data['errors']}")
        return data["data"]
    raise SystemExit(f"OpenBeta non raggiungibile dopo {len(GRAPHQL_RETRY_PAUSES)} tentativi: {last_exc}")


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


def find_named_area(name: str) -> Optional[dict]:
    """Trova un'area per nome ESATTO (ultimo pathToken), a qualunque
    profondità — funziona sia per una radice-paese (pathTokens=["USA"])
    sia per un parco annidato (pathTokens=["USA","California","Yosemite
    National Park"]). Il match testuale può restituire più candidati con
    lo stesso nome (es. "Red Rock Canyon" in stati diversi): si prende
    quello con più vie censite, il più probabile essere la voce vera."""
    resp = graphql(FIND_AREA_QUERY, {"name": name})
    matches = [a for a in (resp.get("areas") or [])
               if (a.get("pathTokens") or [None])[-1] == name]
    if not matches:
        return None
    matches.sort(key=lambda a: a.get("totalClimbs") or 0, reverse=True)
    return matches[0]


def collect_leaves(country_uuid: str, target: int, budget: int) -> list[dict]:
    """Ricerca best-first (più vie censite = esplorato prima): un nodo alla
    volta via area(uuid){children}, finché non abbiamo abbastanza foglie
    (metadata.leaf=True, coordinate reali) o finisce il budget di chiamate."""
    resp = graphql(CHILDREN_QUERY, {"uuid": country_uuid})
    roots = (resp.get("area") or {}).get("children") or []

    # max-heap per totalClimbs: le aree più censite si esplorano per prime
    # (più probabile che nascondano falesie note, non boulder isolati).
    heap = [(-(a.get("totalClimbs") or 0), i, a) for i, a in enumerate(roots)]
    heapq.heapify(heap)
    seen_uuid = {a["uuid"] for a in roots}

    leaves: list[dict] = []
    calls = 0
    counter = len(roots)
    while heap and calls < budget and len(leaves) < target:
        _, _, area = heapq.heappop(heap)
        meta = area.get("metadata") or {}
        if meta.get("leaf") and meta.get("lat") is not None and meta.get("lng") is not None:
            leaves.append(area)
            continue
        if not area.get("uuid"):
            continue
        calls += 1
        resp = graphql(CHILDREN_QUERY, {"uuid": area["uuid"]})
        for child in (resp.get("area") or {}).get("children") or []:
            if child.get("uuid") in seen_uuid:
                continue
            seen_uuid.add(child.get("uuid"))
            counter += 1
            heapq.heappush(heap, (-(child.get("totalClimbs") or 0), counter, child))
    return leaves


def evaluate(area: dict, country_code: str, known_slugs: set[str]) -> tuple[Optional[dict], str]:
    uuid = area.get("uuid")
    name = (area.get("area_name") or "").strip()
    if not uuid or not name:
        return None, "no uuid/name"
    tokens = area.get("pathTokens") or []
    region = tokens[1] if len(tokens) > 1 else None

    name_slug = slugify(name)
    if not name_slug:
        return None, "empty slug after slugify"
    slug = f"falesia-{country_code.lower()}-{name_slug}"
    if slug in known_slugs:
        return None, f"slug already exists ({slug})"

    meta = area.get("metadata") or {}
    crag = {
        "slug": slug,
        "name": name,
        "area_id": f"world-{country_code.lower()}",
        "country": country_code,
        "region": region,
        "lat": round(float(meta["lat"]), 6),
        "lon": round(float(meta["lng"]), 6),
        "ele_m": None,  # OpenBeta non espone la quota — riempita dal DEM sotto
        "aspect": None,  # non esposta da OpenBeta — mai inventata
        "rock": None,
        "source": f"OpenBeta (CC0) — {' > '.join(tokens)}",
        "source_url": f"https://openbeta.io/area/{uuid}",
        "verified_at": None,
    }
    return crag, "ok"


def leaves_from_file(path: pathlib.Path) -> list[tuple[str, list[dict]]]:
    """Offline: il file è [{"country": "USA", "leaves": [<area con uuid,
    area_name, pathTokens, totalClimbs, metadata{leaf,lat,lng}>, ...]}, ...] —
    foglie già raccolte a mano (es. da un run live precedente), non l'intero
    albero: riprodurre offline la ricerca best-first non avrebbe senso."""
    entries = json.loads(path.read_text(encoding="utf-8"))
    return [(e["country"], e["leaves"]) for e in entries]


def leaves_live(targets: list[tuple[str, int]], goal: int) -> list[tuple[str, list[dict]]]:
    """targets: [(nome_area, budget_chiamate), ...] — budget diverso per un
    --landmark (sottoalbero piccolo) rispetto a un --country da radice."""
    out = []
    for name, budget in targets:
        print(f"cerco {name!r} su OpenBeta…", file=sys.stderr)
        root = find_named_area(name)
        if root is None:
            out.append((name, []))
            continue
        print(f"  esploro l'albero di {name} (obiettivo {goal} falesie candidate, "
              f"budget {budget} chiamate)…", file=sys.stderr)
        leaves = collect_leaves(root["uuid"], goal, budget)
        out.append((name, leaves))
    return out


def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--max-per-country", type=int, default=15,
                    help="max NUOVE falesie aggiunte per paese (default 15)")
    ap.add_argument("--dry-run", action="store_true",
                    help="valuta e stampa, non scrive nulla")
    ap.add_argument("--country", action="append", default=[],
                    help="nome area-paese OpenBeta da importare, esplorato dalla "
                         "RADICE (repeatable; default se --landmark non è dato: "
                         "USA, Switzerland, France, Spain)")
    ap.add_argument("--landmark", action="append", default=[],
                    help="nome di un parco/sottoalbero NOTO da importare (repeatable; "
                         "es. 'Yosemite National Park') — budget di ricerca più "
                         "piccolo, adatto ad alberi enormi come quello USA dove "
                         "esplorare dalla radice-paese sovraccarica l'API gratuita")
    ap.add_argument("--from-file", type=pathlib.Path, default=None,
                    help="offline: file JSON con le risposte GraphQL già salvate")
    args = ap.parse_args()

    if args.country or args.landmark:
        selected = {c: COUNTRIES[c] for c in args.country}
        selected.update({l: LANDMARKS[l] for l in args.landmark})
    else:
        selected = dict(COUNTRIES)
    unknown = (set(args.country) - set(COUNTRIES)) | (set(args.landmark) - set(LANDMARKS))
    if unknown:
        raise SystemExit(f"nome non mappato a un codice ISO2: {unknown} "
                          f"(aggiungilo a COUNTRIES o LANDMARKS nello script)")

    data = json.loads(CRAGS.read_text(encoding="utf-8")) if CRAGS.exists() \
        else {"crags": []}
    known_slugs = {c["slug"] for c in data["crags"]}

    # Buffer 3x sul goal: evaluate() scarta duplicati di slug e nomi vuoti,
    # quindi si raccolgono più candidate del necessario per compensare.
    goal = args.max_per_country * 3
    if args.from_file:
        batches = leaves_from_file(args.from_file)
    else:
        targets = [(name, BUDGET_LANDMARK if name in LANDMARKS else BUDGET_COUNTRY)
                   for name in selected]
        batches = leaves_live(targets, goal)

    added: list[dict] = []
    rows: list[tuple[str, str, str, str]] = []  # country, name, status, detail
    added_per_country = {code: 0 for code in selected.values()}

    for country_name, leaves in batches:
        code = selected[country_name]
        if not leaves:
            rows.append((code, country_name, "SKIP", "nessuna falesia trovata / country node non trovato"))
            continue
        # Le più rappresentative per una vetrina: più vie censite = crag più nota.
        leaves = sorted(leaves, key=lambda a: a.get("totalClimbs") or 0, reverse=True)

        for area in leaves:
            if added_per_country[code] >= args.max_per_country:
                rows.append((code, area.get("area_name", "?"), "SKIP", "quota paese raggiunta"))
                continue
            crag, reason = evaluate(area, code, known_slugs)
            if crag is None:
                rows.append((code, area.get("area_name", "?"), "SKIP", reason))
                continue
            known_slugs.add(crag["slug"])
            added_per_country[code] += 1
            added.append(crag)
            rows.append((code, area.get("area_name", "?"), "ADD",
                         f"{crag['slug']} ({area.get('totalClimbs')} vie censite)"))

    w_c = max([len(r[0]) for r in rows] + [7])
    w_n = max([len(r[1]) for r in rows] + [4])
    print(f"{'COUNTRY':<{w_c}}  {'NAME':<{w_n}}  {'?':<4}  DETAIL")
    for code, name, status, detail in rows:
        print(f"{code:<{w_c}}  {name:<{w_n}}  {status:<4}  {detail}")
    print(f"\nadded: {len(added)} " +
          " ".join(f"{c}={n}" for c, n in added_per_country.items()))

    if args.dry_run:
        print("(dry-run: nessuna scrittura)")
        return
    if not added:
        print("nothing to add — crags.json invariato")
        return

    print(f"Quote DEM per {len(added)} falesie…")
    eles = dem_elevations([(c["lat"], c["lon"]) for c in added])
    for c, e in zip(added, eles):
        c["ele_m"] = round(e)

    data["crags"].extend(added)
    CRAGS.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n",
                     encoding="utf-8")
    print(f"✓ {CRAGS} — {len(data['crags'])} falesie totali")


if __name__ == "__main__":
    main()
