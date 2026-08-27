// Traduzioni dell'interfaccia — SOLO il testo fisso che scriviamo noi (nav,
// bottoni, etichette, messaggi di stato, disclaimer). Non tocca mai:
// - nomi e descrizioni di itinerari/falesie (arrivano dal backend, in
//   italiano o nella lingua originale per l'estero — es. inglese per una
//   falesia in California, e tradurli a macchina senza dirlo sarebbe
//   inventare contenuto);
// - il testo generato dall'AI (relazioni di gita, briefing).
//
// Chiave piatta "sezione.nome" invece di oggetti annidati: più facile da
// grep-are quando si aggiunge una stringa nuova a un componente.
"use client";
import { useSettings } from "@/app/components/SettingsProvider";

const it = {
  "nav.mappa": "Mappa",
  "nav.cerca": "Cerca",
  "nav.itinerari": "Itinerari",
  "nav.falesie": "Falesie",
  "nav.pianifica": "Pianifica",
  "nav.impostazioni": "Impostazioni",

  "footer.credit": "Zerotermico · nome di lavoro · Bollettini: fonte ufficiale AINEVA / Meteomont",
  "footer.fonti": "Fonti e licenze",
  "footer.privacy": "Privacy",

  "common.loading": "Carico…",
  "common.error_prefix": "Errore",
  "common.backend_down": "Backend non raggiungibile",

  "home.disclaimer":
    "Supporto alla decisione, non una raccomandazione. Il bollettino valanghe ufficiale " +
    "(AINEVA) prevale sempre. Mappa © CARTO / OpenTopoMap / OpenStreetMap contributors · " +
    "radar © RainViewer · vento © Open-Meteo · pendenze: elaborazione propria da " +
    "Copernicus DEM © ESA (30 m, indicative: la risoluzione non vede canali e rocce — " +
    "la valutazione del terreno resta tua).",

  "itinerari.eyebrow": "Italia-first · per la montagna",
  "itinerari.h1_a": "Itinerari e",
  "itinerari.h1_em": "condizioni",
  "itinerari.sub":
    "Sfoglia gli itinerari, controlla le condizioni sul percorso e genera una relazione " +
    "di gita. Il bollettino valanghe ufficiale è sempre in evidenza.",
  "itinerari.heading": "Itinerari",
  "itinerari.empty": "Nessun itinerario per questo filtro.",
  "itinerari.view_grid": "Griglia",
  "itinerari.view_list": "Elenco",

  // Attività — condivise tra ActivityTabs, la card itinerario e il planner,
  // così esiste UNA sola traduzione per "scialpinismo" in tutta l'app.
  "act.all": "Tutti",
  "act.scialpinismo": "Scialpinismo",
  "act.alpinismo": "Alpinismo",
  "act.arrampicata": "Arrampicata",
  "act.via_ferrata": "Via ferrata",
  "act.escursionismo": "Escursionismo",
  "act.trail_running": "Trail running",
  "act.mtb_alpino": "MTB alpino",
  "act.volo_libero": "Volo libero",

  "conditions.title": "Condizioni adesso",
  "conditions.load_more": "Mostra altre righe",
  "conditions.sub_season": "Bollettino valanghe ufficiale per area e meteo al punto di partenza.",
  "conditions.sub_noseason": "Meteo al punto di partenza per area.",
  "conditions.col_route": "Itinerario",
  "conditions.col_diff": "Diff.",
  "conditions.col_profile": "Profilo",
  "conditions.col_danger": "Valanghe",
  "conditions.col_freezing": "0°C",
  "conditions.col_wind": "Vento",
  "conditions.col_time": "Tempo",
  "conditions.no_track": "no traccia",
  "conditions.unverifiable": "non verif.",
  "conditions.demo_note": "Meteo dimostrativo: nessuna chiave API configurata.",
  "conditions.prevails": "prevale sempre. Supporto alla decisione, non una raccomandazione.",
  "danger.1": "Debole",
  "danger.2": "Moderato",
  "danger.3": "Marcato",
  "danger.4": "Forte",
  "danger.5": "Molto forte",

  "rcard.verified": "verificato",
  "rcard.unverified": "da verificare",
  "rcard.go_map": "Traccia sulla mappa →",
  "rcard.go_route": "Scheda itinerario →",
  "rcard.no_track": "traccia GPX non ancora ingerita",
  "rcard.time": "Tempo",
  "rcard.gain": "Dislivello",
  "rcard.slope": "Pendio",
  "rcard.load_more": "Mostra altri itinerari",

  "falesie.eyebrow": "arrampicata",
  "falesie.h1_a": "Falesie:",
  "falesie.h1_em": "sole e ombra",
  "falesie.h1_b": "oggi.",
  "falesie.sub":
    "Calcolato dalla fisica — posizione del sole ed esposizione reale della parete, " +
    "al quarto d'ora. Orari in ora italiana.",
  "falesie.sun_now": "al sole adesso",
  "falesie.shade_now": "in ombra adesso",
  "falesie.sun_today": "Sole oggi:",
  "falesie.shade_today": "Oggi la parete resta in ombra.",
  "falesie.to_verify": "da verificare",
  "falesie.unknown_heading": "Esposizione da censire",
  "falesie.unknown_note":
    "Per queste manca l'esposizione della parete su OSM: senza, niente calcolo " +
    "(mai inventato). Un curatore può aggiungerla.",
  "falesie.unknown_aspect": "esposizione n.d.",
  "falesie.empty_heading": "Nessuna falesia ancora censita.",
  "falesie.country_all": "Tutti i paesi",
  "falesie.disclaimer":
    "Sole/ombra calcolati geometricamente (senza ombreggiamento del terreno " +
    "circostante, v1). Dati falesie © OpenStreetMap contributors (ODbL) e OpenBeta (CC0).",

  "planner.eyebrow": "Pro · pianificatore AI",
  "planner.h1_a": "Pianifica una",
  "planner.h1_em": "gita",
  "planner.sub":
    "Descrivi cosa vorresti fare. I filtri di sicurezza girano prima che l'AI scriva: " +
    "gli itinerari non sicuri non le vengono mai mostrati.",
  "planner.label_intent": "Cosa vorresti fare?",
  "planner.label_activity": "Attività",
  "planner.submit": "Pianifica",
  "planner.submitting": "Elaboro…",
  "planner.share": "Condividi col compagno di gita",
  "planner.shared": "Link copiato",
  "planner.share_note":
    "Chi apre il link vede il piano ricalcolato adesso, con bollettino e meteo " +
    "aggiornati — mai una copia vecchia.",
  "planner.placeholder": "L'esito del piano compare qui.",
  "planner.safety_alert": "Allerta sicurezza",
  "planner.official_source": "Fonte ufficiale →",
  "planner.decision_points": "Punti decisionali",
  "planner.gear": "Equipaggiamento",
  "planner.plan_b": "Piano B:",
  "planner.safe_col": "Sicuri",
  "planner.safe_empty": "Nessuno per questa richiesta.",
  "planner.blocked_col": "Esclusi dai filtri",
  "planner.blocked_empty": "Nessuno escluso.",
  "planner.blocked_note": "L'AI non vede mai questi itinerari, quindi non può proporli.",
  "planner.disclaimer":
    "Supporto alla decisione, non raccomandazione. Responsabilità finale al capogita; " +
    "il bollettino ufficiale AINEVA/Meteomont prevale sempre.",

  "route.back": "← Tutti gli itinerari",
  "route.see_on_map": "Vedi traccia sulla mappa →",
  "route.download_gpx": "Scarica GPX",
  "route.conditions_heading": "Condizioni sul percorso",
  "route.stat_time": "Tempo (no soste)",
  "route.stat_distance": "Distanza",
  "route.stat_diff": "Difficoltà",
  "route.stat_start": "Partenza",
  "route.stat_max": "Quota max",
  "route.stat_gain": "Dislivello",
  "route.stat_aspects": "Esposizioni",
  "route.stat_slope": "Pendio max",
  "route.freezing": "Zero termico",
  "route.wind": "Vento",
  "route.gust": "Raffiche",
  "route.storm": "Temporali",
  "route.freezing_note_a": "Zero termico ≈",
  "route.freezing_note_b": "limite pioggia/neve",
  "route.freezing_note_c": ": sopra quella quota le precipitazioni cadono come neve. · Fonte:",
  "route.demo_data": "(dati dimostrativi)",
  "bestwindow.eyebrow": "finestra migliore della settimana",
  "bestwindow.dry": "asciutto",
  "bestwindow.note_a": "Punteggio 0–100 a quota",
  "bestwindow.note_b": ": precipitazioni, vento, nuvole, freddo e zero termico. Fonte:",

  "localita.eyebrow": "cerca",
  "localita.h1_a": "La tua",
  "localita.h1_em": "località",
  "localita.sub":
    "Cerca un paese di montagna: ti diciamo com'è la settimana e cosa c'è da fare " +
    "nei dintorni — sentieri con traccia reale e falesie.",
  "localita.search": "Cerca",
  "localita.searching": "Cerco…",
  "localita.no_results": "Nessuna località trovata per «{q}».",
  "localita.week": "la settimana",
  "localita.dry": "asciutto",
  "localita.nearby": "Nei dintorni",
  "localita.nearby_loading": "Cerco itinerari e falesie…",
  "localita.nearby_empty":
    "Niente nel nostro database entro 25 km — per ora. Le aree crescono con la " +
    "curatela: se conosci i sentieri di zona, scrivici.",
  "localita.grade": "diff.",
  "localita.wall": "parete",
  "localita.disclaimer": "Distanze in linea d'aria dal centro della località. Geocoding: Open-Meteo.",
  "localita.not_available": "Dati non disponibili per questa località.",
  "localita.score_note": "Punteggio 0–100 (pioggia, vento, nuvole, freddo). Fonte:",

  "autori.eyebrow": "curatore",
  "autori.verified_badge": "curatore verificato",
  "autori.gain": "disl.",
  "autori.max": "max",
  "autori.empty": "Collezione in preparazione.",
  "autori.disclaimer":
    "Le collezioni sono proposte firmate dal curatore. La verifica dei singoli " +
    "itinerari è un processo separato e sempre dichiarato; i filtri di sicurezza " +
    "valgono per tutti, curatori inclusi.",
  "route.no_forecast": "Previsioni non disponibili al momento.",
  "route.report_a": "Conosci questo sentiero?",
  "route.report_b": "Segnala un errore o le condizioni che hai trovato",
  "route.report_c": "— ogni segnalazione verificata migliora il database per tutti.",
  "route.disclaimer":
    "Le relazioni sono un supporto alla decisione, non una raccomandazione. La " +
    "responsabilità finale è del capogita; il bollettino ufficiale prevale sempre.",

  "meteogram.title": "Zero termico sul percorso —",
  "meteogram.source": "Open-Meteo · 7 giorni",
  "meteogram.legend_freezing": "quota zero termico",
  "meteogram.legend_precip": "precipitazioni (mm/h)",
  "meteogram.legend_band": "fascia dell'itinerario",
  "meteogram.start": "PARTENZA",
  "meteogram.summit": "VETTA",
  "meteogram.note":
    "Sopra la linea nevica, sotto piove. Modello Open-Meteo al punto di partenza",
  "meteogram.note_end":
    ": dati indicativi, per la decisione finale contano bollettino e osservazione sul posto.",
  "meteogram.loading": "Carico il meteogramma…",
  "meteogram.offline": "Meteogramma non disponibile (offline o servizio non raggiungibile).",

  "map.rail_label": "Livelli della mappa",
  "map.field_temp": "Temp",
  "map.field_wind": "Vento",
  "map.field_rain": "Pioggia",
  "map.field_uv": "UV",
  "map.field_clouds": "Nuvole",
  "map.field_sun": "Sole",
  "map.field_aurora": "Aurora",
  "map.field_lightning": "Fulmini",
  "map.layer_routes": "Itin.",
  "map.layer_crags": "Falesie",
  "map.layer_slope": "Pendenze",
  "map.layer_ski": "Piste",
  "map.base_chiaro": "Chiaro",
  "map.base_terreno": "Terreno",
  "map.base_scuro": "Scuro",
  "map.legend_scale": "Scala",
  "map.legend_avalanche": "Valanghe · EAWS",
  "map.radar_play": "Avvia animazione radar",
  "map.radar_pause": "Pausa animazione radar",
  "map.radar_timeline": "Timeline radar",
  "map.legend_low": "bassa",
  "map.legend_high": "alta",

  "settings.title": "Impostazioni",
  "settings.sub": "Preferenze del browser: restano su questo dispositivo, non sul tuo account.",
  "settings.units": "Unità di misura",
  "settings.units_metric": "Metriche (m, km/h, °C)",
  "settings.units_imperial": "Imperiali (ft, mph, °F)",
  "settings.theme": "Tema",
  "settings.theme_dark": "Scuro",
  "settings.theme_light": "Chiaro",
  "settings.theme_bosco": "Bosco",
  "settings.theme_mare": "Mare",
  "settings.theme_system": "Segui il sistema",
  "settings.lang": "Lingua dell'interfaccia",
  "settings.lang_note":
    "Traduce solo i testi dell'app. Nomi di itinerari e falesie restano nella lingua " +
    "originale.",
  "settings.density": "Visualizzazione elenchi",
  "settings.density_grid": "Griglia",
  "settings.density_list": "Elenco",
  "settings.map_layers": "Attività visualizzabili sulla mappa",
  "settings.map_layers_note":
    "Quali pulsanti mostrare nel pannello Attività della mappa — non accende o " +
    "spegne nulla da qui, decide solo cosa offrire.",
  "layer.rt": "Itinerari",
  "layer.fal": "Falesie",
  "layer.mtb": "MTB",
  "layer.skifondo": "Sci di fondo",
  "layer.ski": "Piste",
  "settings.reset": "Ripristina i valori predefiniti",
};

const en = {
  "nav.mappa": "Map",
  "nav.cerca": "Search",
  "nav.itinerari": "Routes",
  "nav.falesie": "Crags",
  "nav.pianifica": "Plan",
  "nav.impostazioni": "Settings",

  "footer.credit": "Zerotermico · working name · Bulletins: official source AINEVA / Meteomont",
  "footer.fonti": "Sources and licenses",
  "footer.privacy": "Privacy",

  "common.loading": "Loading…",
  "common.error_prefix": "Error",
  "common.backend_down": "Backend unreachable",

  "home.disclaimer":
    "Decision support, not a recommendation. The official avalanche bulletin (AINEVA) " +
    "always prevails. Map © CARTO / OpenTopoMap / OpenStreetMap contributors · radar © " +
    "RainViewer · wind © Open-Meteo · slope: our own processing of Copernicus DEM © ESA " +
    "(30 m, indicative: the resolution can't see gullies and rock bands — terrain " +
    "assessment is still yours).",

  "itinerari.eyebrow": "Italy-first · for the mountains",
  "itinerari.h1_a": "Routes and",
  "itinerari.h1_em": "conditions",
  "itinerari.sub":
    "Browse routes, check conditions along the way and generate a trip report. The " +
    "official avalanche bulletin is always front and center.",
  "itinerari.heading": "Routes",
  "itinerari.empty": "No routes for this filter.",
  "itinerari.view_grid": "Grid",
  "itinerari.view_list": "List",

  "act.all": "All",
  "act.scialpinismo": "Ski touring",
  "act.alpinismo": "Alpinism",
  "act.arrampicata": "Climbing",
  "act.via_ferrata": "Via ferrata",
  "act.escursionismo": "Hiking",
  "act.trail_running": "Trail running",
  "act.mtb_alpino": "Alpine MTB",
  "act.volo_libero": "Paragliding",

  "conditions.title": "Conditions right now",
  "conditions.load_more": "Show more rows",
  "conditions.sub_season": "Official avalanche bulletin per area and forecast at the trailhead.",
  "conditions.sub_noseason": "Forecast at the trailhead per area.",
  "conditions.col_route": "Route",
  "conditions.col_diff": "Grade",
  "conditions.col_profile": "Profile",
  "conditions.col_danger": "Avalanche",
  "conditions.col_freezing": "0°C",
  "conditions.col_wind": "Wind",
  "conditions.col_time": "Time",
  "conditions.no_track": "no track",
  "conditions.unverifiable": "unverif.",
  "conditions.demo_note": "Demo weather: no API key configured.",
  "conditions.prevails": "always prevails. Decision support, not a recommendation.",
  "danger.1": "Low",
  "danger.2": "Moderate",
  "danger.3": "Considerable",
  "danger.4": "High",
  "danger.5": "Very high",

  "rcard.verified": "verified",
  "rcard.unverified": "unverified",
  "rcard.go_map": "Track on the map →",
  "rcard.go_route": "Route page →",
  "rcard.no_track": "GPX track not ingested yet",
  "rcard.time": "Time",
  "rcard.gain": "Elevation gain",
  "rcard.slope": "Slope",
  "rcard.load_more": "Show more routes",

  "falesie.eyebrow": "climbing",
  "falesie.h1_a": "Crags:",
  "falesie.h1_em": "sun and shade",
  "falesie.h1_b": "today.",
  "falesie.sub":
    "Computed from physics — sun position and the wall's real exposure, to the quarter " +
    "hour. Times shown in Italian time.",
  "falesie.sun_now": "in the sun now",
  "falesie.shade_now": "in the shade now",
  "falesie.sun_today": "Sun today:",
  "falesie.shade_today": "The wall stays in the shade today.",
  "falesie.to_verify": "unverified",
  "falesie.unknown_heading": "Exposure to be catalogued",
  "falesie.unknown_note":
    "These are missing the wall's exposure on OSM: without it, no calculation (never " +
    "invented). A curator can add it.",
  "falesie.unknown_aspect": "exposure n/a",
  "falesie.empty_heading": "No crags catalogued yet.",
  "falesie.country_all": "All countries",
  "falesie.disclaimer":
    "Sun/shade computed geometrically (no surrounding-terrain shading yet, v1). Crag " +
    "data © OpenStreetMap contributors (ODbL) and OpenBeta (CC0).",

  "planner.eyebrow": "Pro · AI trip planner",
  "planner.h1_a": "Plan a",
  "planner.h1_em": "trip",
  "planner.sub":
    "Describe what you'd like to do. Safety filters run before the AI writes anything: " +
    "unsafe routes are never shown to it.",
  "planner.label_intent": "What would you like to do?",
  "planner.label_activity": "Activity",
  "planner.submit": "Plan it",
  "planner.submitting": "Working…",
  "planner.share": "Share with your partner",
  "planner.shared": "Link copied",
  "planner.share_note":
    "Whoever opens the link sees the plan recalculated right now, with the latest " +
    "bulletin and forecast — never a stale copy.",
  "planner.placeholder": "The plan's outcome shows up here.",
  "planner.safety_alert": "Safety alert",
  "planner.official_source": "Official source →",
  "planner.decision_points": "Decision points",
  "planner.gear": "Gear",
  "planner.plan_b": "Plan B:",
  "planner.safe_col": "Safe",
  "planner.safe_empty": "None for this request.",
  "planner.blocked_col": "Excluded by filters",
  "planner.blocked_empty": "None excluded.",
  "planner.blocked_note": "The AI never sees these routes, so it can't suggest them.",
  "planner.disclaimer":
    "Decision support, not a recommendation. Final responsibility rests with the trip " +
    "leader; the official AINEVA/Meteomont bulletin always prevails.",

  "route.back": "← All routes",
  "route.see_on_map": "See track on the map →",
  "route.download_gpx": "Download GPX",
  "route.conditions_heading": "Conditions along the route",
  "route.stat_time": "Time (no breaks)",
  "route.stat_distance": "Distance",
  "route.stat_diff": "Grade",
  "route.stat_start": "Trailhead",
  "route.stat_max": "Max altitude",
  "route.stat_gain": "Elevation gain",
  "route.stat_aspects": "Aspects",
  "route.stat_slope": "Max slope",
  "route.freezing": "Freezing level",
  "route.wind": "Wind",
  "route.gust": "Gusts",
  "route.storm": "Thunderstorms",
  "route.freezing_note_a": "The freezing level ≈",
  "route.freezing_note_b": "rain/snow limit",
  "route.freezing_note_c": ": above that altitude precipitation falls as snow. · Source:",
  "route.demo_data": "(demo data)",
  "bestwindow.eyebrow": "best window of the week",
  "bestwindow.dry": "dry",
  "bestwindow.note_a": "Score 0–100 at",
  "bestwindow.note_b": ": precipitation, wind, clouds, cold and freezing level. Source:",

  "localita.eyebrow": "search",
  "localita.h1_a": "Your",
  "localita.h1_em": "place",
  "localita.sub":
    "Search a mountain town: we'll tell you how the week looks and what there is " +
    "to do nearby — real-track trails and crags.",
  "localita.search": "Search",
  "localita.searching": "Searching…",
  "localita.no_results": "No place found for «{q}».",
  "localita.week": "the week",
  "localita.dry": "dry",
  "localita.nearby": "Nearby",
  "localita.nearby_loading": "Looking for routes and crags…",
  "localita.nearby_empty":
    "Nothing in our database within 25 km — for now. Coverage grows with " +
    "curation: if you know the local trails, write to us.",
  "localita.grade": "grade",
  "localita.wall": "wall",
  "localita.disclaimer": "Straight-line distances from the place's center. Geocoding: Open-Meteo.",
  "localita.not_available": "No data available for this place.",
  "localita.score_note": "Score 0–100 (rain, wind, clouds, cold). Source:",

  "autori.eyebrow": "curator",
  "autori.verified_badge": "verified curator",
  "autori.gain": "gain",
  "autori.max": "max",
  "autori.empty": "Collection in the works.",
  "autori.disclaimer":
    "Collections are the curator's own signed picks. Verifying individual routes " +
    "is a separate, always-disclosed process; safety filters apply to everyone, " +
    "curators included.",
  "route.no_forecast": "Forecast not available right now.",
  "route.report_a": "Know this trail?",
  "route.report_b": "Report an error or the conditions you found",
  "route.report_c": "— every verified report improves the database for everyone.",
  "route.disclaimer":
    "Trip reports are decision support, not a recommendation. Final responsibility " +
    "rests with the trip leader; the official bulletin always prevails.",

  "meteogram.title": "Freezing level along the route —",
  "meteogram.source": "Open-Meteo · 7 days",
  "meteogram.legend_freezing": "freezing level",
  "meteogram.legend_precip": "precipitation (mm/h)",
  "meteogram.legend_band": "route's elevation band",
  "meteogram.start": "TRAILHEAD",
  "meteogram.summit": "SUMMIT",
  "meteogram.note":
    "Above the line it snows, below it rains. Open-Meteo model at the trailhead",
  "meteogram.note_end":
    ": indicative data — the bulletin and on-site observation are what count for the final call.",
  "meteogram.loading": "Loading the chart…",
  "meteogram.offline": "Chart not available (offline or the service is unreachable).",

  "map.rail_label": "Map layers",
  "map.field_temp": "Temp",
  "map.field_wind": "Wind",
  "map.field_rain": "Rain",
  "map.field_uv": "UV",
  "map.field_clouds": "Clouds",
  "map.field_sun": "Sun",
  "map.field_aurora": "Aurora",
  "map.field_lightning": "Lightning",
  "map.layer_routes": "Routes",
  "map.layer_crags": "Crags",
  "map.layer_slope": "Slope",
  "map.layer_ski": "Pistes",
  "map.base_chiaro": "Light",
  "map.base_terreno": "Terrain",
  "map.base_scuro": "Dark",
  "map.legend_scale": "Scale",
  "map.legend_avalanche": "Avalanche · EAWS",
  "map.radar_play": "Start radar animation",
  "map.radar_pause": "Pause radar animation",
  "map.radar_timeline": "Radar timeline",
  "map.legend_low": "low",
  "map.legend_high": "high",

  "settings.title": "Settings",
  "settings.sub": "Browser preferences: they stay on this device, not on your account.",
  "settings.units": "Units",
  "settings.units_metric": "Metric (m, km/h, °C)",
  "settings.units_imperial": "Imperial (ft, mph, °F)",
  "settings.theme": "Theme",
  "settings.theme_dark": "Dark",
  "settings.theme_light": "Light",
  "settings.theme_bosco": "Forest",
  "settings.theme_mare": "Sea",
  "settings.theme_system": "Follow system",
  "settings.lang": "Interface language",
  "settings.lang_note":
    "Translates only the app's own text. Route and crag names stay in their original " +
    "language.",
  "settings.density": "List display",
  "settings.density_grid": "Grid",
  "settings.density_list": "List",
  "settings.map_layers": "Activities shown on the map",
  "settings.map_layers_note":
    "Which buttons to offer in the map's Activity panel — doesn't turn anything " +
    "on or off from here, just what's available.",
  "layer.rt": "Routes",
  "layer.fal": "Crags",
  "layer.mtb": "MTB",
  "layer.skifondo": "Cross-country skiing",
  "layer.ski": "Ski slopes",
  "settings.reset": "Reset to defaults",
};

const DICTS = { it, en };

/** key mancante in EN → cade sull'italiano (mai una stringa vuota); key
 * mancante ovunque → la key stessa, cosi' un refuso si vede subito invece
 * di sparire silenziosamente. */
export function translate(lang, key, vars) {
  const dict = DICTS[lang] || DICTS.it;
  let s = dict[key] ?? DICTS.it[key] ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.replaceAll(`{${k}}`, vars[k]);
  return s;
}

export function useT() {
  const { settings } = useSettings();
  return (key, vars) => translate(settings.lang, key, vars);
}
