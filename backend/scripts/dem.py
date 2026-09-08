"""
Quote DEM condivise dagli importer, con fallback tra due fonti gratuite.

    from dem import elevations
    eles = elevations([(lat, lon), ...])   # None se NESSUNA fonte risponde

Primaria: Open-Meteo Elevation (Copernicus GLO-90, ~90 m) — la stessa già
usata da tutti gli importer prima di questo modulo.
Fallback: OpenTopoData, dataset `mapzen`.

Perché serviva un fallback: Open-Meteo ha una quota giornaliera, e quando la
esaurisce risponde 429. Prima ogni 429 fermava l'import a metà (righe PEND
"mancano le quote DEM"), e l'unico rimedio era aspettare il giorno dopo.

Perché `mapzen` e non il piu' fine `eudem25m`: eudem25m e' solo europeo e
srtm30m si ferma a 60 N — verificato 2026-09-08, entrambi restituiscono
null su Queenstown (-44.9) e/o Lofoten (68.1 N), che sono nel catalogo.
mapzen e' un mosaico globale senza buchi su nessuno dei punti provati.

Perché il fallback rifa' TUTTI i punti e non solo il batch fallito: due DEM
diversi danno quote leggermente diverse sullo stesso punto, e
`vertical_gain_m` e' la somma dei dislivelli positivi punto-punto. Cucire
meta' traccia da una fonte e meta' dall'altra inventerebbe (o cancellerebbe)
dislivello nel punto di giunzione. Una traccia = un solo DEM.

Nessun valore viene mai inventato: se entrambe le fonti falliscono la
funzione restituisce None e il chiamante salta l'itinerario.
"""
from __future__ import annotations

import sys
import time
from typing import Optional

OPEN_METEO = "https://api.open-meteo.com/v1/elevation"
OPENTOPO = "https://api.opentopodata.org/v1/mapzen"

#: Entrambe le API accettano al massimo 100 punti per chiamata.
BATCH = 100
#: L'istanza pubblica di OpenTopoData ammette 1 chiamata/secondo.
OPENTOPO_PAUSE = 1.1


def _get_json(url: str, timeout: float = 60.0) -> dict:
    import httpx

    resp = httpx.get(url, timeout=timeout,
                     headers={"User-Agent": "AIMETEO route importer (repo gmike92/AIMETEO)"})
    resp.raise_for_status()
    return resp.json()


def batches(points: list[tuple[float, float]]) -> list[list[tuple[float, float]]]:
    return [points[i:i + BATCH] for i in range(0, len(points), BATCH)]


def open_meteo_url(batch: list[tuple[float, float]]) -> str:
    lats = ",".join(f"{lat:.6f}" for lat, _ in batch)
    lons = ",".join(f"{lon:.6f}" for _, lon in batch)
    return f"{OPEN_METEO}?latitude={lats}&longitude={lons}"


def opentopo_url(batch: list[tuple[float, float]]) -> str:
    locs = "|".join(f"{lat:.6f},{lon:.6f}" for lat, lon in batch)
    return f"{OPENTOPO}?locations={locs}"


def _from_open_meteo(points: list[tuple[float, float]], quiet: bool) -> Optional[list[float]]:
    out: list[float] = []
    for batch in batches(points):
        url = open_meteo_url(batch)
        data = None
        for pause in (0, 10, 30):
            if pause:
                if not quiet:
                    print(f"  … Open-Meteo, riprovo tra {pause}s", file=sys.stderr)
                time.sleep(pause)
            try:
                if not quiet:
                    print(f"GET Open-Meteo elevation ({len(batch)} punti)", file=sys.stderr)
                data = _get_json(url)
                break
            except Exception as exc:  # noqa: BLE001
                if not quiet:
                    print(f"  ! Open-Meteo: {exc}", file=sys.stderr)
        if data is None:
            return None
        vals = data.get("elevation") or []
        if len(vals) != len(batch):
            if not quiet:
                print(f"  ! Open-Meteo: attesi {len(batch)} valori, ricevuti {len(vals)}",
                      file=sys.stderr)
            return None
        out.extend(float(v) for v in vals)
    return out


def _from_opentopo(points: list[tuple[float, float]], quiet: bool) -> Optional[list[float]]:
    out: list[float] = []
    for batch in batches(points):
        url = opentopo_url(batch)
        data = None
        for pause in (0, 5, 20):
            if pause:
                if not quiet:
                    print(f"  … OpenTopoData, riprovo tra {pause}s", file=sys.stderr)
                time.sleep(pause)
            try:
                if not quiet:
                    print(f"GET OpenTopoData mapzen ({len(batch)} punti)", file=sys.stderr)
                data = _get_json(url)
                break
            except Exception as exc:  # noqa: BLE001
                if not quiet:
                    print(f"  ! OpenTopoData: {exc}", file=sys.stderr)
        if data is None:
            return None
        results = data.get("results") or []
        if len(results) != len(batch):
            if not quiet:
                print(f"  ! OpenTopoData: attesi {len(batch)} valori, ricevuti {len(results)}",
                      file=sys.stderr)
            return None
        vals = [r.get("elevation") for r in results]
        # mapzen copre tutto il pianeta, ma un null resta possibile: e' un
        # buco dichiarato del dataset, non un valore da rimpiazzare a mano.
        if any(v is None for v in vals):
            if not quiet:
                print("  ! OpenTopoData: quota nulla su almeno un punto — rinuncio",
                      file=sys.stderr)
            return None
        out.extend(float(v) for v in vals)
        time.sleep(OPENTOPO_PAUSE)
    return out


def elevations(points: list[tuple[float, float]], *, quiet: bool = False) -> Optional[list[float]]:
    """
    Quote reali per `points`, tutte dalla stessa fonte (vedi docstring del
    modulo). None quando nessuna delle due risponde — mai una lista parziale
    o riempita di zeri.
    """
    if not points:
        return []
    eles = _from_open_meteo(points, quiet)
    if eles is not None:
        return eles
    if not quiet:
        print(f"  → Open-Meteo non disponibile: riprovo i {len(points)} punti "
              f"da OpenTopoData (mapzen)", file=sys.stderr)
    return _from_opentopo(points, quiet)
