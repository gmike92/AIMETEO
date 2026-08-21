"""
Tempi di percorrenza — metodo svizzero (adottato anche dal CAI).

Convenzione alpinistica classica, deterministica, zero AI:
  t_orizzontale = distanza / velocità_piano
  t_verticale   = dislivello⁺ / velocità_salita + dislivello⁻ / velocità_discesa
  tempo tratta  = max(t_o, t_v) + min(t_o, t_v) / 2

Parametri per attività (dichiarati nella risposta API — l'utente deve poter
giudicare la stima):
  attività        piano     salita    discesa
  escursionismo   4.0 km/h  350 m/h   500 m/h
  scialpinismo    5.0 km/h  400 m/h   700 m/h  (discesa in sci)
  alpinismo       3.5 km/h  350 m/h   450 m/h
  via_ferrata     3.0 km/h  250 m/h   400 m/h

Le SOSTE non sono incluse (dichiarato). Senza traccia reale la stima usa il
solo dislivello ed è marcata come parziale — mai spacciata per completa.
"""
from __future__ import annotations

import math
from typing import Optional

#: attività → (v_piano km/h, v_salita m/h, v_discesa m/h)
PARAMS: dict[str, tuple[float, float, float]] = {
    "escursionismo": (4.0, 350.0, 500.0),
    "scialpinismo": (5.0, 400.0, 700.0),
    "alpinismo": (3.5, 350.0, 450.0),
    "via_ferrata": (3.0, 250.0, 400.0),
}
DEFAULT_ACTIVITY = "escursionismo"

METHOD_LABEL = "metodo svizzero (CAI), soste escluse"


def _hav_m(a: dict, b: dict) -> float:
    la1, lo1, la2, lo2 = map(math.radians,
                             (a["lat"], a["lon"], b["lat"], b["lon"]))
    h = (math.sin((la2 - la1) / 2) ** 2
         + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2)
    return 2 * 6371000.0 * math.asin(math.sqrt(h))


def leg_minutes(dist_km: float, up_m: float, down_m: float,
                v_flat: float, v_up: float, v_down: float) -> float:
    """Tempo di una tratta in minuti, metodo svizzero (non arrotondato)."""
    t_o = dist_km / v_flat if v_flat > 0 else 0.0
    t_v = (up_m / v_up if v_up > 0 else 0.0) + (down_m / v_down if v_down > 0 else 0.0)
    hours = max(t_o, t_v) + min(t_o, t_v) / 2.0
    return hours * 60.0


def _round5(minutes: float) -> int:
    return int(round(minutes / 5.0) * 5)


def estimate(track_points: list[dict], activity: str) -> Optional[dict]:
    """
    Stima completa da una traccia REALE: tratta di salita (partenza→punto più
    alto) + tratta di discesa (resto). None con meno di 3 punti utili.
    """
    pts = [p for p in (track_points or [])
           if p.get("lat") is not None and p.get("ele") is not None]
    if len(pts) < 3:
        return None
    v_flat, v_up, v_down = PARAMS.get(activity, PARAMS[DEFAULT_ACTIVITY])

    top_i = max(range(len(pts)), key=lambda i: pts[i]["ele"])
    legs = []
    for seg in (pts[: top_i + 1], pts[top_i:]):
        dist = up = down = 0.0
        for a, b in zip(seg, seg[1:]):
            dist += _hav_m(a, b)
            d = b["ele"] - a["ele"]
            if d > 0:
                up += d
            else:
                down -= d
        legs.append(leg_minutes(dist / 1000.0, up, down, v_flat, v_up, v_down))

    salita, discesa = legs[0], legs[1] if len(legs) > 1 else 0.0
    dist_tot = sum(_hav_m(a, b) for a, b in zip(pts, pts[1:])) / 1000.0
    return {
        "salita_min": _round5(salita),
        "discesa_min": _round5(discesa),
        "totale_min": _round5(salita + discesa),
        "distanza_km": round(dist_tot, 1),
        "metodo": METHOD_LABEL,
        "parametri": f"{v_flat:g} km/h piano · {v_up:g} m/h salita · {v_down:g} m/h discesa",
        "parziale": False,
    }


def estimate_from_gain(vertical_gain_m: Optional[float],
                       activity: str) -> Optional[dict]:
    """
    Senza traccia: SOLO il tempo di salita dal dislivello (parziale, e lo
    diciamo). Niente distanza → niente invenzioni su discesa e totale.
    """
    if not vertical_gain_m or vertical_gain_m <= 0:
        return None
    _, v_up, _ = PARAMS.get(activity, PARAMS[DEFAULT_ACTIVITY])
    salita = vertical_gain_m / v_up * 60.0
    return {
        "salita_min": _round5(salita),
        "discesa_min": None,
        "totale_min": None,
        "distanza_km": None,
        "metodo": METHOD_LABEL + " — stima dal solo dislivello (traccia assente)",
        "parametri": f"{v_up:g} m/h salita",
        "parziale": True,
    }
