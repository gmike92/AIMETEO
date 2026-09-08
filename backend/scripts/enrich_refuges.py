"""
Collega a ogni itinerario i rifugi REALI che stanno sulla sua traccia, da
refuges.info (dati CC BY-SA 2.0) → route-db/seed_routes.json.

    python scripts/enrich_refuges.py [--dry-run] [--radius-m 250]
        [--limit N] [--pause 1.0] [--activity scialpinismo]

Perché serviva: il campo `refuges` esiste nello schema (tabella refuge +
route_refuge) e finisce nel contesto della relazione AI (prompts.py), ma nel
catalogo era popolato su 2 itinerari su 2225. Le tracce reali importate da
OSM danno le coordinate per riempirlo con dati veri invece che a mano.

COSA E' UN FATTO E COSA NO
--------------------------
Il legame che scriviamo qui e' un fatto geometrico verificabile: "questo
rifugio dista meno di --radius-m dalla traccia di questo itinerario". Il
RUOLO del rifugio (base / appoggio / discesa) e' invece un giudizio di chi
conosce la gita, non qualcosa che si deduce dalla distanza: resta `null`,
da riempire in curatela. Meglio un ruolo vuoto che un ruolo inventato.

MAPPATURA DEI TIPI (conservativa)
---------------------------------
refuges.info usa tipi francesi; il nostro schema ha rifugio|bivacco|capanna.
    "refuge garde"      -> rifugio   (custodito, e' esattamente un rifugio)
    "cabane non gardee" -> bivacco   (ricovero non custodito)
    "gite d'etape"      -> SCARTATO  (alloggio di fondovalle, non
                                      infrastruttura di un itinerario)
    qualunque altro     -> SCARTATO  (non si tira a indovinare)
Il tipo originale francese resta nel record (`source_type`), cosi' la
mappatura e' verificabile e nessun dato viene perso.

COPERTURA: refuges.info e' un progetto francese, denso su Alpi occidentali e
Pirenei, rado sulle Alpi italiane, quasi assente altrove (verificato
2026-09-08: Nuova Zelanda 0 punti). Gli itinerari fuori copertura semplicemente
non ricevono legami — non e' un errore.

Nota tecnica: l'API tronca a 250 punti per risposta, quindi si interroga un
bbox per itinerario (piccolo, molto sotto il tetto) invece di un bbox unico
per area, che rischierebbe di perdere rifugi in silenzio.
"""
from __future__ import annotations

import argparse
import difflib
import json
import math
import pathlib
import re
import sys
import time
import unicodedata
from typing import Optional

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
SEED = REPO_ROOT / "route-db" / "seed_routes.json"

API = "https://www.refuges.info/api/bbox"

#: tipo refuges.info (senza accenti, minuscolo) -> tipo nostro schema.
TYPE_MAP = {
    "refuge garde": "rifugio",
    "cabane non gardee": "bivacco",
}


def deaccent(text: str) -> str:
    return (unicodedata.normalize("NFKD", text)
            .encode("ascii", "ignore").decode("ascii"))


def slugify(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", deaccent(text).lower()).strip("-")


#: Due segnali indipendenti perche' uno solo sbaglia: la quota da sola
#: confonderebbe due rifugi diversi alla stessa altezza, il nome da solo non
#: regge le lingue diverse. Calibrato su un caso reale del catalogo —
#: "Refuge Victor Emmanuel II" (refuges.info) e "Rifugio Vittorio Emanuele II"
#: (curato a mano) sono lo STESSO rifugio a 2732 m: somiglianza 0.79, mentre
#: due rifugi realmente diversi stanno a 0.53 e sotto.
SAME_REFUGE_ALT_M = 10
SAME_REFUGE_NAME_RATIO = 0.70
#: Quando ENTRAMBI i record hanno le coordinate, la posizione decide: lo
#: stesso rifugio in due lingue sta nello stesso posto. Serve perche' quota +
#: nome da soli sbagliano su un caso reale trovato nei dati: "Refuge de
#: Perafita" (2200 m) e "Orry de Perafita" (2190 m) passano entrambe le
#: soglie ma sono due strutture diverse a 256 m di distanza — un rifugio e
#: una capanna pastorale in pietra a secco.
SAME_REFUGE_DIST_M = 100


def same_refuge(a: dict, b: dict) -> bool:
    """True se i due record descrivono lo stesso rifugio reale con nomi in
    lingue diverse — serve a non duplicare cio' che un curatore ha gia'
    inserito a mano."""
    if all(r.get("lat") is not None and r.get("lon") is not None for r in (a, b)):
        dlat = (a["lat"] - b["lat"]) * 111_320.0
        dlon = ((a["lon"] - b["lon"]) * 111_320.0
                * math.cos(math.radians(a["lat"])))
        return math.hypot(dlat, dlon) <= SAME_REFUGE_DIST_M
    # Record curati a mano: non hanno coordinate, restano quota + nome.
    alt_a, alt_b = a.get("altitude_m"), b.get("altitude_m")
    if alt_a is None or alt_b is None:
        return False
    if abs(alt_a - alt_b) > SAME_REFUGE_ALT_M:
        return False
    ratio = difflib.SequenceMatcher(
        None, deaccent(a["name"]).lower(), deaccent(b["name"]).lower()).ratio()
    return ratio >= SAME_REFUGE_NAME_RATIO


# ── geometria ────────────────────────────────────────────────────────────────
def _local_xy(lat: float, lon: float, lat0: float) -> tuple[float, float]:
    """Proiezione equirettangolare locale in metri: alle scale di un
    itinerario (decine di km) l'errore e' trascurabile e evita di importare
    una libreria di geodesia solo per una distanza punto-segmento."""
    m_per_deg_lat = 111_320.0
    m_per_deg_lon = 111_320.0 * math.cos(math.radians(lat0))
    return lon * m_per_deg_lon, lat * m_per_deg_lat


def dist_point_to_track(lat: float, lon: float,
                        track: list[tuple[float, float]]) -> float:
    """Distanza minima in metri dal punto alla POLILINEA (non ai soli
    vertici): i punti traccia sono decimati a 100 m o piu', un rifugio a
    meta' segmento verrebbe altrimenti misurato piu' lontano di quanto sia."""
    lat0 = track[0][0]
    px, py = _local_xy(lat, lon, lat0)
    pts = [_local_xy(la, lo, lat0) for la, lo in track]
    if len(pts) == 1:
        return math.hypot(px - pts[0][0], py - pts[0][1])
    best = float("inf")
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        dx, dy = bx - ax, by - ay
        seg2 = dx * dx + dy * dy
        if seg2 == 0:
            t = 0.0
        else:
            t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
        cx, cy = ax + t * dx, ay + t * dy
        best = min(best, math.hypot(px - cx, py - cy))
    return best


def track_bbox(track: list[tuple[float, float]], margin_m: float
               ) -> tuple[float, float, float, float]:
    """(lon_min, lat_min, lon_max, lat_max) — l'ordine che vuole l'API."""
    lats = [p[0] for p in track]
    lons = [p[1] for p in track]
    dlat = margin_m / 111_320.0
    dlon = margin_m / (111_320.0 * max(0.1, math.cos(math.radians(sum(lats) / len(lats)))))
    return (min(lons) - dlon, min(lats) - dlat,
            max(lons) + dlon, max(lats) + dlat)


# ── fetch ────────────────────────────────────────────────────────────────────
def fetch_points(bbox: tuple[float, float, float, float]) -> Optional[list[dict]]:
    import httpx

    url = (f"{API}?bbox={bbox[0]:.5f},{bbox[1]:.5f},{bbox[2]:.5f},{bbox[3]:.5f}"
           f"&format=geojson")
    for pause in (0, 5, 15):
        if pause:
            print(f"  … refuges.info, riprovo tra {pause}s", file=sys.stderr)
            time.sleep(pause)
        try:
            r = httpx.get(url, timeout=45.0,
                          headers={"User-Agent": "AIMETEO refuge enrichment "
                                                 "(repo gmike92/AIMETEO)"})
            r.raise_for_status()
            return r.json().get("features") or []
        except Exception as exc:  # noqa: BLE001
            print(f"  ! refuges.info: {exc}", file=sys.stderr)
    return None


def to_refuge(feature: dict) -> Optional[dict]:
    """Record rifugio dai dati verbatim, o None se il tipo non e' uno dei due
    che sappiamo mappare senza interpretare."""
    props = feature.get("properties") or {}
    name = (props.get("nom") or "").strip()
    raw_type = ((props.get("type") or {}).get("valeur") or "").strip()
    mapped = TYPE_MAP.get(deaccent(raw_type).lower())
    if not name or not mapped:
        return None
    coords = (feature.get("geometry") or {}).get("coordinates") or []
    if len(coords) < 2:
        return None
    lon, lat = float(coords[0]), float(coords[1])
    alt = ((props.get("coord") or {}).get("alt"))
    point_id = props.get("id")
    return {
        "id": f"ref-{slugify(name)}",
        "name": name,
        "type": mapped,
        # null quando refuges.info non ha la quota: mai stimata dal DEM qui,
        # sarebbe un numero diverso da quello che dichiara la fonte.
        "altitude_m": int(alt) if isinstance(alt, (int, float)) else None,
        "lat": round(lat, 6),
        "lon": round(lon, 6),
        "source": f"refuges.info (CC BY-SA 2.0) — point {point_id}",
        "source_url": props.get("lien") or f"https://www.refuges.info/point/{point_id}/",
        "source_type": raw_type,
    }


# ── main ─────────────────────────────────────────────────────────────────────
def main() -> None:
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--radius-m", type=float, default=250.0,
                    help="distanza massima dalla traccia (default 250 m)")
    ap.add_argument("--limit", type=int, default=None,
                    help="ferma dopo N itinerari (per prove)")
    ap.add_argument("--pause", type=float, default=1.0,
                    help="pausa tra chiamate: refuges.info e' un servizio "
                         "di volontari, non lo si martella (default 1 s)")
    ap.add_argument("--activity", default=None, help="solo questa attivita'")
    args = ap.parse_args()

    data = json.loads(SEED.read_text(encoding="utf-8"))
    known_refuges = {r["id"]: r for r in data.get("refuges", [])}

    candidates = [r for r in data["routes"] if r.get("track_points")]
    if args.activity:
        candidates = [r for r in candidates if r.get("activity") == args.activity]
    if args.limit:
        candidates = candidates[:args.limit]

    print(f"itinerari con traccia da esaminare: {len(candidates)}")

    new_refuges: dict[str, dict] = {}
    rows: list[tuple[str, str]] = []
    linked_total = 0
    failed = 0

    for i, route in enumerate(candidates, 1):
        track = [(p["lat"], p["lon"]) for p in route["track_points"]
                 if p.get("lat") is not None and p.get("lon") is not None]
        if len(track) < 2:
            continue
        feats = fetch_points(track_bbox(track, args.radius_m))
        if feats is None:
            failed += 1
            rows.append((route["slug"], "PEND  refuges.info non raggiungibile"))
            continue

        found: list[dict] = []
        for f in feats:
            ref = to_refuge(f)
            if ref is None:
                continue
            d = dist_point_to_track(ref["lat"], ref["lon"], track)
            if d <= args.radius_m:
                found.append({**ref, "_dist_m": round(d)})

        if found:
            # Rifugi gia' legati a QUESTO itinerario (curati a mano): se uno
            # dei trovati e' lo stesso in un'altra lingua, si tiene il record
            # curato — ha anche il ruolo, che noi non sapremmo dedurre.
            already = [known_refuges[l["id"]]
                       for l in (route.get("refuges") or [])
                       if l["id"] in known_refuges]
            existing_ids = {l["id"] for l in route.get("refuges") or []}
            links = []
            for ref in sorted(found, key=lambda r: r["_dist_m"]):
                dist = ref.pop("_dist_m")
                dup = next((c for c in already if same_refuge(ref, c)), None)
                if dup is not None:
                    rows.append((route["slug"],
                                 f"SKIP  {ref['name']} — stesso rifugio di "
                                 f"'{dup['name']}' ({dup['id']}), gia' curato"))
                    continue
                if ref["id"] not in known_refuges:
                    new_refuges[ref["id"]] = ref
                if ref["id"] in existing_ids:
                    continue
                # `role` resta null: la distanza non dice se e' base o appoggio
                links.append({"id": ref["id"], "role": None})
                existing_ids.add(ref["id"])
                rows.append((route["slug"],
                             f"ADD   {ref['name']} ({ref['type']}, {dist} m"
                             f"{', ' + str(ref['altitude_m']) + ' m' if ref['altitude_m'] else ''})"))
            route["refuges"] = (route.get("refuges") or []) + links
            linked_total += len(links)

        if i % 25 == 0:
            print(f"  … {i}/{len(candidates)} itinerari, "
                  f"{len(new_refuges)} rifugi nuovi finora", file=sys.stderr)
        time.sleep(args.pause)

    for slug, detail in rows:
        print(f"{slug:55} {detail}")

    print(f"\nrifugi nuovi: {len(new_refuges)} | legami creati: {linked_total} "
          f"| itinerari falliti: {failed}")
    if args.dry_run:
        print("(dry-run: nessuna scrittura)")
        return
    if not new_refuges and not linked_total:
        print("nothing to add — seed invariato")
        return

    data.setdefault("refuges", []).extend(new_refuges.values())
    SEED.write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n",
                    encoding="utf-8")
    print(f"✓ seed aggiornato: {SEED} — {len(data['refuges'])} rifugi totali")


if __name__ == "__main__":
    main()
