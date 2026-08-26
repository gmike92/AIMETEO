"use client";
// Meteogram con asse in METRI — opzione 1f.
//
// Il meteogram precedente aveva due assi Y (temperatura a sinistra, quota a
// destra) e quindi due unità che si contendevano lo stesso spazio. Questa
// versione ne tiene una sola — i metri — e ci sovrappone la fascia di quota
// dell'itinerario, perché la domanda operativa non è «quanti gradi», è «a che
// quota passa il limite pioggia/neve rispetto a dove salgo».
//
// Sopra la linea nevica, sotto piove: quando la linea entra nella fascia
// dell'itinerario, la gita cambia natura a metà percorso.
//
// Stessa chiamata Open-Meteo di prima e stesso fallback offline.

import { useEffect, useState } from "react";
import { fmtNum } from "@/lib/fmt";
import { useT } from "@/lib/i18n";
import { useUnits } from "@/lib/units";
import { useSettings } from "../../components/SettingsProvider";

const W = 720, H = 260, L = 54, R = 18, TOP = 18, B = 46;
const PLOT_H = H - TOP - B;
const HIST_H = 38; // banda dell'istogramma precipitazioni, sopra la linea di base

/** Passo "tondo" per le tacche dell'asse quota. */
function niceStep(span) {
  const raw = span / 4;
  for (const s of [50, 100, 200, 250, 500, 1000, 2000]) if (raw <= s) return s;
  return 2500;
}

export default function Meteogram({ lat, lon, name, startAltitude, maxAltitude }) {
  const t = useT();
  const units = useUnits();
  const { settings } = useSettings();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (lat == null || lon == null) return;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=temperature_2m,precipitation,wind_speed_10m,freezing_level_height` +
      `&forecast_days=7&timezone=Europe%2FRome`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setData(d.hourly))
      .catch(() => setErr(t("meteogram.offline")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lon]); // "t" cambia identità a ogni render (vedi useT): tenerlo
  // fuori dalle dep evita di rifare la fetch a ogni switch di lingua.

  if (lat == null || lon == null) return null;
  if (err) return <p className="note">{err}</p>;
  if (!data) return <p className="note">{t("meteogram.loading")}</p>;

  const n = data.time.length;
  const frz = data.freezing_level_height;
  const prec = data.precipitation;

  const start = Number.isFinite(Number(startAltitude)) ? Number(startAltitude) : null;
  const top = Number.isFinite(Number(maxAltitude)) ? Number(maxAltitude) : null;
  const hasBand = start != null && top != null && top > start;

  // La scala contiene SEMPRE partenza e vetta dell'itinerario, così il
  // confronto è visivo e non aritmetico.
  const candLo = [Math.min(...frz), ...(start != null ? [start] : [])];
  const candHi = [Math.max(...frz), ...(top != null ? [top] : [])];
  const rawLo = Math.min(...candLo);
  const rawHi = Math.max(...candHi);
  const pad = Math.max(200, (rawHi - rawLo) * 0.12);
  const step = niceStep(rawHi - rawLo + pad * 2);
  const vLo = Math.max(0, Math.floor((rawLo - pad) / step) * step);
  const vHi = Math.ceil((rawHi + pad) / step) * step;
  const span = Math.max(1, vHi - vLo);

  const x = (i) => L + (i / (n - 1)) * (W - L - R);
  const y = (m) => TOP + PLOT_H - ((m - vLo) / span) * PLOT_H;
  const base = TOP + PLOT_H;

  const pMax = Math.max(...prec, 1);
  const yP = (p) => (p / pMax) * HIST_H;

  const frzPts = frz.map((f, i) => `${x(i).toFixed(1)},${y(f).toFixed(1)}`).join(" ");

  const ticks = [];
  for (let m = vLo; m <= vHi + 0.5; m += step) ticks.push(m);

  const days = [];
  for (let i = 0; i < n; i += 24) {
    days.push({
      i,
      label: new Date(data.time[i]).toLocaleDateString(settings.lang === "en" ? "en-US" : "it-IT",
        { weekday: "short" }),
    });
  }

  // Un aria-label che dice davvero l'intervallo, a parole.
  const aria =
    `${t("meteogram.title")} ${name}: ` +
    `${units.elevation(Math.min(...frz))} – ${units.elevation(Math.max(...frz))}` +
    (hasBand
      ? `. ${t("meteogram.start")} ${units.elevation(start)} · ${t("meteogram.summit")} ${units.elevation(top)}.`
      : ".");

  return (
    <div className="panel mg">
      <div className="mg-head">
        <strong>{t("meteogram.title")} {name}</strong>
        <span className="note">{t("meteogram.source")}</span>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="mg-svg" role="img" aria-label={aria}>
        {/* tacche di quota */}
        {ticks.map((m) => (
          <g key={m}>
            <line x1={L} y1={y(m)} x2={W - R} y2={y(m)} stroke="var(--line)" />
            <text x={L - 8} y={y(m) + 3.5} textAnchor="end" fontSize="10.5"
              fill="var(--faint)" className="tnum">
              {units.elevationValue(m)}
            </text>
          </g>
        ))}

        {/* fascia di quota dell'itinerario */}
        {hasBand && (
          <g>
            <rect x={L} y={y(top)} width={W - L - R} height={Math.max(1, y(start) - y(top))}
              fill="rgba(148,180,208,.09)" />
            <line x1={L} y1={y(start)} x2={W - R} y2={y(start)}
              stroke="var(--muted)" strokeWidth="1.3" strokeDasharray="5 4" />
            <line x1={L} y1={y(top)} x2={W - R} y2={y(top)}
              stroke="var(--muted)" strokeWidth="1.3" strokeDasharray="5 4" />
            <text x={L + 7} y={y(start) - 6} fontSize="9.5" fontWeight="800"
              letterSpacing=".6" fill="var(--muted)" className="tnum">
              {`${t("meteogram.start")} ${units.elevation(start)}`}
            </text>
            <text x={L + 7} y={y(top) + 13} fontSize="9.5" fontWeight="800"
              letterSpacing=".6" fill="var(--muted)" className="tnum">
              {`${t("meteogram.summit")} ${units.elevation(top)}`}
            </text>
          </g>
        )}

        {/* separatori di giorno */}
        {days.map((d) => (
          <g key={d.i}>
            <line x1={x(d.i)} y1={TOP} x2={x(d.i)} y2={base} stroke="var(--line)" />
            <text x={x(d.i) + 4} y={H - 10} fontSize="10.5" fill="var(--faint)">{d.label}</text>
          </g>
        ))}

        {/* precipitazioni: istogramma sulla linea di base, non un secondo asse */}
        {prec.map((p, i) =>
          p > 0.05 ? (
            <rect key={i} x={x(i) - 1.1} y={base - yP(p)} width="2.2" height={yP(p)}
              fill="var(--accent2)" opacity=".85" />
          ) : null
        )}

        {/* quota dello zero termico */}
        <polygon points={`${L},${base} ${frzPts} ${W - R},${base}`}
          fill="var(--accent)" opacity=".14" />
        <polyline points={frzPts} fill="none" stroke="var(--accent)" strokeWidth="2.2"
          strokeLinejoin="round" strokeLinecap="round" />

        <line x1={L} y1={base} x2={W - R} y2={base} stroke="var(--line-strong)" />
      </svg>

      <div className="mg-legend">
        <span><i style={{ background: "var(--accent)" }} />{t("meteogram.legend_freezing")}</span>
        <span><i style={{ background: "var(--accent2)" }} />{t("meteogram.legend_precip")}</span>
        {hasBand && <span><i className="dash" />{t("meteogram.legend_band")}</span>}
      </div>

      <p className="note">
        {t("meteogram.note")} ({Number(lat).toFixed(3)}, {Number(lon).toFixed(3)}){t("meteogram.note_end")}
      </p>
    </div>
  );
}
