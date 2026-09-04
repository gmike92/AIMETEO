"""
Recensioni utenti per itinerario — GET/POST /routes/{slug}/reviews.

Nessun account: come waitlist.py, un nome libero per recensione, non un
profilo. Stesso pattern di persistenza di waitlist.py apposta, non un
compromesso: scrive Postgres direttamente con db.cursor() quando configurato,
con un fallback in-memory (_MEM) altrimenti — bypassa store.py/store_pg.py di
proposito, perché quel modulo è la facciata di LETTURA del catalogo itinerari
(route/area), non un ORM generico per ogni tabella. Le recensioni sono uno
scrivi-e-rileggi indipendente, come waitlist; infilarle in store.py
costringerebbe quel modulo a fare due cose diverse. Il fallback in-memory
sopravvive finché il processo resta in vita, non tra un riavvio e l'altro:
onesto quanto il resto del backend "memory" (vedi store_memory.py).

Nessun filtro di voce sul testo: quella regola vale per il testo che
GENERIAMO noi (briefing, planner), non per il contenuto scritto da chi
recensisce — non è nostro da riscrivere.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from ..config import settings
from .. import store

router = APIRouter(prefix="/routes", tags=["reviews"])

_MEM: dict[str, list[dict]] = {}


class Review(BaseModel):
    id: str
    route_slug: str
    author_name: str
    rating: int
    text: str
    created_at: datetime


class ReviewCreate(BaseModel):
    author_name: str = Field(..., min_length=1, max_length=60)
    rating: int = Field(..., ge=1, le=5)
    text: str = Field(..., min_length=1, max_length=1000)


class ReviewList(BaseModel):
    reviews: list[Review]
    count: int
    # None quando non c'è ancora nessuna recensione — mai un voto medio
    # finto (0 o simili) al posto di "nessun dato".
    average_rating: float | None = None


def _summarize(reviews: list[Review]) -> ReviewList:
    if not reviews:
        return ReviewList(reviews=[], count=0, average_rating=None)
    avg = sum(r.rating for r in reviews) / len(reviews)
    return ReviewList(reviews=reviews, count=len(reviews), average_rating=round(avg, 1))


@router.get("/{slug}/reviews", response_model=ReviewList)
def list_reviews(slug: str) -> ReviewList:
    if not store.get_route(slug):
        raise HTTPException(404, f"route '{slug}' not found")

    if settings.database_url:
        try:
            from .. import db
            with db.cursor() as cur:
                cur.execute(
                    """SELECT id, route_slug, author_name, rating, text, created_at
                       FROM route_review WHERE route_slug = %s
                       ORDER BY created_at DESC""",
                    (slug,),
                )
                rows = cur.fetchall()
        except Exception as e:
            raise HTTPException(503, "recensioni momentaneamente non disponibili, riprova") from e
        reviews = [Review(**{**row, "id": str(row["id"])}) for row in rows]
    else:
        rows = _MEM.get(slug, [])
        reviews = [Review(**row) for row in sorted(rows, key=lambda r: r["created_at"], reverse=True)]

    return _summarize(reviews)


@router.post("/{slug}/reviews", response_model=Review, status_code=201)
def create_review(slug: str, payload: ReviewCreate) -> Review:
    if not store.get_route(slug):
        raise HTTPException(404, f"route '{slug}' not found")

    author = payload.author_name.strip()
    text = payload.text.strip()
    if not author or not text:
        raise HTTPException(422, "nome e testo della recensione non possono essere vuoti")

    if settings.database_url:
        try:
            from .. import db
            with db.cursor() as cur:
                cur.execute(
                    """INSERT INTO route_review (route_slug, author_name, rating, text)
                       VALUES (%s, %s, %s, %s)
                       RETURNING id, route_slug, author_name, rating, text, created_at""",
                    (slug, author, payload.rating, text),
                )
                row = cur.fetchone()
        except Exception as e:
            raise HTTPException(503, "invio recensione momentaneamente non disponibile, riprova") from e
        return Review(**{**row, "id": str(row["id"])})

    review = {
        "id": str(uuid.uuid4()),
        "route_slug": slug,
        "author_name": author,
        "rating": payload.rating,
        "text": text,
        "created_at": datetime.now(timezone.utc),
    }
    _MEM.setdefault(slug, []).append(review)
    return Review(**review)
