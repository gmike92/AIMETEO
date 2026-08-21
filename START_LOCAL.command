#!/bin/bash
# AIMETEO — avvio locale con un doppio click (macOS).
# Avvia backend (FastAPI, porta 8000) + frontend (Next.js, porta 3000)
# e apre il browser. Chiudi con Ctrl+C in questa finestra.
set -e
cd "$(dirname "$0")"

echo "═══════════════════════════════════════════"
echo "  AIMETEO — avvio locale"
echo "═══════════════════════════════════════════"

# ── Prerequisiti ────────────────────────────────────────────
if ! command -v python3 >/dev/null 2>&1; then
  echo "✗ Serve Python 3. Installa i Command Line Tools con:  xcode-select --install"
  echo "  (oppure da https://www.python.org/downloads/)"
  read -p "Premi Invio per chiudere..."; exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "✗ Serve Node.js (npm). Scaricalo da https://nodejs.org (versione LTS)."
  read -p "Premi Invio per chiudere..."; exit 1
fi
echo "✓ Python: $(python3 --version) · Node: $(node --version)"

# ── Backend ─────────────────────────────────────────────────
echo ""
echo "→ Preparo il backend (prima volta: ~1 min)..."
cd backend
if [ ! -d .venv ]; then python3 -m venv .venv; fi
source .venv/bin/activate
pip install -q -r requirements.txt
[ -f .env ] || cp .env.example .env   # USE_MOCK_DATA=true: demo offline, nessuna chiave richiesta
echo "→ Avvio backend su http://localhost:8000 (dati meteo LIVE)..."
# USE_MOCK_DATA=false: geocoding, meteo settimanale e temperature in quota
# sono reali (API gratuite, nessuna chiave). Ciò che richiede chiavi (Google
# Weather, Gemini) resta in fallback dichiarato. Per la demo offline: true.
USE_MOCK_DATA=false python3 -m uvicorn app.main:app --port 8000 >/tmp/aimeteo-backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# ── Frontend ────────────────────────────────────────────────
echo "→ Preparo il frontend (prima volta: ~2 min)..."
cd frontend
[ -f .env.local ] || cp .env.local.example .env.local 2>/dev/null || echo "NEXT_PUBLIC_API_BASE=http://localhost:8000" > .env.local
npm install --no-audit --no-fund --loglevel=error
echo "→ Avvio frontend su http://localhost:3000 ..."
npx next dev -p 3000 >/tmp/aimeteo-frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

# ── Pulizia all'uscita ──────────────────────────────────────
cleanup() {
  echo ""
  echo "→ Fermo i server..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null || true
  echo "✓ Tutto fermato. A presto!"
}
trap cleanup EXIT INT TERM

# ── Attendi e apri il browser ───────────────────────────────
echo "→ Attendo che i server siano pronti..."
for i in $(seq 1 30); do
  if curl -s -o /dev/null http://localhost:8000/healthz && curl -s -o /dev/null http://localhost:3000/; then
    break
  fi
  sleep 2
done
open "http://localhost:3000"

echo ""
echo "═══════════════════════════════════════════"
echo "  ✓ AIMETEO è attivo!"
echo "    App:      http://localhost:3000"
echo "    API docs: http://localhost:8000/docs"
echo ""
echo "  Da provare:"
echo "   · Gran Paradiso e Marmolada (traccia GPX reale)"
echo "   · Pianifica gita (filtri di sicurezza + itinerari bloccati)"
echo "   · Genera relazione AI su una scheda itinerario"
echo ""
echo "  Meteo e ricerca località LIVE (Open-Meteo, gratuito)."
echo "  Briefing AI e meteo Google in fallback finché non ci sono le chiavi."
echo "  Per fermare tutto: Ctrl+C qui, o chiudi la finestra."
echo "═══════════════════════════════════════════"
wait
