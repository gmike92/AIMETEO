"""
Connettore generico per qualunque servizio EAWS pubblicato sul mirror statico
di avalanche.report — la stessa infrastruttura che già serve AINEVA (Italia),
gratuita e pan-europea:

    https://static.avalanche.report/eaws_bulletins/{YYYY-MM-DD}/{YYYY-MM-DD}-{REGION}.json

Verificato a costo zero (nessuna chiave, nessun account) per:
    SLF (Svizzera)     — file "CH" (bollettino unico nazionale)
    LWD Tirol (Austria) — file "AT-07" (copre il Tirolo, dove ricadono le
                          nostre aree Ötztal/Zillertal)
    ARSO (Slovenia)     — file "SI" (bollettino unico nazionale)

AinevaConnector estende questa stessa classe (vedi aineva.py) — l'unica
differenza reale tra i quattro è quale REGION file leggono e quale nome di
servizio dichiarano; la fetch/parse/scadenza è identica ovunque perché il
formato CAAML è lo stesso standard EAWS in tutti i paesi.

Parsing/normalizzazione in caaml.py — non autorizziamo mai un grado di
pericolo, lo leggiamo soltanto da dangerRatings.
"""
from __future__ import annotations
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import httpx

from .base import AvalancheConnector, BulletinFetchError
from .caaml import parse_caaml
from ..models import Bulletin
from ..config import settings

STATIC_BASE = "https://static.avalanche.report/eaws_bulletins"


class EawsMirrorConnector(AvalancheConnector):
    """Base per un servizio EAWS servito dal mirror avalanche.report."""

    #: Mesi senza bollettino in vigore (stagione alpina ~nov-mag) — usato solo
    #: dal mock qui sotto; il fetch reale si affida al 404 del mirror, mai a
    #: questa lista per decidere se un bollettino vero esiste.
    OFF_SEASON_MONTHS = {6, 7, 8, 9, 10}

    def _url(self, region: str, on: date) -> str:
        d = on.isoformat()
        return f"{STATIC_BASE}/{d}/{d}-{region}.json"

    def _get(self, url: str) -> httpx.Response:
        try:
            return httpx.get(url, timeout=10.0, headers={"Accept": "application/json"})
        except httpx.HTTPError as e:
            raise BulletinFetchError(f"{self.service} fetch failed for {url}: {e}") from e

    def fetch(
        self,
        region: str,
        subzone: Optional[str] = None,
        on: Optional[date] = None,
    ) -> Optional[Bulletin]:
        """
        None = nessun bollettino in vigore (fuori stagione/scaduto) — un fatto
        verificato. BulletinFetchError = non verificabile — i chiamanti devono
        fail-closed, mai trattarlo come "nessun pericolo".
        """
        if settings.use_mock_data:
            return self._mock(region, subzone)

        on = on or date.today()
        url = self._url(region, on)
        resp = self._get(url)
        if resp.status_code == 404:
            # Nessun file per oggi (i bollettini escono nel tardo pomeriggio
            # per il giorno dopo) — un tentativo sul giorno precedente. `url`
            # DEVE seguire il file realmente usato: diventa il link ufficiale
            # del Bulletin (rilevanza per la responsabilità).
            url = self._url(region, on - timedelta(days=1))
            resp = self._get(url)
            if resp.status_code == 404:
                return None  # davvero nessun bollettino pubblicato (fuori stagione)
        if resp.status_code != 200:
            raise BulletinFetchError(f"{self.service} mirror returned {resp.status_code} for {url}")

        try:
            data = resp.json()
        except ValueError as e:
            raise BulletinFetchError(f"{self.service} payload is not valid JSON at {url}: {e}") from e

        bulletin = parse_caaml(
            data, region=region, subzone=subzone, source_url=url,
            country=self.country, service=self.service,
        )
        # Un bollettino scaduto NON è in vigore — equivalente a nessun
        # bollettino (il planner fa fail-closed in stagione), mai servito
        # come attuale. La scadenza è relativa alla data richiesta: le
        # chiamate live usano l'orologio, i fetch storici accettano un
        # bollettino valido in un qualunque istante del giorno richiesto.
        if bulletin is not None and bulletin.valid_until is not None:
            valid_until = bulletin.valid_until
            if valid_until.tzinfo is None:
                valid_until = valid_until.replace(tzinfo=timezone.utc)
            if on == date.today():
                ref = datetime.now(timezone.utc)
            else:
                ref = datetime(on.year, on.month, on.day, tzinfo=timezone.utc)
            if valid_until < ref:
                return None
        return bulletin

    def _mock(self, region: str, subzone: Optional[str]) -> Optional[Bulletin]:
        """Demo stagionale di ripiego (USE_MOCK_DATA=true) — sovrascritta da
        ogni connettore con un testo onestamente etichettato come demo."""
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
            raw_text=f"Pericolo marcato (3). [DATI DIMOSTRATIVI — USE_MOCK_DATA=true, {self.service}]",
            raw_locale="it",
            source_url=f"{STATIC_BASE}/",
        )
