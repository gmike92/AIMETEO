"""Test tempi di percorrenza (metodo svizzero) — valori esatti, zero tolleranza."""
from __future__ import annotations

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.model import timing  # noqa: E402

OK = 0


def check(name: str, cond: bool, detail: str = "") -> None:
    global OK
    assert cond, f"FAIL {name} {detail}"
    OK += 1
    print(f"  ✓ {name}")


# ── leg_minutes: la formula pura ─────────────────────────────────────────
# Piano puro: 4 km a 4 km/h = 60 min (t_v=0 → max=1h, min=0)
check("piano puro 4 km", abs(timing.leg_minutes(4, 0, 0, 4, 350, 500) - 60.0) < 1e-9)

# Salita pura: 700 m a 350 m/h = 2h = 120 min
check("salita pura 700 m", abs(timing.leg_minutes(0, 700, 0, 4, 350, 500) - 120.0) < 1e-9)

# Caso misto classico: 5 km + 1000 m salita, escursionismo
# t_o = 1.25 h · t_v = 2.857h → 2.857 + 0.625 = 3.482h = 208.93 min
mixed = timing.leg_minutes(5, 1000, 0, 4, 350, 500)
check("misto 5 km/1000 m", abs(mixed - (1000 / 350 + 1.25 / 2) * 60) < 1e-6, f"{mixed}")

# Discesa conteggiata alla velocità di discesa: 500 m a 500 m/h = 1h = 60 min
check("discesa pura 500 m", abs(timing.leg_minutes(0, 0, 500, 4, 350, 500) - 60.0) < 1e-9)

# ── estimate: traccia sintetica A/R su una "collina" ─────────────────────
# 11 punti in linea: sale 500 m in ~2.22 km, poi scende identico.
# (0.004° lon ≈ 318 m a 45°N per passo, 5 passi per lato)
up = [{"lat": 45.0, "lon": 10.0 + 0.004 * i, "ele": 1000 + 100 * i} for i in range(6)]
down = [{"lat": 45.0, "lon": 10.02 + 0.004 * i, "ele": 1500 - 100 * (i + 1)} for i in range(5)]
pts = up + down
t = timing.estimate(pts, "escursionismo")
check("estimate non None", t is not None)
check("estimate completo", t["parziale"] is False)
check("salita > discesa (500 m/350 vs 500)", t["salita_min"] > t["discesa_min"], str(t))
check("salita ~100-120 min", 95 <= t["salita_min"] <= 125, str(t["salita_min"]))
check("discesa ~65-85 min", 60 <= t["discesa_min"] <= 90, str(t["discesa_min"]))
check("totale = salita+discesa (±5 arrotond.)",
      abs(t["totale_min"] - (t["salita_min"] + t["discesa_min"])) <= 5)
# 9 passi utili × ~0.315 km (0.004° lon a 45°N) ≈ 2.8 km
check("distanza ~2.8 km", 2.5 <= t["distanza_km"] <= 3.2, str(t["distanza_km"]))
check("arrotondato a 5", t["salita_min"] % 5 == 0 and t["discesa_min"] % 5 == 0)
check("metodo dichiarato", "svizzero" in t["metodo"])
check("parametri dichiarati", "m/h" in t["parametri"])

# Scialpinismo: stessa traccia, discesa in sci molto più rapida
tsk = timing.estimate(pts, "scialpinismo")
check("sci: discesa più rapida dell'escursionista", tsk["discesa_min"] < t["discesa_min"])

# ── fail-safe: mai inventare ─────────────────────────────────────────────
check("traccia troppo corta → None", timing.estimate(pts[:2], "escursionismo") is None)
check("traccia None → None", timing.estimate(None, "escursionismo") is None)

g = timing.estimate_from_gain(700, "escursionismo")
check("da dislivello: salita 700/350=120", g["salita_min"] == 120, str(g))
check("da dislivello: parziale e senza totale",
      g["parziale"] is True and g["totale_min"] is None and g["distanza_km"] is None)
check("da dislivello: dichiarato nel metodo", "dislivello" in g["metodo"])
check("gain nullo → None", timing.estimate_from_gain(0, "escursionismo") is None)

# Attività ignota → parametri di default (mai crash)
check("attività ignota → default", timing.estimate(pts, "parapendio") is not None)

print(f"\nALL TIMING CHECKS PASSED ({OK})")
