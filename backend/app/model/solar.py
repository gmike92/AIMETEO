"""
Solar geometry + irradiance on tilted slopes (pure physics, no I/O).

References:
- Declination & equation of time: Spencer (1971) Fourier series.
- Air mass: Kasten & Young (1989).
- Clear-sky direct normal irradiance: Meinel & Meinel (1976) empirical.
- Cloud attenuation of global irradiance: Kasten & Czeplak (1980).
- Irradiance on a tilted plane: standard cosine-of-incidence + isotropic diffuse.

Conventions:
- Angles in degrees at the API boundary, radians internally.
- Azimuth: from North, clockwise (N=0°, E=90°, S=180°, W=270°).
- Times are UTC datetimes; longitude east-positive.
Accuracy target: declination/elevation within ~0.3°, adequate for
warming-hour estimates (we round to 15 minutes downstream).
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

SOLAR_CONSTANT = 1361.0  # W/m²

_ASPECT_AZ = {"N": 0.0, "NE": 45.0, "E": 90.0, "SE": 135.0,
              "S": 180.0, "SW": 225.0, "W": 270.0, "NW": 315.0}


def aspect_to_azimuth(aspect: str) -> float:
    """Cardinal aspect (route DB convention) → downslope azimuth in degrees."""
    try:
        return _ASPECT_AZ[aspect.upper()]
    except KeyError:
        raise ValueError(f"aspect sconosciuto: {aspect!r}")


def _day_angle(dt: datetime) -> float:
    n = dt.timetuple().tm_yday
    return 2.0 * math.pi * (n - 1) / 365.0


def declination_deg(dt: datetime) -> float:
    """Solar declination δ (Spencer 1971), degrees."""
    g = _day_angle(dt)
    d = (0.006918 - 0.399912 * math.cos(g) + 0.070257 * math.sin(g)
         - 0.006758 * math.cos(2 * g) + 0.000907 * math.sin(2 * g)
         - 0.002697 * math.cos(3 * g) + 0.00148 * math.sin(3 * g))
    return math.degrees(d)


def equation_of_time_min(dt: datetime) -> float:
    """Equation of time (Spencer 1971), minutes (true solar − mean solar)."""
    g = _day_angle(dt)
    return 229.18 * (0.000075 + 0.001868 * math.cos(g) - 0.032077 * math.sin(g)
                     - 0.014615 * math.cos(2 * g) - 0.04089 * math.sin(2 * g))


def solar_position(lat: float, lon: float, when_utc: datetime) -> tuple[float, float]:
    """
    (elevation_deg, azimuth_deg from North clockwise) for a UTC instant.
    """
    if when_utc.tzinfo is None:
        when_utc = when_utc.replace(tzinfo=timezone.utc)
    dec = math.radians(declination_deg(when_utc))
    phi = math.radians(lat)

    # true solar time in hours
    utc_h = when_utc.hour + when_utc.minute / 60 + when_utc.second / 3600
    tst = utc_h + lon / 15.0 + equation_of_time_min(when_utc) / 60.0
    hour_angle = math.radians(15.0 * (tst - 12.0))

    sin_el = (math.sin(phi) * math.sin(dec)
              + math.cos(phi) * math.cos(dec) * math.cos(hour_angle))
    el = math.asin(max(-1.0, min(1.0, sin_el)))

    # azimuth from North, clockwise (atan2 formulation, no quadrant bugs)
    az = math.atan2(
        math.sin(hour_angle),
        math.cos(hour_angle) * math.sin(phi) - math.tan(dec) * math.cos(phi),
    )
    az_deg = (math.degrees(az) + 180.0) % 360.0
    return math.degrees(el), az_deg


def air_mass(elevation_deg: float) -> float:
    """Kasten & Young (1989) relative optical air mass. inf below horizon."""
    if elevation_deg <= 0:
        return float("inf")
    e = elevation_deg
    return 1.0 / (math.sin(math.radians(e)) + 0.50572 * (e + 6.07995) ** -1.6364)


def clear_sky_dni(elevation_deg: float, altitude_m: float = 0.0) -> float:
    """
    Direct normal irradiance under clear sky (Meinel), W/m².
    Altitude correction: thinner atmosphere → less extinction (simple exponential
    scale-height factor on the attenuated fraction).
    """
    m = air_mass(elevation_deg)
    if math.isinf(m):
        return 0.0
    tau = 0.7 ** (m ** 0.678)
    # altitude boost (Meinel variant): a fraction of the extinction is recovered
    h = min(max(altitude_m, 0.0), 5000.0) / 8434.0  # scale height ratio
    tau_h = tau + (1.0 - tau) * (1.0 - math.exp(-h * 1.2)) * 0.35
    return SOLAR_CONSTANT * min(tau_h, 1.0)


def cloud_factor(cloud_cover: float) -> float:
    """Kasten & Czeplak (1980): global irradiance fraction vs cloud cover [0..1]."""
    c = min(max(cloud_cover, 0.0), 1.0)
    return 1.0 - 0.75 * c ** 3.4


@dataclass(frozen=True)
class SlopeIrradiance:
    direct: float     # W/m² on the slope plane
    diffuse: float    # W/m² isotropic sky
    total: float
    sun_elevation: float
    incidence_cos: float  # cosθ sun-vs-slope-normal (<=0 → slope in shadow)


def slope_irradiance(lat: float, lon: float, when_utc: datetime,
                     slope_deg: float, aspect: str,
                     altitude_m: float = 0.0,
                     cloud_cover: float = 0.0) -> SlopeIrradiance:
    """
    Shortwave irradiance on an inclined slope. Isotropic diffuse (10% of DNI
    projected), no terrain shading/albedo bounce (v0 — documented simplifications).
    """
    el, az = solar_position(lat, lon, when_utc)
    if el <= 0:
        return SlopeIrradiance(0.0, 0.0, 0.0, el, 0.0)
    beta = math.radians(slope_deg)
    gamma = math.radians(aspect_to_azimuth(aspect))
    el_r = math.radians(el)
    az_r = math.radians(az)

    cos_theta = (math.cos(beta) * math.sin(el_r)
                 + math.sin(beta) * math.cos(el_r) * math.cos(az_r - gamma))
    dni = clear_sky_dni(el, altitude_m) * cloud_factor(cloud_cover)
    direct = dni * max(0.0, cos_theta)
    # isotropic diffuse: ~10% of horizontal clear-sky global, sky-view factor
    dhi = 0.10 * dni * math.sin(el_r) / max(cloud_factor(cloud_cover), 1e-9)
    dhi *= cloud_factor(cloud_cover) + 0.35 * (1 - cloud_factor(cloud_cover))
    diffuse = dhi * (1.0 + math.cos(beta)) / 2.0
    return SlopeIrradiance(direct, diffuse, direct + diffuse, el, cos_theta)


def warming_onset_utc(lat: float, lon: float, date_utc: datetime,
                      slope_deg: float, aspect: str,
                      altitude_m: float = 0.0, cloud_cover: float = 0.0,
                      threshold_wm2: float = 250.0,
                      step_min: int = 15) -> datetime | None:
    """
    First UTC instant of the given day when total slope irradiance exceeds
    `threshold_wm2` (wet-snow warming proxy). None = never (e.g. N face in
    December, or overcast). Scans the day at `step_min` resolution.
    """
    day = date_utc.replace(hour=0, minute=0, second=0, microsecond=0)
    for k in range(0, 24 * 60, step_min):
        t = day + timedelta(minutes=k)
        irr = slope_irradiance(lat, lon, t, slope_deg, aspect,
                               altitude_m, cloud_cover)
        if irr.total >= threshold_wm2:
            return t
    return None
