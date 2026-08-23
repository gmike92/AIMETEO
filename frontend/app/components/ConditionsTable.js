// Tabella condizioni — opzione 1d. Prende il posto di ConditionsBoard e
// fonde le due chiamate che prima si facevano separatamente: /conditions
// (bollettino ufficiale + meteo per area) e /routes (gli itinerari).
//
// Per chi confronta dieci gite prima del weekend, una griglia densa e
// ordinabile batte dieci card: le colonne si leggono in verticale.
//
// L'ordinamento passa dalla querystring (?sort=vento), non da uno stato
// client: così il componente resta un server component e l'ISR a 5 minuti
// continua a valere. Nessun "use client", nessun useState.
//
// Header e righe condividono una sola subgrid, quindi le colonne non
// possono scollarsi tra loro.

import { Icon } from "./WxIcon";
import { DANGER_COLORS, DANGER_LABELS, dangerInk } from "@/lib/wx";
import { fmtNum, fmtMin } from "@/lib/fmt";

const COLS = [
  { key: "nome", label: "Itinerario" },
  { key: "diff", label: "Diff." },
  { key: "prof", label: "Profilo", cls: "c-prof", sortable: false },
  { key: "valanghe", label: "Valanghe" },
  { key: "zero", label: "0°C", cls: "c-frz" },
  { key: "vento", label: "Vento" },
  { key: "tempo", label: "Tempo", cls: "c-end" },
];

/** Chiave di ordinamento per riga; null/undefined vanno sempre in fondo. */
function sortValue(row, key) {
  switch (key) {
    case "diff": return (row.route.diff_grade || "").toUpperCase() || null;
    case "valanghe":
      return row.area?.bulletin?.status === "in_vigore"
        ? row.area.bulletin.danger_level
        : null;
    case "zero": return row.area?.forecast?.freezing_level_m ?? null;
    case "vento": return row.area?.forecast?.wind_avg_kmh ?? null;
    case "tempo": return row.route.tempi?.totale_min ?? row.route.tempi?.salita_min ?? null;
    default: return row.route.name || null;
  }
}

function sortRows(rows, key) {
  const desc = key === "valanghe" || key === "vento"; // il rischio più alto in cima
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = typeof va === "string" ? va.localeCompare(vb, "it") : va - vb;
    return desc ? -c : c;
  });
}

/** Mini profilo dai punti reali della traccia; senza traccia, testo onesto. */
function MiniProfile({ points }) {
  const eles = (points || []).map((p) => p.ele).filter((e) => e != null);
  if (eles.length < 8) return <span className="c-none">no traccia</span>;
  const step = Math.max(1, Math.floor(eles.length / 24));
  const ys = eles.filter((_, i) => i % step === 0);
  const lo = Math.min(...ys), hi = Math.max(...ys);
  const range = Math.max(1, hi - lo);
  const pts = ys
    .map((e, i) => `${((i / (ys.length - 1)) * 96).toFixed(1)},${(24 - ((e - lo) / range) * 20).toFixed(1)}`)
    .join(" ");
  return (
    <svg viewBox="0 0 96 26" preserveAspectRatio="none" aria-hidden
      style={{ width: 96, height: 26, display: "block" }}>
      <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="1.6"
        strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function DangerCell({ bulletin }) {
  if (bulletin?.status === "in_vigore") {
    const lvl = bulletin.danger_level;
    return (
      <span className="dangerchip tnum"
        style={{ background: DANGER_COLORS[lvl], color: dangerInk(lvl) }}
        title={`${bulletin.service || "bollettino ufficiale"} · grado ${lvl}/5`}>
        {lvl} · {DANGER_LABELS[lvl] || ""}
      </span>
    );
  }
  if (bulletin?.status === "non_verificabile") {
    // Rilevante per la sicurezza: un bollettino DOVREBBE esserci e non si
    // riesce a verificare. Non si nasconde e non si declassa a "nessun pericolo".
    return (
      <span className="c-warn">
        <Icon.Warning size={13} /> non verif.
      </span>
    );
  }
  return <span className="c-none">—</span>;
}

export default function ConditionsTable({ areas = [], routes = [], sort = "nome", activity = "" }) {
  if (!routes.length) return null;

  const byArea = Object.fromEntries(areas.map((a) => [a.area_id, a]));
  const rows = sortRows(
    routes.map((route) => ({ route, area: byArea[route.area_id] })),
    sort
  );

  const inSeason = areas.some((a) => a?.bulletin?.status === "in_vigore");
  const anyDemo = areas.some((a) => a.forecast && a.forecast_is_demo);
  const href = (key) =>
    `/itinerari?${activity ? `activity=${encodeURIComponent(activity)}&` : ""}sort=${key}#condizioni`;

  return (
    <section id="condizioni" style={{ marginTop: 34 }}>
      <div className="ctable-top">
        <div>
          <h2 style={{ margin: 0 }}>Condizioni adesso</h2>
          <p className="note" style={{ marginTop: 4 }}>
            {inSeason
              ? "Bollettino valanghe ufficiale per area e meteo al punto di partenza."
              : "Meteo al punto di partenza per area."}
          </p>
        </div>
      </div>

      <div className="ctable-scroll">
        <div className="ctable tnum">
          <div className="ctable-row ctable-head">
            {COLS.map((c) => (
              <span key={c.key} className={c.cls}>
                {c.sortable === false ? (
                  c.label
                ) : (
                  <a className={`sortlink ${sort === c.key ? "on" : ""}`} href={href(c.key)}>
                    {c.label}
                    {sort === c.key && <span aria-hidden> ↓</span>}
                  </a>
                )}
              </span>
            ))}
          </div>

          {rows.map(({ route: r, area }) => (
            <div className="ctable-row" key={r.slug}>
              <span>
                <a className="c-name" href={`/routes/${r.slug}`}>{r.name}</a>
                <span className="c-sub">
                  {(r.activity || "").replace("_", " ")}
                  {r.area_name ? ` · ${r.area_name}` : ""}
                </span>
              </span>
              <span className="c-grade"
                title={`${r.diff_grade || "difficoltà n.d."}${r.diff_scale ? ` (scala ${r.diff_scale})` : ""}`}>
                {r.diff_grade || "n.d."}
              </span>
              <span className="c-prof"><MiniProfile points={r.track_points} /></span>
              <span><DangerCell bulletin={area?.bulletin} /></span>
              <span className="c-frz">
                {area?.forecast?.freezing_level_m != null
                  ? fmtNum(area.forecast.freezing_level_m)
                  : <span className="c-none">—</span>}
              </span>
              <span>
                {area?.forecast?.wind_avg_kmh != null
                  ? area.forecast.wind_avg_kmh
                  : <span className="c-none">—</span>}
              </span>
              <span className="c-end">
                {fmtMin(r.tempi?.totale_min ?? r.tempi?.salita_min) || (
                  <span className="c-none">—</span>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <p className="ctable-note">
        Il bollettino ufficiale {areas[0]?.bulletin?.service || "AINEVA"} / Meteomont prevale
        sempre. Supporto alla decisione, non una raccomandazione.
        {anyDemo && " Meteo dimostrativo: nessuna chiave API configurata."}
      </p>
    </section>
  );
}
