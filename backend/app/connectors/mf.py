"""
Météo-France connector (France) — REAL.

Source: same avalanche.report EAWS mirror as AINEVA/SLF/LWD/ARSO (see
eaws_mirror.py). France publishes ONE national bulletin file, like
Switzerland and Slovenia:

    https://static.avalanche.report/eaws_bulletins/{date}/{date}-FR.json

Verified live 2026-09-03 (2026-02-15 winter sample date): provider
"Meteo France", https://meteofrance.com/meteo-montagne, 36 bulletins in the
file, region IDs like "FR-01". Replaces the previous UnavailableConnector
placeholder (registered as "ANENA-TODO") — ANENA is a real French avalanche
research body, but it isn't the one publishing on this free mirror; Météo
France is, so that's the service name we actually attribute the bulletin to
(must match area.avalanche_service, see base.py).
"""
from __future__ import annotations
from datetime import timedelta
from typing import Optional

from .eaws_mirror import EawsMirrorConnector
from ..models import Bulletin


class MeteoFranceConnector(EawsMirrorConnector):
    service = "Meteo France"
    country = "FR"

    def _mock(self, region: str, subzone: Optional[str]) -> Optional[Bulletin]:
        now = self._now()
        if now.month in self.OFF_SEASON_MONTHS:
            return None
        return Bulletin(
            avalanche_service=self.service,
            avalanche_zone=subzone or region,
            country=self.country,
            issued_at=now,
            valid_until=now + timedelta(hours=24),
            danger_level=3,
            danger_by_aspect={"N": 3, "NE": 3, "E": 2, "SE": 2, "S": 1, "SW": 1, "W": 2, "NW": 3},
            problem_types=["wind_slab"],
            raw_text=(
                "Risque marque (3) au-dessus de 2200 m sur versants nord. "
                "[DATI DIMOSTRATIVI — USE_MOCK_DATA=true]"
            ),
            raw_locale="fr",
            source_url="https://meteofrance.com/meteo-montagne",
        )
