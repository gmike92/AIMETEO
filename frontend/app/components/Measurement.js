"use client";
// Isola client per una grandezza fisica dentro un componente server: il
// valore arriva SEMPRE in unità metriche da qui (il backend/i dati non
// cambiano), la conversione a imperiale avviene solo in questo componente,
// solo per la visualizzazione. Stesso ragionamento di T.js sul perché non
// serve nessun trucco anti-idratazione.
import { useUnits } from "@/lib/units";

/** <Measurement kind="elevation" value={route.max_altitude_m} /> */
export default function Measurement({ kind, value }) {
  const units = useUnits();
  const fmt = units[kind];
  if (!fmt) throw new Error(`Measurement: kind sconosciuto "${kind}"`);
  const out = fmt(value);
  return out ?? "—";
}
