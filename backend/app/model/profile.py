"""
Vertical temperature profiles from pressure-level data (pure physics, no I/O).

Instead of assuming the standard lapse rate everywhere (what generic apps do),
we read the ACTUAL atmospheric column from the parent model:
- T at the point's real elevation by interpolation between pressure levels
- inversion layers detected explicitly (valley cold pools: the case where the
  standard lapse rate lies by 5-10 °C)
- freezing level read from the profile, with ALL crossings reported when the
  profile is non-monotonic (inversions ⇒ possibly multiple zero crossings)

Data contract: a list of PressureLevel (typically 1000/925/850/700/500 hPa
with geopotential height and temperature from ICON/GFS via the provider).
"""
from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class PressureLevel:
    pressure_hpa: float
    height_m: float
    temp_c: float


class ProfileError(ValueError):
    """Profile unusable (too few levels, not sorted, degenerate heights)."""


def _validated(levels: list[PressureLevel]) -> list[PressureLevel]:
    if len(levels) < 2:
        raise ProfileError("servono almeno 2 livelli di pressione")
    ordered = sorted(levels, key=lambda l: l.height_m)
    for a, b in zip(ordered, ordered[1:]):
        if b.height_m - a.height_m < 1.0:
            raise ProfileError("livelli con quote degeneri")
    return ordered


def temp_at(levels: list[PressureLevel], z_m: float,
            max_extrapolation_m: float = 500.0) -> float:
    """
    Temperature (°C) at elevation z by piecewise-linear interpolation in height.
    Limited extrapolation beyond the column (max `max_extrapolation_m`) using
    the nearest layer's actual lapse — never an unbounded guess.
    """
    lv = _validated(levels)
    if z_m < lv[0].height_m - max_extrapolation_m or \
       z_m > lv[-1].height_m + max_extrapolation_m:
        raise ProfileError(
            f"quota {z_m:.0f} m fuori dal profilo "
            f"[{lv[0].height_m:.0f}–{lv[-1].height_m:.0f}] oltre l'estrapolazione consentita"
        )
    if z_m <= lv[0].height_m:
        a, b = lv[0], lv[1]
    elif z_m >= lv[-1].height_m:
        a, b = lv[-2], lv[-1]
    else:
        for a, b in zip(lv, lv[1:]):
            if a.height_m <= z_m <= b.height_m:
                break
    frac = (z_m - a.height_m) / (b.height_m - a.height_m)
    return a.temp_c + frac * (b.temp_c - a.temp_c)


@dataclass(frozen=True)
class Inversion:
    base_m: float
    top_m: float
    strength_c: float  # ΔT across the layer (positive = warmer aloft)


def detect_inversions(levels: list[PressureLevel],
                      min_strength_c: float = 0.5,
                      below_m: float = 4500.0) -> list[Inversion]:
    """
    Layers where temperature INCREASES with height (≥ min_strength_c) below
    `below_m` — the valley cold-pool signature. Empty list = well-mixed column.
    """
    lv = _validated(levels)
    out: list[Inversion] = []
    for a, b in zip(lv, lv[1:]):
        if a.height_m > below_m:
            break
        dt = b.temp_c - a.temp_c
        if dt >= min_strength_c:
            out.append(Inversion(base_m=a.height_m, top_m=b.height_m, strength_c=dt))
    return out


@dataclass(frozen=True)
class FreezingLevels:
    crossings_m: list[float]   # all 0°C crossings, ascending
    principal_m: float | None  # the highest crossing (the "zero termico" quoted)
    entirely_below_zero: bool  # whole column ≤ 0°C (principal = None)
    entirely_above_zero: bool


def freezing_levels(levels: list[PressureLevel]) -> FreezingLevels:
    """
    All heights where the interpolated profile crosses 0 °C.
    With inversions the profile can cross more than once: we report every
    crossing and take the HIGHEST as principal (aloft it is definitively
    below zero), flagging the ambiguity to callers via crossings_m.
    """
    lv = _validated(levels)
    crossings: list[float] = []
    for a, b in zip(lv, lv[1:]):
        ta, tb = a.temp_c, b.temp_c
        if ta == 0.0:
            crossings.append(a.height_m)
        if (ta > 0) != (tb > 0) and ta != tb:
            frac = ta / (ta - tb)
            crossings.append(a.height_m + frac * (b.height_m - a.height_m))
    if lv[-1].temp_c == 0.0:
        crossings.append(lv[-1].height_m)
    crossings = sorted(set(round(c, 1) for c in crossings))
    all_below = all(l.temp_c <= 0 for l in lv)
    all_above = all(l.temp_c >= 0 for l in lv)
    return FreezingLevels(
        crossings_m=crossings,
        principal_m=crossings[-1] if crossings else None,
        entirely_below_zero=all_below and not crossings,
        entirely_above_zero=all_above and not crossings,
    )
