"""
Pluggable avalanche-bulletin connector interface.

Every country/service implements this ONE interface and normalizes to the EAWS 1–5
scale, so the safety engine and planner are country-agnostic. Adding Austria = write
an LWDConnector and register it; nothing else changes.

We NEVER author danger ratings — connectors only fetch + normalize official bulletins.
"""
from __future__ import annotations
from abc import ABC, abstractmethod
from datetime import date, datetime, timezone
from typing import Optional
from ..models import Bulletin


class BulletinFetchError(Exception):
    """
    The official bulletin could not be retrieved or parsed (network error, upstream
    5xx, malformed payload). Distinct from "no bulletin in force" (fetch() -> None):
    callers must treat this as UNKNOWN danger and fail closed, never as "no danger".
    """


class AvalancheConnector(ABC):
    """Base class for an official avalanche-bulletin source."""

    #: Service identifier, e.g. "AINEVA". Must match area.avalanche_service.
    service: str = ""
    #: ISO-3166 country this connector serves.
    country: str = ""

    @abstractmethod
    def fetch(
        self,
        region: str,
        subzone: Optional[str] = None,
        on: Optional[date] = None,
    ) -> Optional[Bulletin]:
        """
        Fetch the official bulletin for a macro `region` (file id) and optional `subzone`
        (micro-region id), for date `on` (default: today). Returns None ONLY if no
        bulletin is in force (e.g. off-season, expired). Raises BulletinFetchError on
        retrieval/parsing failures. Always normalized to EAWS 1–5.
        """
        raise NotImplementedError

    def _now(self) -> datetime:
        return datetime.now(timezone.utc)
