"use client";
// Conversione e formattazione delle grandezze fisiche in base alla
// preferenza utente (metrico di default — combacia col rendering server,
// vedi lib/settings.js). La conversione avviene SOLO in fase di display:
// i calcoli (colore del campo termico, filtri di sicurezza, ecc.) restano
// sempre in unità metriche internamente, mai influenzati da questa scelta.
import { useSettings } from "@/app/components/SettingsProvider";
import { fmtNum, fmtM } from "@/lib/fmt";

const M_TO_FT = 3.280839895;
const KM_TO_MI = 0.6213711922;
const MS_TO_MPH = 2.236936292;

function fmtDec(n, decimals) {
  if (n == null || !Number.isFinite(Number(n))) return null;
  return Number(n).toFixed(decimals).replace(".", ",");
}

/** Quota/dislivello in metri → "2 350 m" o "7 710 ft". */
export function formatElevation(m, units) {
  if (m == null) return null;
  if (units === "imperial") return `${fmtNum(m * M_TO_FT)} ft`;
  return fmtM(m);
}

/** Come formatElevation ma senza suffisso — per assi di grafico dove
 * l'unità è già indicata una volta sola nei dintorni (es. Meteogram). */
export function formatElevationValue(m, units) {
  if (m == null) return null;
  return fmtNum(units === "imperial" ? m * M_TO_FT : m);
}

/** Distanza in km → "8,4 km" o "5,2 mi". */
export function formatDistance(km, units) {
  if (km == null) return null;
  if (units === "imperial") return `${fmtDec(km * KM_TO_MI, 1)} mi`;
  return `${fmtDec(km, 1)} km`;
}

/** Velocità in km/h → "24 km/h" o "15 mph". */
export function formatSpeed(kmh, units) {
  if (kmh == null) return null;
  if (units === "imperial") return `${fmtNum(kmh * 0.62137119)} mph`;
  return `${fmtNum(kmh)} km/h`;
}

/** Temperatura in °C → "14°" (metrico, come oggi) o "57°F" (imperiale: la
 * lettera resta per non far leggere 57° come se fossero gradi Celsius). */
export function formatTemp(c, units) {
  if (c == null) return null;
  if (units === "imperial") return `${Math.round((c * 9) / 5 + 32)}°F`;
  return `${Math.round(c)}°`;
}

export function useUnits() {
  const { settings } = useSettings();
  const u = settings.units;
  return {
    units: u,
    elevation: (m) => formatElevation(m, u),
    elevationValue: (m) => formatElevationValue(m, u),
    distance: (km) => formatDistance(km, u),
    speed: (kmh) => formatSpeed(kmh, u),
    temp: (c) => formatTemp(c, u),
  };
}
