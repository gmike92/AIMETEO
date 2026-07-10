"""
Waitlist capture — the landing page + frontend POST here.

Postgres when configured (waitlist table, idempotent on email), in-memory
fallback for offline dev. No auth by design (public form), but rate limiting
belongs at the edge (Cloud Armor / API Gateway) before real traffic.
"""
from __future__ import annotations
import logging
import re
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from ..config import settings

log = logging.getLogger(__name__)
router = APIRouter(prefix="/waitlist", tags=["waitlist"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_MEM: dict[str, dict] = {}


class WaitlistSignup(BaseModel):
    email: str
    source: str = Field(default="landing", max_length=64)
    locale: str = Field(default="it", max_length=8)


@router.post("")
def join(signup: WaitlistSignup) -> dict:
    email = signup.email.strip().lower()
    if not _EMAIL_RE.match(email) or len(email) > 254:
        raise HTTPException(422, "indirizzo email non valido")

    if settings.database_url:
        try:
            from .. import db
            with db.cursor() as cur:
                cur.execute(
                    """INSERT INTO waitlist (email, source, locale)
                       VALUES (%s, %s, %s)
                       ON CONFLICT (email) DO NOTHING""",
                    (email, signup.source, signup.locale),
                )
        except Exception as e:
            log.error("waitlist insert failed: %s", e)
            raise HTTPException(503, "iscrizione momentaneamente non disponibile, riprova")
    else:
        _MEM.setdefault(email, {
            "source": signup.source, "locale": signup.locale,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })

    return {"status": "ok"}
