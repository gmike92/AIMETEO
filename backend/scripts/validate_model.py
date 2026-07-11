"""
Validazione Modello Zerotermico v0 — T dal profilo vs OSSERVAZIONI in quota.

Confronta, per le stazioni meteo più alte dell'Alto Adige (Open Data Provincia
di Bolzano, senza chiave — CC0/attribuzione provinciale):
  A) T osservata alla stazione (il dato vero, ora corrente)
  B) T del NOSTRO modello: colonna Open-Meteo (livelli di pressione) →
     interpolazione alla quota reale della stazione (app.model.profile)
  C) baseline "app generica": temperature_2m di Open-Meteo al punto
     (già downscalata da loro — baseline FORTE, non uno strawman)

Output: tabella per stazione + MAE per metodo, e append del run in
docs/VALIDATION_LOG.md — ogni esecuzione accumula punti per l'hindcast.
Onestà statistica: UN run è un aneddoto; il log nel tempo è la validazione.

Uso (dal Mac, serve rete):
    cd backend && python3 scripts/validate_model.py [--min-ele 2000] [--top 8]
"""
from __future__ import annotations

import argparse
import json
import pathlib
import sys
from datetime import datetime, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.model import profile as vprofile  # noqa: E402
from app.model.profile import PressureLevel  # noqa: E402

REPO = pathlib.Path(__file__).resolve().parents[2]
LOG = REPO / "docs" / "VALIDATION_LOG.md"

BZ_STATIONS = "https://daten.buergernetz.bz.it/services/meteo/v1/stations"
BZ_SENSORS = "https://daten.buergernetz.bz.it/services/meteo/v1/sensors?station_code={code}"
OM_LEVELS = [1000, 925, 850, 700, 500]


def get_json(url: str, timeout: float = 30.0):
    import httpx
    r = httpx.get(url, timeout=timeout,
                  headers={"User-Agent": "AIMETEO model validation"})
    r.raise_for_status()
    return r.json()


def bz_high_stations(min_ele: float, top: int) -> list[dict]:
    """Stazioni BZ più alte con coordinate. Parsing tollerante (GeoJSON o lista)."""
    raw = get_json(BZ_STATIONS)
    feats = raw.get("features", raw if isinstance(raw, list) else [])
    out = []
    for f in feats:
        p = f.get("properties", f)
        geom = f.get("geometry") or {}
        coords = geom.get("coordinates") or [p.get("LONG"), p.get("LAT")]
        try:
            ele = float(p.get("ALT"))
            lon, lat = float(coords[0]), float(coords[1])
        except (TypeError, ValueError):
            continue
        if ele < min_ele:
            continue
        out.append({"code": p.get("SCODE"), "name": p.get("NAME_I") or p.get("NAME_D"),
                    "lat": lat, "lon": lon, "ele": ele})
    out.sort(key=lambda s: -s["ele"])
    return out[:top]


def bz_latest_temp(code: str):
    """Ultima T osservata (sensore LT, °C) con timestamp; None se assente."""
    try:
        sensors = get_json(BZ_SENSORS.format(code=code))
    except Exception:
        return None, None
    for s in sensors if isinstance(sensors, list) else []:
        if (s.get("TYPE") or s.get("SENSOR") or "").upper() == "LT":
            try:
                return float(s["VALUE"]), s.get("DATE")
            except (TypeError, ValueError, KeyError):
                return None, None
    return None, None


def om_column_and_2m(lat: float, lon: float):
    """Colonna livelli pressione + temperature_2m correnti da Open-Meteo."""
    varlist = ",".join([f"temperature_{p}hPa" for p in OM_LEVELS]
                       + [f"geopotential_height_{p}hPa" for p in OM_LEVELS])
    url = (f"https://api.open-meteo.com/v1/forecast?latitude={lat:.4f}"
           f"&longitude={lon:.4f}&hourly={varlist}"
           f"&current=temperature_2m&forecast_days=1&timezone=UTC")
    d = get_json(url)
    hourly = d.get("hourly", {})
    times = hourly.get("time", [])
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:00")
    idx = times.index(now) if now in times else 0
    levels = []
    for p in OM_LEVELS:
        t = hourly.get(f"temperature_{p}hPa")
        z = hourly.get(f"geopotential_height_{p}hPa")
        if t and z and t[idx] is not None and z[idx] is not None:
            levels.append(PressureLevel(float(p), float(z[idx]), float(t[idx])))
    t2m = (d.get("current") or {}).get("temperature_2m")
    return sorted(levels, key=lambda l: l.height_m), t2m


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--min-ele", type=float, default=2000.0)
    ap.add_argument("--top", type=int, default=8)
    args = ap.parse_args()

    print(f"Cerco stazioni BZ sopra {args.min_ele:.0f} m…")
    stations = bz_high_stations(args.min_ele, args.top)
    if not stations:
        sys.exit("nessuna stazione trovata (API BZ cambiata? incolla l'errore in chat)")
    print(f"{len(stations)} stazioni: " + ", ".join(
        f"{s['name']} ({s['ele']:.0f} m)" for s in stations))

    rows = []
    for s in stations:
        obs, obs_time = bz_latest_temp(s["code"])
        if obs is None:
            print(f"  - {s['name']}: nessuna T osservata, salto")
            continue
        try:
            levels, t2m = om_column_and_2m(s["lat"], s["lon"])
            t_model = vprofile.temp_at(levels, s["ele"])
        except Exception as e:  # noqa: BLE001
            print(f"  - {s['name']}: colonna non disponibile ({e}), salto")
            continue
        rows.append({
            "name": s["name"], "ele": s["ele"], "obs": obs, "obs_time": obs_time,
            "model": round(t_model, 1),
            "om2m": round(float(t2m), 1) if t2m is not None else None,
            "err_model": round(t_model - obs, 1),
            "err_om2m": round(float(t2m) - obs, 1) if t2m is not None else None,
        })

    if not rows:
        sys.exit("nessun confronto riuscito")

    print(f"\n{'stazione':32} {'quota':>6} {'oss.':>6} {'modello':>8} {'err':>6} "
          f"{'om-2m':>6} {'err':>6}")
    for r in rows:
        om2m = f"{r['om2m']:.1f}°" if r["om2m"] is not None else "n.d."
        err_om = f"{r['err_om2m']:+.1f}°" if r["err_om2m"] is not None else "n.d."
        print(f"{r['name'][:32]:32} {r['ele']:>5.0f}m {r['obs']:>5.1f}° "
              f"{r['model']:>7.1f}° {r['err_model']:>+5.1f}° {om2m:>6} {err_om:>6}")

    mae_model = sum(abs(r["err_model"]) for r in rows) / len(rows)
    om_rows = [r for r in rows if r["err_om2m"] is not None]
    mae_om = (sum(abs(r["err_om2m"]) for r in om_rows) / len(om_rows)) if om_rows else None
    print(f"\nMAE modello (profilo→quota): {mae_model:.2f} °C su {len(rows)} stazioni")
    if mae_om is not None:
        print(f"MAE baseline (open-meteo 2m): {mae_om:.2f} °C su {len(om_rows)} stazioni")

    # append al log di validazione
    LOG.parent.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [f"\n## Run {stamp}\n",
             f"Stazioni: {len(rows)} (Alto Adige, open data provincia BZ). ",
             f"MAE modello: **{mae_model:.2f} °C**"
             + (f" · MAE baseline om-2m: **{mae_om:.2f} °C**" if mae_om is not None else "")
             + "\n\n| stazione | quota | osservata | modello | err | om-2m | err |\n"
             "|---|---|---|---|---|---|---|\n"]
    for r in rows:
        om2m = f"{r['om2m']:.1f}°" if r["om2m"] is not None else "n.d."
        err_om = f"{r['err_om2m']:+.1f}°" if r["err_om2m"] is not None else "n.d."
        lines.append(f"| {r['name']} | {r['ele']:.0f} m | {r['obs']:.1f}° "
                     f"| {r['model']:.1f}° | {r['err_model']:+.1f}° "
                     f"| {om2m} | {err_om} |\n")
    with open(LOG, "a", encoding="utf-8") as f:
        f.writelines(lines)
    print(f"\n✓ run registrato in {LOG.relative_to(REPO)}")


if __name__ == "__main__":
    main()
