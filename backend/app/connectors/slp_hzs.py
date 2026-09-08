"""
SLP+HZS connector (Slovakia) — REAL.

Source: same avalanche.report EAWS mirror as the other connectors in this
package (see eaws_mirror.py). Slovakia publishes ONE national bulletin
file, 8 micro-regions inside (High/Low/West Tatras, ...):

    https://static.avalanche.report/eaws_bulletins/{date}/{date}-SK.json

Verified live 2026-09-03 (2026-02-15 winter sample date): 8 bulletins,
region IDs "SK-01".."SK-08", provider "SLP+HZS" (Slovak avalanche patrol +
mountain rescue service, joint bulletin), already the public-facing name.
No pinned subzone yet: fetch() falls back to the most dangerous bulletin in
the file.
"""
from __future__ import annotations
from datetime import timedelta
from typing import Optional

from .eaws_mirror import EawsMirrorConnector
from ..models import Bulletin


class SlpHzsConnector(EawsMirrorConnector):
    service = "SLP+HZS"
    country = "SK"

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
            problem_types=["wind_slab", "persistent_weak_layers"],
            raw_text=(
                "Zvysene lavinove nebezpecenstvo (3) na severnych svahoch nad 1800 m. "
                "[DATI DIMOSTRATIVI — USE_MOCK_DATA=true]"
            ),
            raw_locale="sk",
            source_url="https://www.hzs.sk/lavinova-prognoza/",
        )
