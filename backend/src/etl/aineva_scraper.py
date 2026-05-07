"""
AIMETEO — AINEVA/Meteomont Scraper (v1.0)

Strategia a due livelli:
  1. EAWS API (eaws.eu) — JSON strutturato, copertura alpina europea inclusa Italia.
     Endpoint gratuito, aggiornato 1-2x/giorno. È il gold standard.
  2. Fallback regionale (ARPA, Meteomont) — HTML scraping via BeautifulSoup
     per le regioni non coperte o con dati più aggiornati.

Regioni AINEVA italiane con codice EAWS:
  IT-32-BZ  Alto Adige / Südtirol
  IT-32-TN  Trentino
  IT-34     Veneto (Dolomiti venete)
  IT-23     Valle d'Aosta
  IT-25     Lombardia (settori alpini)
  IT-21     Piemonte
  IT-36     Friuli-Venezia Giulia
  IT-57     Toscana (Appennino)

Variabili d'ambiente:
  SCRAPER_TIMEOUT_SEC  — timeout HTTP (default: 15)
  SCRAPER_USER_AGENT   — user agent per il scraping (default: bot identificato)
"""

import os
import logging
import httpx
from datetime import datetime, timezone
from typing import Optional
from bs4 import BeautifulSoup

from models.schemas import (
    AvalancheBulletin, AvalancheDanger, AvalancheProblem
)
from cache import cache, bulletin_key, TTL_BULLETIN

logger = logging.getLogger(__name__)

TIMEOUT     = int(os.getenv("SCRAPER_TIMEOUT_SEC", "15"))
USER_AGENT  = os.getenv(
    "SCRAPER_USER_AGENT",
    "AIMETEO-bot/1.0 (mountain safety app; info@aimeteo.it)"
)

EAWS_API_BASE = "https://api.avalanche.report/eaws-api/public/bulletins"

# Mappa regione → URL fallback ARPA/Meteomont (da completare in produzione)
REGIONAL_FALLBACK_URLS: dict[str, str] = {
    "IT-21":    "https://www.nimbus.it/nevi/bollettino.htm",         # Piemonte (esempio)
    "IT-25":    "https://www.arpalombardia.it/Pages/Meteoidrologia/Previsioni/Bollettino-Valanghe.aspx",
    "meteomont":"https://www.meteomont.gov.it/bulletin/it",
}


# ──────────────────────────────────────────────────────────────────────────────
# ADAPTER 1: EAWS JSON API (sorgente primaria)
# ──────────────────────────────────────────────────────────────────────────────

async def _fetch_eaws_bulletin(region_id: str) -> Optional[AvalancheBulletin]:
    """
    Recupera il bollettino EAWS per una regione italiana.
    Il formato è EAWS CAAMLv6 (JSON), standard europeo.
    """
    url = f"{EAWS_API_BASE}?lang=it&regions={region_id}"
    headers = {"User-Agent": USER_AGENT}

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            data = resp.json()
    except Exception as e:
        logger.error(f"[eaws] Errore per {region_id}: {e}")
        return None

    bulletins = data.get("bulletins", [])
    if not bulletins:
        logger.warning(f"[eaws] Nessun bollettino disponibile per {region_id}")
        return None

    # Prendi il bollettino più recente
    raw = bulletins[0]

    # ── Pericolo ──────────────────────────────────────────────────────────
    danger_ratings = raw.get("dangerRatings", [])
    danger_lo = AvalancheDanger.LOW
    danger_hi = AvalancheDanger.LOW

    for d in danger_ratings:
        level = d.get("mainValue", "low")
        rating = _eaws_level_to_enum(level)
        elevation = d.get("elevation", {})
        bound_lo = elevation.get("lowerBound", "")
        bound_hi = elevation.get("upperBound", "")

        # Se c'è una soglia di quota ("treeline"), assegna alto/basso
        if "treeline" in str(bound_lo).lower() or "2000" in str(bound_lo):
            danger_hi = rating
        else:
            danger_lo = rating
            # Se non c'è distinzione, usa lo stesso per entrambi
            danger_hi = max(danger_hi, rating)

    # Se un solo rating, applicalo a entrambe le quote
    if len(danger_ratings) == 1:
        danger_lo = danger_hi = _eaws_level_to_enum(danger_ratings[0].get("mainValue", "low"))

    # ── Problemi valanghivi ────────────────────────────────────────────────
    problems: list[AvalancheProblem] = []
    for ap in raw.get("avalancheProblems", []):
        problem_type = ap.get("problemType", "unknown")
        aspects = [a.get("compass_point", "ALL") for a in ap.get("aspects", [])]
        elev = ap.get("elevation", {})
        elev_lo = _parse_elevation(elev.get("lowerBound"))
        elev_hi = _parse_elevation(elev.get("upperBound"))
        ap_danger_level = ap.get("dangerRatingValue", "low")

        problems.append(AvalancheProblem(
            problem_type=_translate_problem_type(problem_type),
            aspects=aspects if aspects else ["ALL"],
            elevation_min_m=elev_lo,
            elevation_max_m=elev_hi,
            danger_rating=_eaws_level_to_enum(ap_danger_level),
        ))

    # ── Testi ─────────────────────────────────────────────────────────────
    texts = raw.get("texts", {})
    tendency_text = _extract_text(texts.get("tendency", []))
    snowpack_text = _extract_text(texts.get("snowpackStructure", []))
    weather_text  = _extract_text(texts.get("weatherForecast", []))

    # ── Validità ──────────────────────────────────────────────────────────
    validity = raw.get("validTime", {})
    valid_from  = _parse_dt(validity.get("startTime")) or datetime.now(timezone.utc)
    valid_until = _parse_dt(validity.get("endTime"))   or datetime.now(timezone.utc)
    published   = _parse_dt(raw.get("publicationTime")) or datetime.now(timezone.utc)

    bulletin = AvalancheBulletin(
        region_id=region_id,
        region_name=_region_id_to_name(region_id),
        published_at=published,
        valid_from=valid_from,
        valid_until=valid_until,
        danger_rating_lo=danger_lo,
        danger_rating_hi=danger_hi,
        problems=problems,
        tendency_text=tendency_text,
        snowpack_text=snowpack_text,
        weather_text=weather_text,
        source_url=f"https://bollettino.aineva.it/bulletin/it/{region_id}",
        source_name="AINEVA / EAWS",
        has_critical_danger=(danger_hi >= AvalancheDanger.HIGH),
    )
    return bulletin


# ──────────────────────────────────────────────────────────────────────────────
# ADAPTER 2: HTML Scraping (fallback regionale)
# Usato per ARPA regionali o Meteomont che non espongono API JSON
# ──────────────────────────────────────────────────────────────────────────────

async def _scrape_meteomont_bulletin() -> Optional[AvalancheBulletin]:
    """
    Scraper HTML per Meteomont (Appennino + sud Italia).
    NOTA: selettori CSS da aggiornare in base all'HTML attuale del sito.
    Questa è l'implementazione base — in produzione usare Playwright per
    siti con JavaScript-rendering.
    """
    url = REGIONAL_FALLBACK_URLS.get("meteomont", "")
    if not url:
        return None

    headers = {"User-Agent": USER_AGENT}
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT) as client:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            html = resp.text
    except Exception as e:
        logger.error(f"[meteomont_scraper] Errore HTTP: {e}")
        return None

    soup = BeautifulSoup(html, "html.parser")

    # ── Estrai il livello di pericolo principale ───────────────────────────
    # Il selettore va adattato alla struttura reale della pagina Meteomont
    danger_el = soup.select_one(".danger-level, .pericolo-valanghe, [class*='danger']")
    if not danger_el:
        logger.warning("[meteomont_scraper] Impossibile trovare il livello di pericolo nel HTML")
        return None

    danger_text = danger_el.get_text(strip=True).lower()
    danger_rating = _text_to_danger_enum(danger_text)

    # ── Estrai testo del bollettino ────────────────────────────────────────
    bulletin_text_el = soup.select_one(".bulletin-text, .bollettino-testo, article p")
    bulletin_text = bulletin_text_el.get_text(strip=True) if bulletin_text_el else None

    now = datetime.now(timezone.utc)
    return AvalancheBulletin(
        region_id="IT-meteomont",
        region_name="Meteomont (Appennino)",
        published_at=now,
        valid_from=now,
        valid_until=now,
        danger_rating_lo=danger_rating,
        danger_rating_hi=danger_rating,
        tendency_text=bulletin_text,
        source_url=url,
        source_name="Meteomont (Carabinieri Forestali)",
        has_critical_danger=(danger_rating >= AvalancheDanger.HIGH),
    )


# ──────────────────────────────────────────────────────────────────────────────
# ENTRY POINT PUBBLICO
# ──────────────────────────────────────────────────────────────────────────────

async def get_bulletin(region_id: str) -> Optional[AvalancheBulletin]:
    """
    Recupera il bollettino valanghe per una regione.
    1. Cache hit → ritorna subito
    2. Prova EAWS API
    3. Fallback HTML scraping (solo per regioni con URL configurato)
    4. Salva in cache
    """
    bkey = bulletin_key(region_id)
    cached = cache.get(bkey)
    if cached:
        return AvalancheBulletin(**cached)

    bulletin = await _fetch_eaws_bulletin(region_id)

    if bulletin is None and region_id in REGIONAL_FALLBACK_URLS:
        logger.info(f"[aineva_scraper] Fallback scraping HTML per {region_id}")
        bulletin = await _scrape_meteomont_bulletin()

    if bulletin:
        cache.set(bkey, bulletin.model_dump(mode="json"), TTL_BULLETIN)

    return bulletin


async def get_all_italian_bulletins() -> list[AvalancheBulletin]:
    """
    Recupera tutti i bollettini italiani in parallelo.
    Usato dalla Cloud Function schedulata ogni 2 ore.
    """
    import asyncio

    ITALIAN_REGIONS = [
        "IT-32-BZ",  # Alto Adige
        "IT-32-TN",  # Trentino
        "IT-34",     # Veneto
        "IT-23",     # Valle d'Aosta
        "IT-25",     # Lombardia
        "IT-21",     # Piemonte
        "IT-36",     # Friuli-Venezia Giulia
    ]

    tasks = [get_bulletin(r) for r in ITALIAN_REGIONS]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    bulletins = []
    for region_id, result in zip(ITALIAN_REGIONS, results):
        if isinstance(result, Exception):
            logger.error(f"[aineva_scraper] Errore per {region_id}: {result}")
        elif result is not None:
            bulletins.append(result)

    logger.info(f"[aineva_scraper] Recuperati {len(bulletins)}/{len(ITALIAN_REGIONS)} bollettini")
    return bulletins


# ──────────────────────────────────────────────────────────────────────────────
# UTILITY FUNCTIONS
# ──────────────────────────────────────────────────────────────────────────────

def _eaws_level_to_enum(level: str) -> AvalancheDanger:
    mapping = {
        "low": AvalancheDanger.LOW,
        "limited": AvalancheDanger.LIMITED,
        "moderate": AvalancheDanger.LIMITED,   # EAWS usa "moderate" per 2
        "considerable": AvalancheDanger.MARKED,
        "high": AvalancheDanger.HIGH,
        "very_high": AvalancheDanger.VERY_HIGH,
    }
    return mapping.get(level.lower(), AvalancheDanger.LOW)


def _text_to_danger_enum(text: str) -> AvalancheDanger:
    """Converte testo italiano (es. 'pericolo marcato') in enum."""
    if "molto forte" in text or "5" in text:  return AvalancheDanger.VERY_HIGH
    if "forte" in text or "4" in text:        return AvalancheDanger.HIGH
    if "marcato" in text or "3" in text:      return AvalancheDanger.MARKED
    if "limitato" in text or "2" in text:     return AvalancheDanger.LIMITED
    return AvalancheDanger.LOW


def _translate_problem_type(pt: str) -> str:
    """Traduce i tipi EAWS in italiano."""
    return {
        "wind_slab":            "Lastroni da vento",
        "new_snow":             "Neve fresca",
        "wet_snow":             "Neve bagnata",
        "persistent_weak_layers": "Strati deboli persistenti",
        "gliding_snow":         "Valanghe di scivolamento",
        "cornices":             "Cornici",
        "favourable_situation": "Situazione favorevole",
    }.get(pt, pt)


def _parse_elevation(val) -> Optional[int]:
    if val is None:
        return None
    try:
        return int(str(val).replace("m", "").replace("treeline", "2000").strip())
    except ValueError:
        return None


def _parse_dt(val) -> Optional[datetime]:
    if not val:
        return None
    try:
        return datetime.fromisoformat(str(val).replace("Z", "+00:00"))
    except Exception:
        return None


def _extract_text(text_list: list) -> Optional[str]:
    """Estrae il testo italiano da una lista EAWS [{lang, text}]."""
    if not text_list:
        return None
    for item in text_list:
        if isinstance(item, dict) and item.get("lang") in ("it", "IT"):
            return item.get("text")
    # Fallback al primo disponibile
    if isinstance(text_list[0], dict):
        return text_list[0].get("text")
    return str(text_list[0])


def _region_id_to_name(region_id: str) -> str:
    names = {
        "IT-32-BZ": "Alto Adige / Südtirol",
        "IT-32-TN": "Trentino",
        "IT-34":    "Veneto (Dolomiti)",
        "IT-23":    "Valle d'Aosta",
        "IT-25":    "Lombardia",
        "IT-21":    "Piemonte",
        "IT-36":    "Friuli-Venezia Giulia",
        "IT-57":    "Toscana (Appennino)",
    }
    return names.get(region_id, region_id)