// Preferenze utente — persistite in localStorage, mai sul backend: sono
// scelte del browser (unità, lingua, tema, densità), non dati di dominio.
//
// Il default deve combaciare ESATTAMENTE con quello che il server ha già
// renderizzato (metrico, italiano, scuro, griglia): SettingsProvider aggiorna
// lo stato SOLO dopo il mount (leggendo localStorage), mai durante il primo
// render lato client — altrimenti il primo render client differirebbe da
// quello server e React segnalerebbe un hydration mismatch. Un utente di
// ritorno con preferenze diverse dal default vede quindi un lampo brevissimo
// (sotto i 16ms) del default prima dello swap; il tema scuro/chiaro fa
// eccezione perché viene applicato da uno script inline PRIMA dell'idratazione
// (vedi il tag <script> in app/layout.js), quindi non lampeggia mai.

export const STORAGE_KEY = "zt-settings-v1";

// Voci del rail "Attività" della mappa che l'utente può nascondere dalle
// Impostazioni (decluttering — non è lo stato acceso/spento sulla mappa,
// quello resta nel rail stesso; qui si decide solo quali pulsanti offrire).
// Solo le attività con dati reali: esporre un toggle per qualcosa che non fa
// mai nulla (0 itinerari) sarebbe fuorviante.
export const ACTIVITY_KEYS = ["rt", "fal", "mtb", "skifondo", "ski"];

// Voci del pannello "Meteo" della mappa — vedi il campo `fields` in
// MapView.js, stesso ordine. A differenza delle attività, tutti e otto sono
// sempre offerti nel pannello (non c'è un equivalente di visibleActivities):
// qui le Impostazioni decidono solo quali partono già accesi.
export const FIELD_KEYS = ["temp", "wind", "radar", "uv", "clouds", "sun", "aurora", "lightning"];

// Elementi con un colore personalizzabile sulla mappa — più fine delle 5
// voci del rail (ACTIVITY_KEYS sopra): "rt" lì è UN pulsante, ma qui le sue
// 4 attività (scialpinismo/alpinismo/via_ferrata/escursionismo) hanno un
// colore ciascuna, altrimenti resterebbero indistinguibili tra loro sulla
// mappa. "ski" (piste da discesa) resta FUORI apposta: quei colori sono la
// scala alpina standard (verde/blu/rosso/nero), una convenzione reale, non
// una scelta estetica nostra — l'utente non dovrebbe poterla rompere.
export const ACTIVITY_COLOR_KEYS = [
  "scialpinismo", "alpinismo", "via_ferrata", "escursionismo", "mtb_alpino", "falesie", "skifondo",
];

// Tavolozza offerta per ogni elemento — apposta un set CURATO (chip da
// scegliere), non un color picker libero: tutte scelte per restare leggibili
// col testo scuro fisso dei badge cluster (#04121f), come i colori già
// esistenti (pericolo valanghe, MTB, sci di fondo) — niente calcolo di
// contrasto in più da fare in JS.
export const COLOR_SWATCHES = [
  "#38bdf8", "#818cf8", "#c084fc", "#f472b6", "#fb7185",
  "#f59e0b", "#eab308", "#34d399", "#06b6d4", "#94a3b8",
];

export const DEFAULTS = Object.freeze({
  units: "metric", // metric | imperial
  theme: "dark", // dark | light | bosco | mare | system
  lang: "it", // it | en — SOLO l'interfaccia: nomi di itinerari/falesie e
  // testi generati dall'AI restano nella lingua originale (mai tradotti a
  // macchina senza dirlo all'utente).
  density: "grid", // grid | list — solo per gli elenchi (itinerari, falesie)
  visibleActivities: ACTIVITY_KEYS, // quali voci del rail Attività mostrare
  mapBase: "chiaro", // chiaro | terreno | scuro — sfondo della mappa; scelto
  // qui invece che con uno switch rapido sulla mappa, l'ultimo scelto resta
  // il default per la prossima apertura (nessuna distinzione "ora" / "di
  // default", a differenza di defaultFields/defaultActivities sotto).
  // Nessun campo/attività acceso finché l'utente non lo sceglie qui — la
  // mappa all'avvio parte "pulita", non con una scelta implicita nostra.
  defaultFields: [], // campi meteo già accesi all'avvio dell'app
  defaultActivities: [], // attività già accese all'avvio dell'app
  // chiave attività -> hex scelto dall'utente (una di COLOR_SWATCHES).
  // Assente/non impostata = colore predefinito dell'app per quell'attività
  // (vedi DEFAULT_ACTIVITY_COLORS in MapView.js) — mai un default già
  // scritto qui, altrimenti "torna al predefinito" non avrebbe più senso.
  activityColors: {},
});

const VALID = {
  units: new Set(["metric", "imperial"]),
  theme: new Set(["dark", "light", "bosco", "mare", "system"]),
  lang: new Set(["it", "en"]),
  density: new Set(["grid", "list"]),
  mapBase: new Set(["chiaro", "terreno", "scuro"]),
};

/** Legge le preferenze salvate, scartando in silenzio chiavi/valori ignoti
 * (un vecchio localStorage da una versione precedente non deve rompere
 * l'app) — mai lanciare, mai lasciare undefined: sempre un oggetto completo. */
export function readSettings() {
  if (typeof window === "undefined") return { ...DEFAULTS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    const out = { ...DEFAULTS };
    for (const key of Object.keys(VALID)) {
      if (VALID[key].has(parsed?.[key])) out[key] = parsed[key];
    }
    // Array, non uno scalare: VALID (Set di un solo valore) non si applica —
    // si tengono solo le chiavi ancora note, non l'intero campo in blocco.
    if (Array.isArray(parsed?.visibleActivities)) {
      const known = new Set(ACTIVITY_KEYS);
      out.visibleActivities = parsed.visibleActivities.filter((k) => known.has(k));
    }
    if (Array.isArray(parsed?.defaultFields)) {
      const known = new Set(FIELD_KEYS);
      out.defaultFields = parsed.defaultFields.filter((k) => known.has(k));
    }
    if (Array.isArray(parsed?.defaultActivities)) {
      const known = new Set(ACTIVITY_KEYS);
      out.defaultActivities = parsed.defaultActivities.filter((k) => known.has(k));
    }
    // Un'attività accesa di default ma nascosta dal rail (visibleActivities)
    // sarebbe attiva sulla mappa senza modo di spegnerla dal pannello —
    // "nascosta" vince sempre su "accesa di default".
    out.defaultActivities = out.defaultActivities.filter((k) => out.visibleActivities.includes(k));
    // Oggetto, non un array: si tengono solo le chiavi ancora note con un
    // valore ancora tra le tavolozze offerte — un vecchio swatch rimosso da
    // COLOR_SWATCHES non deve sopravvivere come colore "fantasma".
    if (parsed?.activityColors && typeof parsed.activityColors === "object") {
      const knownKeys = new Set(ACTIVITY_COLOR_KEYS);
      const knownColors = new Set(COLOR_SWATCHES);
      out.activityColors = Object.fromEntries(
        Object.entries(parsed.activityColors).filter(
          ([k, v]) => knownKeys.has(k) && knownColors.has(v)
        )
      );
    }
    return out;
  } catch {
    return { ...DEFAULTS };
  }
}

export function writeSettings(settings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // storage pieno o negato (modalità privata): la preferenza resta solo
    // in memoria per questa sessione — degrado silenzioso, non un crash.
  }
}

/** true se il sistema operativo del browser preferisce lo scuro. */
export function systemPrefersDark() {
  if (typeof window === "undefined" || !window.matchMedia) return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** theme "system" risolto nel valore effettivo da applicare al DOM. */
export function resolveTheme(theme) {
  return theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;
}
