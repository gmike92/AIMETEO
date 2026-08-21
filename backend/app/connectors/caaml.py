"""
CAAML v6 (EAWS Bulletin) JSON parser.

Pure functions, no I/O — fully testable against saved fixtures. Turns an official
EAWS/AINEVA bulletin file into our normalized Bulletin model on the EAWS 1–5 scale.

We never invent a danger rating: every number here comes straight from dangerRatings.
"""
from __future__ import annotations
from datetime import datetime, timezone
from typing import Optional
from ..models import Bulletin

ALL_ASPECTS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]

# Official EAWS danger scale (text -> 1..5).
DANGER_MAP = {
    "low": 1,
    "moderate": 2,
    "considerable": 3,
    "high": 4,
    "very_high": 5,
}


def _danger_int(text: str | None) -> int:
    return DANGER_MAP.get((text or "").strip().lower(), 0)


def _parse_dt(s: str | None) -> Optional[datetime]:
    if not s:
        return None
    try:
        return datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None


def _overall_danger(bulletin: dict) -> int:
    return max((_danger_int(r.get("mainValue")) for r in bulletin.get("dangerRatings", [])), default=0)


def _baseline_danger(bulletin: dict) -> int:
    vals = [_danger_int(r.get("mainValue")) for r in bulletin.get("dangerRatings", [])]
    vals = [v for v in vals if v > 0]
    return min(vals) if vals else 0


def _danger_by_aspect(bulletin: dict) -> dict[str, int]:
    """
    Conservative per-aspect mapping: aspects named in any avalanche problem get the
    bulletin's overall (max) danger; the rest get the baseline (min) rating.
    Over-blocking is the safe failure mode for a safety filter.
    """
    overall = _overall_danger(bulletin)
    baseline = _baseline_danger(bulletin) or overall
    problem_aspects: set[str] = set()
    for p in bulletin.get("avalancheProblems", []):
        problem_aspects.update(p.get("aspects", []))
    return {a: (overall if a in problem_aspects else baseline) for a in ALL_ASPECTS}


def _select_bulletin(bulletins: list[dict], subzone: str | None) -> Optional[dict]:
    """Pick the bulletin covering the micro-region; if unknown, the most dangerous in the file."""
    if not bulletins:
        return None
    if subzone:
        match = [b for b in bulletins
                 if any(r.get("regionID") == subzone for r in b.get("regions", []))]
        if match:
            return max(match, key=_overall_danger)
    # Fallback: whole macro-region, take the most dangerous (conservative).
    return max(bulletins, key=_overall_danger)


def parse_caaml(
    data: dict,
    *,
    region: str,
    subzone: str | None,
    source_url: str,
    country: str = "IT",
    service: str = "AINEVA",
) -> Optional[Bulletin]:
    """Parse one EAWS CAAML JSON file into a normalized Bulletin (or None if empty/off-season)."""
    b = _select_bulletin(data.get("bulletins", []), subzone)
    if b is None:
        return None
    danger = _overall_danger(b)
    if danger == 0:
        return None  # no rating (e.g. off-season) -> treat as no bulletin

    activity = b.get("avalancheActivity", {})
    raw_text = " ".join(
        t for t in [activity.get("highlights"), activity.get("comment")] if t
    ).replace("<br/>", "\n").strip()

    provider = (b.get("source", {}).get("provider", {}) or {})
    valid = b.get("validTime", {})

    return Bulletin(
        avalanche_service=provider.get("name") or service,
        avalanche_zone=subzone or region,
        country=country,
        issued_at=_parse_dt(b.get("publicationTime")) or datetime.now(timezone.utc),
        valid_until=_parse_dt(valid.get("endTime")),
        danger_level=danger,
        danger_by_aspect=_danger_by_aspect(b),
        problem_types=sorted({p.get("problemType") for p in b.get("avalancheProblems", []) if p.get("problemType")}),
        raw_text=raw_text or "(nessun testo)",
        raw_locale=b.get("lang", "en"),
        source_url=source_url,
    )
