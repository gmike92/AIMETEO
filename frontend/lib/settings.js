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

export const DEFAULTS = Object.freeze({
  units: "metric", // metric | imperial
  theme: "dark", // dark | light | system
  lang: "it", // it | en — SOLO l'interfaccia: nomi di itinerari/falesie e
  // testi generati dall'AI restano nella lingua originale (mai tradotti a
  // macchina senza dirlo all'utente).
  density: "grid", // grid | list — solo per gli elenchi (itinerari, falesie)
});

const VALID = {
  units: new Set(["metric", "imperial"]),
  theme: new Set(["dark", "light", "system"]),
  lang: new Set(["it", "en"]),
  density: new Set(["grid", "list"]),
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
    for (const key of Object.keys(DEFAULTS)) {
      if (VALID[key].has(parsed?.[key])) out[key] = parsed[key];
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
