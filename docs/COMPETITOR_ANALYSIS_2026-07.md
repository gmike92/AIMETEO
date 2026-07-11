# Analisi competitiva — AIMETEO/Zerotermico
> Ricerca multi-fonte, luglio 2026. Metodo: 5 filoni di ricerca paralleli (mass-market,
> specialisti montagna, sicurezza valanghe, motori meteo, panorama italiano), fatti
> verificati su 2 fonti dove possibile; i dati a fonte singola sono marcati.
> Fonti principali linkate inline; dettaglio completo nei log di ricerca.

## Executive summary

Il mercato ha tre poli — pianificatori mass-market (Komoot/AllTrails/Outdooractive),
specialisti sicurezza (White Risk/Skitourenguru), motori meteo (Windy/meteoblue, oggi
**stesso gruppo**) — e **nessuno presidia il centro in Italia**: meteo interpretato per
quota/versante/itinerario + bollettini AINEVA + pianificazione con giudizio motivato.
Il timing è brutale: l'inverno 2025/26 ha registrato **37 morti in valanga in Italia,
record europeo** ([Sky/EAWS](https://tg24.sky.it/cronaca/2026/03/23/morti-valanghe-italia-dati),
[ANSA](https://www.ansa.it/sito/notizie/cronaca/2026/04/07/raddoppiati-i-morti-per-valanghe-sulle-alpi-maglia-nera-per-litalia_288eeaa8-a43e-45c8-a28f-a46a25124634.html)),
lo scialpinismo è la disciplina che cresce di più (~190k praticanti stimati 25/26, +15%
— [stima singola fonte](https://www.sciaremag.it/notiziesci/le-discipline-invernali-piu-amate-dagli-italiani/)),
e il 92% dei soccorsi riguarda non-soci CAI, cioè gente fuori dai canali formativi
([Lo Scarpone](https://www.loscarpone.cai.it/dettaglio/soccorso-alpino-oltre-12mila-missioni-nel-2024-solo-l%E2%80%998-riguarda-soci-cai/)).

## I concorrenti in breve

### Mass-market
| | Komoot | AllTrails | Outdooractive |
|---|---|---|---|
| Utenti | 40M+ (2024 uff.) | 80M+ (dich. 2025) | claim incoerenti (7-10M+) |
| Prezzo | €59,99/anno | $36 Plus / $80 Peak | €29,99 Pro / €59,99 Pro+ |
| Valanghe | **niente** | **niente** | **ATHM + bollettini + neve (Pro+)** |
| AI | niente di rilievo | Custom Routes AI (Peak) | solo B2B |
| Italia | buona estate, zero inverno | crowd-sourced, non curata | **la più forte** (Sentres, CAI-adjacent) |
| Debolezza chiave | crollo fiducia post-Bending Spoons: 85% staff licenziato, fondatori usciti ([BikeRadar](https://www.bikeradar.com/news/komoot-redesign-2025), [road.cc](https://road.cc/content/news/job-cuts-expected-komoot-after-tech-firm-purchase-313159)) | dati crowd inaccurati, routing a volte pericoloso ([critica documentata](https://www.adamthompsonphoto.com/blog/the-problem-with-alltrails)) | UX "over-engineered", Trustpilot ~2★, migrazione ViewRanger gestita male |

**Nota strategica**: Bending Spoons (Milano) ha dichiarato espansione Komoot in Italia.
Ma la community è in rivolta ("enshittification") — la fiducia orfana è un'opportunità.

### Specialisti montagna
- **Whympr** (FR, ~300k utenti dichiarati, €24,99/anno): aggrega Camptocamp/Skitour e
  **Gulliver per l'Italia** (partnership), meteo meteoblue, bollettini valanghe (incl.
  Italia) gratis, 3D LiDAR, AR. Debolezze: contenuto disomogeneo (dipende dalla fonte),
  bug tracking, no Garmin. Ha alzato solo €500k totali → sopravvive aggregando.
  ([prezzi](https://get.whympr.com/en/prix), [dati](https://get.whympr.com/en/blog-articles/whympr-what-makes-us-different-from-other-mountain-apps))
- **FATMAP** († ott 2024): il monito. ~$30M bruciati in mappe 3D proprietarie, venduta a
  Strava (gen 2023), spenta 20 mesi dopo; nella migrazione persi gradi, waypoint,
  guidebook, offline. Gli orfani hanno premiato micro-team credibili (OUTMAP), non i
  giganti. Lezione: **costi fissi minimi, dati aggregati/licenziati, indipendenza come
  promessa di prodotto**. ([TechCrunch](https://techcrunch.com/2024/06/26/strava-to-shutter-3d-mapping-platform-fatmap-18-months-after-acquisition/))

### Sicurezza valanghe (i più vicini alla nostra anima)
- **White Risk** (SLF, 100k+ utenti, 29 CHF/anno, "Master of Swiss Apps 2025"): disegno
  tour su mappe terreno valanghivo CAT/ATH con punti chiave automatici. **L'Italia è
  esclusa dai layer chiave** (CAT/ATH solo CH/AT/FR). ([SLF](https://www.slf.ch/en/news/20-years-of-white-risk-avalanche-app-wins-award/))
- **Skitourenguru** (CH, gratuito, ~10k itinerari valutati 2×/giorno): semaforo per
  tratto con metodo **QRM/SLABS peer-reviewed** (Cold Regions Sci. Tech. 2024), validato
  da studio DAV/UPI. **Ha già integrato 7 bollettini AINEVA e i DEM regionali italiani,
  ma il dataset di itinerari italiani è dichiaratamente incompleto: cercano personale,
  orizzonte 2030.** ([copertura Est-Alpi](https://info.skitourenguru.ch/index.php/ostalpen),
  [routes repo](https://github.com/skitourenguru/Routes), [SLABS paper](https://www.sciencedirect.com/science/article/pii/S0165232X24000508))
  → **La finestra "Skitourenguru per l'Italia" è aperta fino a ~2030. Opzione seria:
  collaborare (il nostro route DB curato è esattamente ciò che manca a loro) invece di
  reinventare una metodologia che senza validazione scientifica sarebbe un rischio
  reputazionale e legale.**

### Motori meteo
- **Windy** (~1,5M visitatori/giorno 2020): dal 2024 **possiede la maggioranza di
  meteoblue** ([startupticker](https://www.startupticker.ch/en/news/accurate-weather-forecast-provider-meteoblue-joins-windy-com)).
  Premium ~€23-30/anno (rincaro +24% nel 2025). API €990/anno (ECMWF escluso o +€1.000,
  vietato l'uso in prodotti meteo "senza valore aggiunto"). **Debolezza documentata in
  montagna: previsioni alla quota del grid, non a quella reale** (cima 2.194 m vista a
  1.105 m), nessuna nozione di versante. ([forum ufficiale](https://community.windy.com/topic/16438/forecasts-at-high-elevation-in-mountains-seem-inconsistent))
- **meteoblue**: downscaling alla quota reale, meteogramma SNOW, multimodel; point+
  50 CHF/anno; **API free solo non-commerciale ~5k chiamate/anno** (conferma il vincolo
  di licenza già in checklist). Ammette limiti su temporali/terreno complesso.
- **Pattern d'uso reale**: scialpinisti combinano a mano 3-5 strumenti (Mountain-Forecast
  + Windy + meteoblue + bollettino + Gulliver). La lamentela ricorrente è l'assenza di
  sintesi decisionale. **È il nostro prodotto.**

### Italia
- **Gulliver**: vivo e attivissimo (relazioni quotidiane), 16k+ itinerari solo in
  Piemonte, condition report comunitari di valore enorme — **ma web-only, senza app**,
  e già partner dati di Whympr. Candidato naturale a partnership.
- **Mountain Maps / "MIA"** (Trento, ~15k utenti noti 2023, €29,99 early-access):
  l'unico player AI italiano, ma posizionato sul **turista estivo** (mappe offline,
  parcheggi, rifugi) — non su meteo/neve/sicurezza. Non è (ancora) il nostro scontro.
- **Istituzionali**: app AINEVA e Meteomont = solo consultazione bollettino; GeoResQ =
  solo SOS; ARPA frammentate per regione. **Nessuno collega bollettino → itinerario →
  decisione.**
- Mercato: CAI 356.120 soci (record, [Bilancio 2024](https://www.cai.it/wp-content/uploads/2025/05/Bilancio-Sociale_CAI-2024-web.pdf)),
  ~13M frequentatori montagna (dich. presidente CAI, fonte singola), 4,3M praticanti neve.

## Tabella comparativa vs AIMETEO (oggi)

| Feature | Komoot | AllTrails | OA Pro+ | Whympr | WhiteRisk | Skitourenguru | Windy | **AIMETEO oggi** |
|---|---|---|---|---|---|---|---|---|
| Mappa meteo interattiva | – | – | ◐ | – | – | – | ● | ● |
| Meteo per quota reale/itinerario | – | – | ◐ | ◐ | – | – | – | ◐ (trailhead) |
| Bollettini AINEVA integrati | – | – | ● | ● | – | ● | – | ● (fail-closed) |
| Valutazione rischio per tratto | – | – | ◐ (ATHM) | – | ◐ (CAT) | ● (validata) | – | – (roadmap) |
| Itinerari curati Italia | ◐ | ◐ | ● | ◐ (via Gulliver) | – | ◐ (incompleti) | – | ◐ (20, 2 con GPX) |
| Relazione/piano AI motivato | – | ◐ (routes AI) | – | – | – | – | – | ● (unico) |
| Profilo altimetrico | ● | ● | ● | ● | ● | ● | – | ● |
| Offline / mobile nativo | ● | ● | ● | ● | ● | – (web) | ◐ | ◐ (PWA) |
| Condition report community | ◐ | ● | ◐ | ◐ | ◐ (segnalaz.) | – | – | – |
| Prezzo/anno | €60 | $36-80 | €30-60 | €25 | 29CHF | gratis | €23-30 | – |

## Gap di mercato (nessuno li copre bene in Italia)

1. **Sintesi decisionale**: da "50 layer e 3 bollettini" a "si può fare la Nord domattina
   entro le 11? No, e questo è il perché" — la lamentela n.1 dei forum.
2. **Meteo alla quota/versante reale lungo l'itinerario** (Windy dichiaratamente non lo fa).
3. **Semaforo per-tratto sull'Italia** (Skitourenguru arriva al 2030; White Risk esclude l'Italia).
4. **Bollettini AINEVA+Meteomont armonizzati dentro un flusso di pianificazione** (le app
   istituzionali si fermano alla consultazione).
5. **Condition report comunitari dentro un'app moderna** (Gulliver è web-only).

## Top 10 feature da costruire, in ordine

1. **Route DB italiano con GPX di qualità** (il collo di bottiglia di TUTTI, incluso
   Skitourenguru) — curatore + pipeline già pronta. È il moat: raddoppiare gli sforzi.
2. **Meteo interpretato per quota reale + versante + finestra oraria** lungo la traccia
   (abbiamo track_points con quote: nessun grande player lo fa).
3. **Semaforo per-tratto**: valutare collaborazione/integrazione con Skitourenguru
   (metodologia SLABS validata) invece di metodologia propria non validata — meno
   rischio legale, più credibilità, time-to-market immediato.
4. **Offline reale mobile** (PWA→cache tracce/bollettini/tiles; poi store) — table stakes,
   lezione Komoot/FATMAP.
5. **Go/no-go con incertezza multimodel** dentro la relazione AI (già il nostro
   differenziante: renderlo esplicito con orario limite e piano B).
6. **Condition report community** ("com'era oggi?") o partnership Gulliver prima che
   l'esclusiva di fatto la prenda Whympr.
7. **Layer pendenza >30°** sulla mappa (post-GCP, DEM).
8. **Alert "condizioni cambiate"** — già costruito: attivarlo con push al deploy.
9. **Meteogramma SNOW** (profilo neve/quota tipo meteoblue) sulle pagine rotta.
10. **Partnership istituzionali** (sezioni CAI, guide, rifugi) per dati e credibilità —
    la via Outdooractive/Sentres, difendibile più di qualsiasi feature.

## Rischi competitivi

- **Bending Spoons spinge Komoot in Italia** (dichiarato): budget marketing enorme, ma
  zero sicurezza invernale e fiducia compromessa — differenziarsi su fiducia+sicurezza.
- **Outdooractive Pro+** è già "quasi tutto" sulla carta: il rischio è che sistemino la
  UX. La nostra difesa: semplicità decisionale e Italia-first vera.
- **Whympr+Gulliver** può chiudere l'aggregazione dei dati italiani: muoversi presto su
  partnership locali.
- **Skitourenguru completa l'Italia** (~2030, o prima se trovano persone): meglio averli
  come alleati che come benchmark.
- **Liability**: qualsiasi punteggio di rischio proprio non validato è un'esposizione
  legale e reputazionale (il metodo QRM/SLABS ha richiesto 1.469 incidenti e peer review).
  Confermata la scelta fail-closed + solo bollettini ufficiali; il semaforo va fatto con
  metodologia pubblicata o con partner.
- **Licenze dati**: Camptocamp CC BY-SA, Open-Meteo non-commerciale, Windy API vietata a
  prodotti meteo — tutte già in checklist legale, confermate da questa ricerca.

## Lezione di fondo

FATMAP è morta di costi fissi; Komoot di estrazione di valore; Whympr sopravvive
aggregando ma paga in qualità. La strategia che ne esce per un team piccolissimo:
**costi quasi zero, dati curati non fabbricati, prezzo "da caffè" (€25-30/anno),
sicurezza come gancio, indipendenza dichiarata come feature.** Coincide con come
AIMETEO è già costruita.
