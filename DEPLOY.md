# DEPLOY — beta chiusa (checklist per il weekend)

Obiettivo: app online per i tester di Vezza d'Oglio. Backend su Cloud Run,
frontend su Vercel (gratis, il più semplice per Next.js). Tempo stimato: 2-4 ore.

## 0. Prerequisiti (10 min)
- [ ] Account Google Cloud (console.cloud.google.com) — nuovo progetto `aimeteo-beta`
- [ ] `gcloud` CLI installata sul Mac: `brew install google-cloud-sdk`, poi `gcloud auth login`
- [ ] Account Vercel (vercel.com, login con GitHub) — gratuito

## 1. Backend su Cloud Run (~45 min)
```bash
cd backend
gcloud config set project aimeteo-beta
gcloud run deploy aimeteo-backend \
  --source . \
  --region europe-west1 \
  --allow-unauthenticated \
  --set-env-vars "APP_ENV=prod,USE_MOCK_DATA=false,CORS_ORIGINS=https://TUODOMINIO"
```
- Il Dockerfile c'è già. Primo deploy: gcloud chiede di abilitare le API — dì sì.
- Annota l'URL che stampa (es. `https://aimeteo-backend-xxxx.a.run.app`).
- [ ] Smoke test: apri `URL/healthz` → deve dire `"mock_data": false`
- [ ] DATABASE_URL: per la beta si può partire SENZA Postgres (store in-memory
      con i 68 itinerari dal seed). Cloud SQL si aggiunge dopo.
- Env opzionali quando servono: `MAPS_WEATHER_API_KEY` (meteo Google),
  `VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY` (push, genera con scripts/gen_vapid.py),
  `SCHEDULER_TOKEN`.

## 2. Frontend su Vercel (~30 min)
- [ ] vercel.com → Add New Project → importa `gmike92/AIMETEO`
- [ ] Root Directory: `frontend`
- [ ] Environment variable: `NEXT_PUBLIC_API_BASE` = URL del backend (punto 1)
- [ ] Deploy. URL tipo `aimeteo.vercel.app`.
- [ ] Torna su Cloud Run e aggiorna CORS: `CORS_ORIGINS=https://aimeteo.vercel.app`
      (o il dominio custom del punto 3)

## 3. Dominio (~20 min, opzionale ma consigliato)
- [ ] Comprare il dominio (es. zerotermico.it — decisione brand!) su Cloudflare
      o Aruba (~10 €/anno)
- [ ] Su Vercel: Settings → Domains → aggiungi il dominio, segui le istruzioni DNS
- [ ] Aggiorna CORS_ORIGINS sul backend col dominio definitivo

## 4. Licenze e quote (15 min — IMPORTANTE)
- [ ] Open-Meteo free tier = NON commerciale: ok per beta gratuita senza ricavi.
      Al lancio a pagamento serve il piano API commerciale (già in checklist legale).
- [ ] Rate: Cloud Run scala a zero → costo ~0 con pochi tester. Metti un
      budget alert a 10 € su GCP (Billing → Budgets) per dormire tranquillo.
- [ ] Tile mappa: CARTO free tier va bene per beta; monitorare uso.

## 5. Smoke test post-deploy (15 min)
- [ ] Home: mappa carica, layer temperatura visibile
- [ ] /localita: cerca "Vezza d'Oglio" → settimana + sentieri vicini REALI
- [ ] Una rotta di Vezza: finestra migliore + meteo per punto con fonte live
      (non "dati dimostrativi")
- [ ] /falesie: sole/ombra con orari
- [ ] /planner: piano generato (nota: senza credenziali GCP/Vertex il testo
      usa il fallback deterministico — va bene per la beta, oppure abilita
      Vertex AI nel progetto e dà i permessi al service account di Cloud Run)
- [ ] PWA: da Safari/Chrome telefono → "Aggiungi a schermata Home" → icona e
      offline funzionano
- [ ] Push: con chiavi VAPID impostate, "Avvisami" → notifica di prova via
      `POST /push/send-test`

## 6. Tester (subito dopo)
- [ ] Messaggio WhatsApp ai primi 5-10 di Vezza col link e 3 richieste precise:
      1) cerca il tuo paese, 2) apri un sentiero che conosci e dicci se la
      traccia è giusta (bottone segnala → per ora rispondono a te), 3) guarda
      il meteo di domani e dicci se ci ha azzeccato
- [ ] Ogni sentiero confermato da un tester locale → verified_at aggiornato
      (la curatela è il moat)

## Rollback
Cloud Run tiene le revisioni: `gcloud run services update-traffic
aimeteo-backend --to-revisions=REVISION=100`. Vercel: "Instant Rollback" dalla
dashboard. Niente panico possibile.
