"use client";
// Tabella condizioni — opzione 1d. Prende il posto di ConditionsBoard e
// fonde le due chiamate che prima si facevano separatamente: /conditions
// (bollettino ufficiale + meteo per area) e /routes (gli itinerari).
//
// Per chi confronta dieci gite prima del weekend, una griglia densa e
// ordinabile batte dieci card: le colonne si leggono in verticale.
//
// L'ordinamento passa dalla querystring (?sort=vento): il valore iniziale
// arriva dalla pagina server (ISR 5 minuti intatta), il click cambia solo
// l'URL — nessuno stato di ordinamento locale. Client component per via di
// i18n/unità (regola 1.9: il rendering iniziale coincide col server, vedi
// SettingsProvider), non per l'ordinamento.
//
// Header e righe condividono una sola subgrid, quindi le colonne non
// possono scollarsi tra loro.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "./WxIcon";
import { DANGER_COLORS, dangerInk } from "@/lib/wx";
import { fmtMin } from "@/lib/fmt";
import { useT } from "@/lib/i18n";
import { useUnits } from "@/lib/units";

//: come RouteGrid (RouteCard.js) — centinaia di righe tutte insieme erano
// la "wall of text" della pagina itinerari, questo limite le spezza.
const PAGE_SIZE = 30;

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
  const t = useT();
  const eles = (points || []).map((p) => p.ele).filter((e) => e != null);
  if (eles.length < 8) return <span className="c-none">{t("conditions.no_track")}</span>;
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
  const t = useT();
  if (bulletin?.status === "in_vigore") {
    const lvl = bulletin.danger_level;
    return (
      <span className="dangerchip tnum"
        style={{ background: DANGER_COLORS[lvl], color: dangerInk(lvl) }}
        title={`${bulletin.service || "bollettino ufficiale"} · ${lvl}/5`}>
        {lvl} · {t(`danger.${lvl}`)}
      </span>
    );
  }
  if (bulletin?.status === "non_verificabile") {
    // Rilevante per la sicurezza: un bollettino DOVREBBE esserci e non si
    // riesce a verificare. Non si nasconde e non si declassa a "nessun pericolo".
    return (
      <span className="c-warn">
        <Icon.Warning size={13} /> {t("conditions.unverifiable")}
      </span>
    );
  }
  return <span className="c-none">—</span>;
}

export default function ConditionsTable({ areas = [], routes = [], sort = "nome", activity = "" }) {
  const t = useT();
  const units = useUnits();

  const COLS = [
    { key: "nome", label: t("conditions.col_route") },
    { key: "diff", label: t("conditions.col_diff") },
    { key: "prof", label: t("conditions.col_profile"), cls: "c-prof", sortable: false },
    { key: "valanghe", label: t("conditions.col_danger") },
    { key: "zero", label: t("conditions.col_freezing"), cls: "c-frz" },
    { key: "vento", label: t("conditions.col_wind") },
    { key: "tempo", label: t("conditions.col_time"), cls: "c-end" },
  ];

  const [visible, setVisible] = useState(PAGE_SIZE);
  useEffect(() => setVisible(PAGE_SIZE), [routes, sort]);

  if (!routes.length) return null;

  const byArea = Object.fromEntries(areas.map((a) => [a.area_id, a]));
  const rows = sortRows(
    routes.map((route) => ({ route, area: byArea[route.area_id] })),
    sort
  );
  const shownRows = rows.slice(0, visible);
  const remaining = rows.length - shownRows.length;

  const inSeason = areas.some((a) => a?.bulletin?.status === "in_vigore");
  const anyDemo = areas.some((a) => a.forecast && a.forecast_is_demo);
  // Servizi bollettino REALMENTE presenti tra le aree mostrate — mai un
  // fallback fisso "AINEVA": con l'espansione internazionale molte viste
  // (es. solo itinerari USA/Giappone) non hanno alcun bollettino ufficiale
  // integrato, e affermarlo comunque sarebbe un'attribuzione falsa.
  const bulletinServices = [...new Set(areas.map((a) => a?.bulletin?.service).filter(Boolean))];
  const href = (key) =>
    `/itinerari?${activity ? `activity=${encodeURIComponent(activity)}&` : ""}sort=${key}#condizioni`;

  return (
    <section id="condizioni" className="panel" style={{ marginTop: 34 }}>
      <div className="ctable-top">
        <div>
          <h2 style={{ margin: 0 }}>{t("conditions.title")}</h2>
          <p className="note" style={{ marginTop: 4 }}>
            {inSeason ? t("conditions.sub_season") : t("conditions.sub_noseason")}
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
                  <Link className={`sortlink ${sort === c.key ? "on" : ""}`} href={href(c.key)}>
                    {c.label}
                    {sort === c.key && <span aria-hidden> ↓</span>}
                  </Link>
                )}
              </span>
            ))}
          </div>

          {shownRows.map(({ route: r, area }) => (
            <div className="ctable-row" key={r.slug}>
              <span>
                <Link className="c-name" href={`/routes/${r.slug}`}>{r.name}</Link>
                <span className="c-sub">
                  {(r.activity || "").replace("_", " ")}
                  {r.area_name ? ` · ${r.area_name}` : ""}
                </span>
              </span>
              <span className="c-grade"
                title={`${r.diff_grade || "n.d."}${r.diff_scale ? ` (scala ${r.diff_scale})` : ""}`}>
                {r.diff_grade || "n.d."}
              </span>
              <span className="c-prof"><MiniProfile points={r.track_points} /></span>
              <span><DangerCell bulletin={area?.bulletin} /></span>
              <span className="c-frz">
                {area?.forecast?.freezing_level_m != null
                  ? units.elevation(area.forecast.freezing_level_m)
                  : <span className="c-none">—</span>}
              </span>
              <span>
                {area?.forecast?.wind_avg_kmh != null
                  ? units.speed(area.forecast.wind_avg_kmh)
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

      {remaining > 0 && (
        <button
          type="button"
          className="btn ghost loadmore"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
        >
          {t("conditions.load_more")} ({remaining})
        </button>
      )}

      <p className="ctable-note">
        {bulletinServices.length > 0
          ? `${bulletinServices.join(" / ")} ${t("conditions.prevails")}`
          : t("conditions.prevails_generic")}
        {anyDemo && ` ${t("conditions.demo_note")}`}
      </p>
    </section>
  );
}
