"""
FMI connector (Finland) — REAL.

Source: same avalanche.report EAWS mirror as the other connectors in this
package (see eaws_mirror.py). Finland publishes ONE national bulletin file,
6 micro-regions inside (Lapland fells):

    https://static.avalanche.report/eaws_bulletins/{date}/{date}-FI.json

Verified live 2026-09-03 (2026-02-15 winter sample date): 6 bulletins,
region IDs "FI-01".."FI-06", provider "FMI" (Finnish Meteorological
Institute), already the public-facing name. No pinned subzone yet: fetch()
falls back to the most dangerous bulletin in the file.
"""
from __future__ import annotations
from datetime import timedelta
from typing import Optional

from .eaws_mirror import EawsMirrorConnector
from ..models import Bulletin


class FmiConnector(EawsMirrorConnector):
    service = "FMI"
    country = "FI"

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
                "Kohtalainen lumivyoryvaara (2) tuulen kuormittamilla rinteilla. "
                "[DATI DIMOSTRATIVI — USE_MOCK_DATA=true]"
            ),
            raw_locale="fi",
            source_url="https://www.ilmatieteenlaitos.fi/lumivyoryt",
        )
