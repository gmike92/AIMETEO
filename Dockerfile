# Zerotermico backend — Cloud Run container (build dalla RADICE del repo,
# così entra anche route-db/ con itinerari e falesie).
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080

WORKDIR /srv

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
# store_memory/crags risolvono ../../route-db dal file → /route-db nel container
COPY route-db /route-db

CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
