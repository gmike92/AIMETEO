"""
SMA connector (Andorra) — REAL.

Source: same avalanche.report EAWS mirror as the other connectors in this
package (see eaws_mirror.py). Andorra publishes ONE national bulletin file
with 3 micro-regions inside:

    https://static.avalanche.report/eaws_bulletins/{date}/{date}-AD.json

Verified live 2026-09-03 (2026-02-15 winter sample date): 3 bulletins,
region IDs "AD-01"/"AD-02"/"AD-03", provider "SMA" (Servei Meteorologic
d'Andorra) — already the public-facing name, no translation needed (unlike
mf.py/varsom.py). No pinned subzone yet: fetch() falls back to the most
dangerous bulletin in the file.
"""
from __future__ import annotations
from datetime import timedelta
from typing import Optional

from .eaws_mirror import EawsMirrorConnector
from ..models import Bulletin


class SmaConnector(EawsMirrorConnector):
    service = "SMA"
    country = "AD"

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
            danger_by_aspect={"N": 2, "NE": 2, "E": 2, "SE": 1, "S": 1, "SW": 1, "W": 2, "NW": 2},
            problem_types=["wind_slab"],
            raw_text=(
                "Risc notable (2) per sobre de 2400 m en vessants nord. "
                "[DATI DIMOSTRATIVI — USE_MOCK_DATA=true]"
            ),
            raw_locale="ca",
            source_url="https://www.meteo.ad/allaus",
        )
