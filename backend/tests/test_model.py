"""
Modello Zerotermico v0 — physics checks (exact where physics is exact).

Run: cd backend && python tests/test_model.py
"""
from __future__ import annotations

import pathlib
import sys
from datetime import datetime, timezone

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from app.model import solar, profile  # noqa: E402
from app.model.profile import PressureLevel, ProfileError  # noqa: E402


def check(name: str, cond: bool, detail: str = "") -> None:
    print(f"  [{'PASS' if cond else 'FAIL'}] {name}" + (f" — {detail}" if detail and not cond else ""))
    if not cond:
        sys.exit(1)


UTC = timezone.utc

# ── Solar geometry: exact astronomical checks ───────────────────────
print("== declinazione (Spencer) ==")
d_jun = solar.declination_deg(datetime(2026, 6, 21, tzinfo=UTC))
d_dec = solar.declination_deg(datetime(2026, 12, 21, tzinfo=UTC))
d_mar = solar.declination_deg(datetime(2026, 3, 20, tzinfo=UTC))
check("solstizio giugno ≈ +23.44°", abs(d_jun - 23.44) < 0.3, f"{d_jun:.2f}")
check("solstizio dicembre ≈ −23.44°", abs(d_dec + 23.44) < 0.3, f"{d_dec:.2f}")
check("equinozio marzo ≈ 0°", abs(d_mar) < 0.7, f"{d_mar:.2f}")

print("== posizione solare ==")
# Culmination found by scanning 11:00-13:00 UTC (solar noon at lon 0 ± EoT).
els = [(solar.solar_position(46.0, 0.0, datetime(2026, 6, 21, 11+dm//60, dm % 60, tzinfo=UTC))[0])
       for dm in range(0, 120, 5)]
el_max = max(els)
check("culmine giugno a 46°N ≈ 67.4°", abs(el_max - (90 - 46 + d_jun)) < 0.3, f"{el_max:.2f}")
els_dec = [(solar.solar_position(46.0, 0.0, datetime(2026, 12, 21, 11+dm//60, dm % 60, tzinfo=UTC))[0]) for dm in range(0, 120, 5)]
check("culmine dicembre a 46°N ≈ 20.6°", abs(max(els_dec) - (90 - 46 + d_dec)) < 0.3, f"{max(els_dec):.2f}")
# azimuth at culmination ≈ 180° (sun due South in the northern hemisphere)
m_at_max = range(0, 120, 5)[els.index(el_max)]
_, az_noon = solar.solar_position(46.0, 0.0, datetime(2026, 6, 21, 11+m_at_max//60, m_at_max % 60, tzinfo=UTC))
check("azimut al culmine ≈ Sud (180°)", abs(az_noon - 180) < 3, f"{az_noon:.1f}")
# morning sun is in the eastern half
_, az_am = solar.solar_position(46.0, 0.0, datetime(2026, 6, 21, 6, 0, tzinfo=UTC))
check("mattina: sole a Est (az < 180°)", 45 < az_am < 180, f"{az_am:.1f}")

print("== durata del giorno ==")
def daylight_hours(lat, day):
    hours = 0
    for k in range(0, 24 * 60, 10):
        t = day.replace(hour=k // 60, minute=k % 60)
        if solar.solar_position(lat, 0.0, t)[0] > 0:
            hours += 10 / 60
    return hours
dl_eq = daylight_hours(46.0, datetime(2026, 3, 20, tzinfo=UTC))
check("equinozio ≈ 12h di luce", abs(dl_eq - 12) < 0.4, f"{dl_eq:.2f}")
dl_jun = daylight_hours(46.0, datetime(2026, 6, 21, tzinfo=UTC))
check("giugno a 46°N ≈ 15.5-16h", 15.0 < dl_jun < 16.4, f"{dl_jun:.2f}")

print("== massa d'aria e DNI ==")
check("air mass allo zenit = 1", abs(solar.air_mass(90) - 1.0) < 0.01)
check("air mass a 30° ≈ 2", abs(solar.air_mass(30) - 2.0) < 0.05, f"{solar.air_mass(30):.3f}")
check("sotto l'orizzonte: DNI = 0", solar.clear_sky_dni(-5) == 0.0)
dni_sea = solar.clear_sky_dni(60, 0)
dni_mtn = solar.clear_sky_dni(60, 3000)
check("DNI plausibile a 60° (700-1000 W/m²)", 700 < dni_sea < 1000, f"{dni_sea:.0f}")
check("più irradianza in quota", dni_mtn > dni_sea)
check("cielo coperto taglia ~75%", abs(solar.cloud_factor(1.0) - 0.25) < 0.01)
check("sereno = 1", solar.cloud_factor(0.0) == 1.0)

print("== irradianza su pendio: i classici ==")
# North 40° face at 46°N on Dec 21: the sun never reaches the slope plane
irrs = [solar.slope_irradiance(46.0, 10.0, datetime(2026, 12, 21, h, 0, tzinfo=UTC), 40, "N").direct
        for h in range(0, 24)]
check("parete Nord 40° a dicembre: MAI sole diretto", max(irrs) == 0.0, str(max(irrs)))
# The same face in late June gets some direct sun (midsummer evening/morning)
irrs_jun = [solar.slope_irradiance(46.0, 10.0, datetime(2026, 6, 21, h, 0, tzinfo=UTC), 40, "N").direct
            for h in range(0, 24)]
check("parete Nord 40° a giugno: un po' di sole diretto", max(irrs_jun) > 20)
# South slope at winter noon beats flat ground (cosine gain)
noon_dec = datetime(2026, 12, 21, 11, 45, tzinfo=UTC)
s30 = solar.slope_irradiance(46.0, 0.0, noon_dec, 30, "S").direct
flat = solar.slope_irradiance(46.0, 0.0, noon_dec, 0, "N").direct
check("pendio Sud 30° > piano a mezzogiorno invernale", s30 > flat * 1.3, f"{s30:.0f} vs {flat:.0f}")

print("== ora di riscaldamento per versante ==")
day = datetime(2026, 3, 15, tzinfo=UTC)
t_e = solar.warming_onset_utc(46.0, 10.0, day, 35, "E")
t_s = solar.warming_onset_utc(46.0, 10.0, day, 35, "S")
t_w = solar.warming_onset_utc(46.0, 10.0, day, 35, "W")
t_n = solar.warming_onset_utc(46.0, 10.0, day, 35, "N")
check("Est si scalda prima di Sud", t_e is not None and t_s is not None and t_e < t_s,
      f"E={t_e} S={t_s}")
check("Sud prima di Ovest", t_s < t_w, f"S={t_s} W={t_w}")
check("Nord 35° a metà marzo: mai sopra soglia", t_n is None, str(t_n))
check("overcast: mai sopra soglia",
      solar.warming_onset_utc(46.0, 10.0, day, 35, "S", cloud_cover=1.0) is None)

# ── Vertical profile ────────────────────────────────────────────────
print("== profilo verticale: interpolazione ==")
STD = [PressureLevel(925, 800, 8.0), PressureLevel(850, 1500, 3.45),
       PressureLevel(700, 3000, -6.3), PressureLevel(500, 5500, -22.55)]
check("interp esatta a un livello", profile.temp_at(STD, 1500) == 3.45)
t2000 = profile.temp_at(STD, 2000)
check("interp lineare tra 1500 e 3000", abs(t2000 - (3.45 + (2000-1500)/(3000-1500)*(-6.3-3.45))) < 1e-9,
      f"{t2000:.3f}")
try:
    profile.temp_at(STD, 9000)
    check("fuori colonna → errore, mai un numero inventato", False)
except ProfileError:
    check("fuori colonna → errore, mai un numero inventato", True)
try:
    profile.temp_at([STD[0]], 1000)
    check("un solo livello → errore", False)
except ProfileError:
    check("un solo livello → errore", True)

print("== inversioni ==")
INV = [PressureLevel(1000, 200, -8.0), PressureLevel(925, 800, -1.0),
       PressureLevel(850, 1500, 2.0), PressureLevel(700, 3000, -8.0)]
found = profile.detect_inversions(INV)
check("inversione di valle rilevata", len(found) == 2, str(found))
check("strato base corretto", found[0].base_m == 200 and found[0].strength_c == 7.0)
check("colonna standard: nessuna inversione", profile.detect_inversions(STD) == [])

print("== zero termico dal profilo ==")
fl = profile.freezing_levels(STD)
# crossing between 1500 (3.45) and 3000 (-6.3): 1500 + 3.45/9.75*1500 = 2030.77
check("zero termico ≈ 2031 m (interpolato)", abs(fl.principal_m - 2030.8) < 0.5, str(fl.principal_m))
check("una sola intersezione", len(fl.crossings_m) == 1)
fl_inv = profile.freezing_levels(INV)
check("con inversione: 2 intersezioni", len(fl_inv.crossings_m) == 2, str(fl_inv.crossings_m))
check("principale = la più alta", fl_inv.principal_m == max(fl_inv.crossings_m))
ALL_NEG = [PressureLevel(850, 1500, -5.0), PressureLevel(700, 3000, -15.0)]
fln = profile.freezing_levels(ALL_NEG)
check("colonna tutta sotto zero: principal None + flag", fln.principal_m is None and fln.entirely_below_zero)

print("\nALL MODEL PHYSICS CHECKS PASSED")
