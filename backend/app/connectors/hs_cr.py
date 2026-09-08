"""
HS CR connector (Czech Republic) — REAL.

Source: same avalanche.report EAWS mirror as the other connectors in this
package (see eaws_mirror.py). Czechia publishes ONE national bulletin file,
2 micro-regions inside (Krkonose/Giant Mountains, Jeseniky):

    https://static.avalanche.report/eaws_bulletins/{date}/{date}-CZ.json

Verified live 2026-09-03 (2026-02-15 winter sample date): 2 bulletins,
region IDs "CZ-04"/"CZ-06", provider "HS CR" (Horska sluzba CR — Czech
Mountain Rescue Service), already the public-facing name. No pinned subzone
yet: fetch() falls back to the most dangerous bulletin in the file.
"""
from __future__ import annotations
from datetime import timedelta
from typing import Optional

from .eaws_mirror import EawsMirrorConnector
from ..models import Bulletin


class HsCrConnector(EawsMirrorConnector):
    service = "HS CR"
    country = "CZ"

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
            danger_level=2,
            danger_by_aspect={"N": 2, "NE": 2, "E": 1, "SE": 1, "S": 1, "SW": 1, "W": 1, "NW": 2},
            problem_types=["wind_slab"],
            raw_text=(
                "Mirne nebezpeci (2) nad hranici lesa na severnich svazich. "
                "[DATI DIMOSTRATIVI — USE_MOCK_DATA=true]"
            ),
            raw_locale="cs",
            source_url="https://www.horskasluzba.cz/lavinova-predpoved",
        )
