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


# ── UTM 32N → WGS84 (le stazioni BZ arrivano in EPSG:25832, metri) ─────────
_A, _F, _K0, _E0, _LON0 = 6378137.0, 1 / 298.257223563, 0.9996, 500000.0, 9.0


def utm32n_to_wgs84(easting: float, northing: float) -> tuple[float, float]:
    """Inversa UTM standard (serie di Krüger), precisione ~cm. → (lat, lon)."""
    import math
    e2 = _F * (2 - _F)
    e1 = (1 - math.sqrt(1 - e2)) / (1 + math.sqrt(1 - e2))
    m = northing / _K0
    mu = m / (_A * (1 - e2 / 4 - 3 * e2**2 / 64 - 5 * e2**3 / 256))
    phi1 = (mu
            + (3 * e1 / 2 - 27 * e1**3 / 32) * math.sin(2 * mu)
            + (21 * e1**2 / 16 - 55 * e1**4 / 32) * math.sin(4 * mu)
            + (151 * e1**3 / 96) * math.sin(6 * mu)
            + (1097 * e1**4 / 512) * math.sin(8 * mu))
    ep2 = e2 / (1 - e2)
    c1 = ep2 * math.cos(phi1) ** 2
    t1 = math.tan(phi1) ** 2
    n1 = _A / math.sqrt(1 - e2 * math.sin(phi1) ** 2)
    r1 = _A * (1 - e2) / (1 - e2 * math.sin(phi1) ** 2) ** 1.5
    d = (easting - _E0) / (n1 * _K0)
    lat = phi1 - (n1 * math.tan(phi1) / r1) * (
        d**2 / 2
        - (5 + 3 * t1 + 10 * c1 - 4 * c1**2 - 9 * ep2) * d**4 / 24
        + (61 + 90 * t1 + 298 * c1 + 45 * t1**2 - 252 * ep2 - 3 * c1**2) * d**6 / 720)
    lon = math.radians(_LON0) + (
        d - (1 + 2 * t1 + c1) * d**3 / 6
        + (5 - 2 * c1 + 28 * t1 - 3 * c1**2 + 8 * ep2 + 24 * t1**2) * d**5 / 120
    ) / math.cos(phi1)
    return math.degrees(lat), math.degrees(lon)


def _maybe_project(lon_or_e: float, lat_or_n: float) -> tuple[float, float]:
    """Se le 'coordinate' sono metri UTM (valori enormi), converti. → (lat, lon)."""
    if abs(lon_or_e) > 180 or abs(lat_or_n) > 90:
        lat, lon = utm32n_to_wgs84(lon_or_e, lat_or_n)
        if not (44.0 < lat < 48.5 and 8.0 < lon < 14.5):
            raise ValueError(f"conversione UTM implausibile: {lat:.4f},{lon:.4f}")
        return lat, lon
    return lat_or_n, lon_or_e


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
            lat, lon = _maybe_project(float(coords[0]), float(coords[1]))
        except (TypeError, ValueError):
            continue
        if ele < min_ele:
            continue
        out.append({"code": p.get("SCODE"), "name": p.get("NAME_I") or p.get("NAME_D"),
                    "lat": lat, "lon": lon, "ele": ele})
    out.sort(key=lambda s: -s["ele"])
    return out[:top]


def bz_latest(code: str) -> dict:
    """
    Ultime osservazioni della stazione: {"LT": (°C, ts), "WG": (km/h, ts)}.
    LT = temperatura; WG = velocità vento (l'API BZ la dà in m/s → ×3.6).
    Solo sensori presenti: mai valori inventati.
    """
    out: dict[str, tuple[float, str | None]] = {}
    try:
        sensors = get_json(BZ_SENSORS.format(code=code))
    except Exception:
        return out
    for s in sensors if isinstance(sensors, list) else []:
        typ = (s.get("TYPE") or s.get("SENSOR") or "").upper()
        if typ not in ("LT", "WG"):
            continue
        try:
            v = float(s["VALUE"])
        except (TypeError, ValueError, KeyError):
            continue
        if typ == "WG":
            v *= 3.6  # m/s → km/h
        out[typ] = (v, s.get("DATE"))
    return out


def om_column_and_2m(lat: float, lon: float):
    """Colonna livelli pressione + T2m e vento 10m correnti da Open-Meteo."""
    varlist = ",".join([f"temperature_{p}hPa" for p in OM_LEVELS]
                       + [f"geopotential_height_{p}hPa" for p in OM_LEVELS])
    url = (f"https://api.open-meteo.com/v1/forecast?latitude={lat:.4f}"
           f"&longitude={lon:.4f}&hourly={varlist}"
           f"&current=temperature_2m,wind_speed_10m&forecast_days=1&timezone=UTC")
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
    cur = d.get("current") or {}
    return (sorted(levels, key=lambda l: l.height_m),
            cur.get("temperature_2m"), cur.get("wind_speed_10m"))


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
        sens = bz_latest(s["code"])
        obs, obs_time = sens.get("LT", (None, None))
        if obs is None:
            print(f"  - {s['name']}: nessuna T osservata, salto")
            continue
        obs_wind, _ = sens.get("WG", (None, None))
        try:
            levels, t2m, om_wind = om_column_and_2m(s["lat"], s["lon"])
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
            # vento: solo se la stazione HA l'anemometro (mai inventato)
            "obs_wind": round(obs_wind) if obs_wind is not None else None,
            "om_wind": round(float(om_wind)) if om_wind is not None else None,
            "err_wind": (round(float(om_wind) - obs_wind)
                         if obs_wind is not None and om_wind is not None else None),
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
    wind_rows = [r for r in rows if r["err_wind"] is not None]
    mae_wind = (sum(abs(r["err_wind"]) for r in wind_rows) / len(wind_rows)) if wind_rows else None
    if mae_wind is not None:
        print(f"MAE vento (om 10m vs anemometro): {mae_wind:.1f} km/h "
              f"su {len(wind_rows)} stazioni")
        for r in wind_rows:
            print(f"  vento {r['name'][:28]:28} oss {r['obs_wind']:>3} km/h · "
                  f"om {r['om_wind']:>3} km/h · err {r['err_wind']:+d}")

    # append al log di validazione
    LOG.parent.mkdir(exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [f"\n## Run {stamp}\n",
             f"Stazioni: {len(rows)} (Alto Adige, open data provincia BZ). ",
             f"MAE modello: **{mae_model:.2f} °C**"
             + (f" · MAE baseline om-2m: **{mae_om:.2f} °C**" if mae_om is not None else "")
             + (f" · MAE vento: **{mae_wind:.1f} km/h** ({len(wind_rows)} staz.)"
                if mae_wind is not None else "")
             + "\n\n| stazione | quota | osservata | modello | err | om-2m | err "
               "| vento oss | vento om | err |\n"
             "|---|---|---|---|---|---|---|---|---|---|\n"]
    for r in rows:
        om2m = f"{r['om2m']:.1f}°" if r["om2m"] is not None else "n.d."
        err_om = f"{r['err_om2m']:+.1f}°" if r["err_om2m"] is not None else "n.d."
        w_obs = f"{r['obs_wind']} km/h" if r["obs_wind"] is not None else "n.d."
        w_om = f"{r['om_wind']} km/h" if r["om_wind"] is not None else "n.d."
        w_err = f"{r['err_wind']:+d}" if r["err_wind"] is not None else "n.d."
        lines.append(f"| {r['name']} | {r['ele']:.0f} m | {r['obs']:.1f}° "
                     f"| {r['model']:.1f}° | {r['err_model']:+.1f}° "
                     f"| {om2m} | {err_om} | {w_obs} | {w_om} | {w_err} |\n")
    with open(LOG, "a", encoding="utf-8") as f:
        f.writelines(lines)
    print(f"\n✓ run registrato in {LOG.relative_to(REPO)}")


if __name__ == "__main__":
    main()
