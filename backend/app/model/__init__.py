"""
Modello Zerotermico v0 — diagnostic physics post-processing.

NOT a prognostic NWP model: we take vertical profiles and cloud cover from the
parent model (ICON/GFS via provider) and add the physics of WHERE you actually
are — real elevation, slope and aspect from the ingested track.

Components:
- profile:  T(z) from pressure-level profiles, inversion detection,
            freezing level read from the profile (not lapse-derived)
- solar:    exact solar geometry, clear-sky irradiance on tilted slopes,
            cloud attenuation, warming-onset hour per aspect

Every function is pure and unit-tested against exact physical checks
(solstice declination, noon azimuth, north-face-in-December darkness, ...).
Claims discipline: outputs are labelled as model-derived; skill vs. raw model
must be demonstrated by hindcast validation before any accuracy claim ships.
"""
from . import profile, solar  # noqa: F401
