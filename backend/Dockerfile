# AIMETEO backend — Cloud Run container
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8080

WORKDIR /srv

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code — self-contained: the canonical safety filters live in app/safety_filters.py
# (trip-planner/safety_filters.py is a re-export shim for the spec side).
COPY app ./app

# Cloud Run sets $PORT; bind to it.
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT}
