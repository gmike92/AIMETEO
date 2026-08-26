"use client";
// Isola client minima per l'i18n dentro un componente server: SettingsProvider
// parte sempre da DEFAULTS (italiano) sia sul server sia al primo render
// client, quindi non serve nessun trucco anti-mismatch qui — solo dopo il
// mount (quando SettingsProvider legge localStorage) il testo può cambiare
// lingua, un normale aggiornamento React, non un errore di idratazione.
import { useT } from "@/lib/i18n";

/** <T k="itinerari.heading" />  — testo puro, si annida in qualunque tag. */
export default function T({ k, vars }) {
  const t = useT();
  return t(k, vars);
}
