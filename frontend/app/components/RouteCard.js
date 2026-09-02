"use client";
// Card itinerario — opzione 1c. Sostituisce il blocco <a className="card">
// e il componente Spark di app/itinerari/page.js, e in più disegna la linea
// dello zero termico sul profilo.
//
// Client component: usa i18n e unità di misura dai Settings (regola 1.9 —
// il rendering iniziale coincide comunque col server, vedi
// SettingsProvider). Il profilo resta un SVG puro calcolato dai punti REALI
// della traccia, mai da una curva finta.
//
// Degrada senza lanciare (regola 1.9): senza traccia il posto del profilo
// mostra un placeholder dichiarato; senza freezingLevel la linea dello zero
// termico semplicemente non c'è; senza tempi la cella dice "—".

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "./WxIcon";
import { fmtM, fmtMin, fmtNum } from "@/lib/fmt";
import { useT } from "@/lib/i18n";
import { useUnits } from "@/lib/units";
import { useSettings } from "./SettingsProvider";

//: pagina client-side, non server: il filtro attività/ordinamento resta
// nell'URL (regola 1c), qui si decide solo quanti dei risultati filtrati
// mostrare subito — con centinaia di itinerari (espansione internazionale)
// renderizzarli tutti insieme è la "wall of text" da cui nasce questo limite.
const PAGE_SIZE = 24;

const ACT_KEY = {
  scialpinismo: "act.scialpinismo",
  alpinismo: "act.alpinismo",
  arrampicata: "act.arrampicata",
  via_ferrata: "act.via_ferrata",
  escursionismo: "act.escursionismo",
  trail_running: "act.trail_running",
  mtb_alpino: "act.mtb_alpino",
  volo_libero: "act.volo_libero",
};

// Colore del grado: sul BORDO e sul testo, mai come riempimento (regola 1.4).
// I riempimenti restano ai soli chip EAWS 1–5.
function gradeColor(grade) {
  const g = (grade || "").toUpperCase();
  if (g === "T") return "var(--accent2-text)";
  if (g === "E") return "var(--accent-text)";
  if (g === "EE") return "var(--warn-text)";
  if (g === "EEA" || g.startsWith("F") || g.startsWith("PD") || g.startsWith("AD"))
    return "var(--danger-text)";
  return "var(--muted)";
}

const W = 280, H = 76, PAD = 8;

/** Profilo altimetrico + linea dello zero termico. */
function Profile({ points, freezingLevel, slug }) {
  const t = useT();
  const units = useUnits();
  const eles = (points || []).map((p) => p.ele).filter((e) => e != null);
  if (eles.length < 8) {
    return (
      <div className="rcard-profile empty">
        <span>{t("rcard.no_track")}</span>
      </div>
    );
  }

  // ~48 campioni: abbastanza per la forma del pendio, abbastanza pochi da
  // non gonfiare l'HTML server-rendered di ogni card della griglia.
  const N = 48;
  const step = Math.max(1, Math.floor(eles.length / N));
  const ys = eles.filter((_, i) => i % step === 0);
  if (ys[ys.length - 1] !== eles[eles.length - 1]) ys.push(eles[eles.length - 1]);

  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const range = Math.max(1, hi - lo);

  // La linea dello zero termico si disegna solo se cade DENTRO (o appena
  // fuori) la fascia di quota dell'itinerario: uno zero termico a 4 200 m su
  // una gita che arriva a 1 900 m non è un'informazione, è una riga appiccicata
  // al bordo del grafico. Fuori portata → omessa in silenzio.
  const pad = Math.max(120, range * 0.12);
  const frz = Number(freezingLevel);
  const showFrz =
    freezingLevel != null && Number.isFinite(frz) && frz >= lo - pad && frz <= hi + pad;

  // La scala verticale si estende per contenere anche la linea, così non
  // viene mai disegnata fuori dal riquadro.
  const vLo = showFrz ? Math.min(lo, frz) : lo;
  const vHi = showFrz ? Math.max(hi, frz) : hi;
  const vRange = Math.max(1, vHi - vLo);
  const y = (e) => H - PAD - ((e - vLo) / vRange) * (H - PAD * 2);
  const line = ys
    .map((e, i) => `${((i / (ys.length - 1)) * W).toFixed(1)},${y(e).toFixed(1)}`)
    .join(" ");

  const gid = `rp-${String(slug || "x").replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <div className="rcard-profile">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        aria-hidden
        style={{ width: "100%", height: H, display: "block" }}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity=".26" />
            <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${H} ${line} ${W},${H}`} fill={`url(#${gid})`} />
        <polyline
          points={line}
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.8"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {showFrz && (
          <line
            x1="0" y1={y(frz)} x2={W} y2={y(frz)}
            stroke="var(--accent2)" strokeWidth="1" strokeDasharray="4 4" opacity=".75"
          />
        )}
      </svg>
      {showFrz && (
        <span className="rcard-frz tnum">0°C {units.elevation(frz)}</span>
      )}
      <span className="rcard-range tnum">
        {fmtNum(lo)}–{fmtM(hi)}
      </span>
    </div>
  );
}

// alwaysDetail: per l'anteprima sulla mappa (vedi RoutePreviewCard in
// MapView.js) — lì "hasTrack" è sempre vero (la card compare solo cliccando
// un marker, che esiste solo per itinerari con traccia) ma il link giusto
// NON è "torna alla mappa" (ci si è già sopra), è la scheda completa.
export default function RouteCard({ route: r, freezingLevel, alwaysDetail = false }) {
  const t = useT();
  const units = useUnits();
  // Con una traccia reale il link apre la mappa sulla traccia; senza, la scheda.
  const hasTrack = r.start_lat != null && r.start_lon != null;
  const verified = r.verified_at != null;
  const tempo =
    fmtMin(r.tempi?.totale_min) ||
    (r.tempi?.salita_min != null ? `~${fmtMin(r.tempi.salita_min)}` : null);
  const href = alwaysDetail
    ? `/routes/${r.slug}`
    : hasTrack ? `/?route=${encodeURIComponent(r.slug)}` : `/routes/${r.slug}`;
  const footerLabel = alwaysDetail || !hasTrack ? t("rcard.go_route") : t("rcard.go_map");

  return (
    <Link className="rcard" href={href}>
      <div className="rcard-head">
        <div className="rcard-id">
          {/* Attività come kicker testuale: era un'emoji, e un'emoji di
              attività è esattamente il glifo che cambia forma su ogni OS. */}
          <span className="rcard-kicker">
            {t(ACT_KEY[r.activity]) || r.activity?.replace("_", " ")}
          </span>
          <h3>{r.name}</h3>
          <p className="rcard-area">{r.area_name}</p>
        </div>
        {/* BSA e PD vengono da scale diverse: il grado da solo è ambiguo,
            la scala resta nel title. */}
        <span
          className="rcard-grade tnum"
          style={{ color: gradeColor(r.diff_grade) }}
          title={`${r.diff_grade || "n.d."}${
            r.diff_scale ? ` (scala ${r.diff_scale})` : ""
          }`}
        >
          {r.diff_grade || "n.d."}
        </span>
      </div>

      <Profile points={r.track_points} freezingLevel={freezingLevel} slug={r.slug} />

      <div className="statgrid tnum">
        <div className="statcell">
          <span className="k">{t("rcard.time")}</span>
          <span className="v" title={r.tempi?.metodo || undefined}>{tempo || "—"}</span>
        </div>
        <div className="statcell">
          <span className="k">{t("rcard.gain")}</span>
          <span className="v">{units.elevation(r.vertical_gain_m) || "—"}</span>
        </div>
        <div className="statcell">
          <span className="k">{t("rcard.slope")}</span>
          <span className="v">{r.max_slope_deg != null ? `${r.max_slope_deg}°` : "—"}</span>
        </div>
      </div>

      <div className="rcard-foot">
        <span className={verified ? "ok" : "todo"}>
          {verified && <Icon.Check size={13} />}
          {verified ? t("rcard.verified") : t("rcard.unverified")}
        </span>
        <span className="go">{footerLabel}</span>
      </div>
    </Link>
  );
}

/** Variante compatta a riga, per la densità "elenco". Niente profilo (il
 *  punto dell'elenco è vederne tanti a schermo), stessi dati essenziali. */
function RouteListRow({ route: r, freezingLevel }) {
  const t = useT();
  const units = useUnits();
  const hasTrack = r.start_lat != null && r.start_lon != null;
  const verified = r.verified_at != null;
  const tempo =
    fmtMin(r.tempi?.totale_min) ||
    (r.tempi?.salita_min != null ? `~${fmtMin(r.tempi.salita_min)}` : null);

  return (
    <Link className="rrow" href={hasTrack ? `/?route=${encodeURIComponent(r.slug)}` : `/routes/${r.slug}`}>
      <span
        className="rrow-grade tnum"
        style={{ color: gradeColor(r.diff_grade) }}
        title={`${r.diff_grade || "n.d."}${r.diff_scale ? ` (scala ${r.diff_scale})` : ""}`}
      >
        {r.diff_grade || "n.d."}
      </span>
      <span className="rrow-name">
        <strong>{r.name}</strong>
        <span className="rrow-sub">
          {t(ACT_KEY[r.activity]) || r.activity} · {r.area_name}
        </span>
      </span>
      <span className="rrow-stat tnum">{tempo || "—"}</span>
      <span className="rrow-stat tnum">{units.elevation(r.vertical_gain_m) || "—"}</span>
      <span className={`rrow-verified tnum ${verified ? "ok" : "todo"}`}>
        {verified && <Icon.Check size={12} />}
      </span>
    </Link>
  );
}

/** Griglia o elenco a seconda della preferenza Settings → densità. Un solo
 *  punto d'ingresso per la pagina itinerari, così il toggle vale ovunque.
 *  freezingLevelByArea è una mappa area_id → quota (oggetto semplice, non
 *  una funzione: page.js è un Server Component e non può passare funzioni
 *  a un Client Component — "Functions cannot be passed directly..."). */
export function RouteGrid({ routes = [], freezingLevelByArea = {} }) {
  const { settings } = useSettings();
  const t = useT();
  const getFrz = (r) => freezingLevelByArea[r.area_id] ?? null;

  const [visible, setVisible] = useState(PAGE_SIZE);
  // Un nuovo set di risultati (cambio tab attività, o sort) riparte dalla
  // prima pagina — altrimenti un filtro più corto del contatore attuale
  // lascerebbe il bottone "mostra altri" a sommare oltre quanto esiste.
  useEffect(() => setVisible(PAGE_SIZE), [routes]);

  const shown = routes.slice(0, visible);
  const remaining = routes.length - shown.length;

  const list =
    settings.density === "list" ? (
      <div className="rlist">
        {shown.map((r) => (
          <RouteListRow key={r.slug} route={r} freezingLevel={getFrz(r)} />
        ))}
      </div>
    ) : (
      <div className="grid">
        {shown.map((r) => (
          <RouteCard key={r.slug} route={r} freezingLevel={getFrz(r)} />
        ))}
      </div>
    );

  return (
    <>
      {list}
      {remaining > 0 && (
        <button
          type="button"
          className="btn ghost loadmore"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
        >
          {t("rcard.load_more")} ({remaining})
        </button>
      )}
    </>
  );
}

/** Filtri attività come tab con conteggio — link veri, non bottoni: il
 *  filtro sopravvive al reload ed è condivisibile. */
export function ActivityTabs({ activities = [], current = "", counts = {} }) {
  const t = useT();
  return (
    <div className="acttabs" role="tablist" aria-label="Filtra per attività">
      {activities.map((val) => {
        const on = current === val;
        const n = val ? counts[val] || 0 : counts.__total__ || 0;
        return (
          <Link
            key={val || "all"}
            role="tab"
            aria-selected={on}
            className={`acttab ${on ? "on" : ""}`}
            href={val ? `/itinerari?activity=${encodeURIComponent(val)}` : "/itinerari"}
          >
            {t(val ? ACT_KEY[val] : "act.all")}
            <span className="n tnum">{n}</span>
          </Link>
        );
      })}
    </div>
  );
}
