// Card itinerario — opzione 1c. Sostituisce il blocco <a className="card">
// e il componente Spark di app/itinerari/page.js, e in più disegna la linea
// dello zero termico sul profilo.
//
// Server component (nessuno stato): il profilo è SVG renderizzato lato
// server dai punti REALI della traccia, mai da una curva finta.
//
// Degrada senza lanciare (regola 1.9): senza traccia il posto del profilo
// mostra un placeholder dichiarato; senza freezingLevel la linea dello zero
// termico semplicemente non c'è; senza tempi la cella dice "—".

import { Icon } from "./WxIcon";
import { fmtM, fmtMin, fmtNum } from "@/lib/fmt";

const ACT_LABEL = {
  scialpinismo: "Scialpinismo",
  alpinismo: "Alpinismo",
  arrampicata: "Arrampicata",
  via_ferrata: "Via ferrata",
  escursionismo: "Escursionismo",
  trail_running: "Trail running",
  mtb_alpino: "MTB alpino",
  volo_libero: "Volo libero",
};

// Colore del grado: sul BORDO e sul testo, mai come riempimento (regola 1.4).
// I riempimenti restano ai soli chip EAWS 1–5.
function gradeColor(grade) {
  const g = (grade || "").toUpperCase();
  if (g === "T") return "var(--accent2)";
  if (g === "E") return "var(--accent)";
  if (g === "EE") return "var(--warn)";
  if (g === "EEA" || g.startsWith("F") || g.startsWith("PD") || g.startsWith("AD"))
    return "var(--danger)";
  return "var(--muted)";
}

const W = 280, H = 76, PAD = 8;

/** Profilo altimetrico + linea dello zero termico. */
function Profile({ points, freezingLevel, slug }) {
  const eles = (points || []).map((p) => p.ele).filter((e) => e != null);
  if (eles.length < 8) {
    return (
      <div className="rcard-profile empty">
        <span>traccia GPX non ancora ingerita</span>
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
        <span className="rcard-frz tnum">0°C {fmtM(frz)}</span>
      )}
      <span className="rcard-range tnum">
        {fmtNum(lo)}–{fmtM(hi)}
      </span>
    </div>
  );
}

export default function RouteCard({ route: r, freezingLevel }) {
  // Con una traccia reale il link apre la mappa sulla traccia; senza, la scheda.
  const hasTrack = r.start_lat != null && r.start_lon != null;
  const verified = r.verified_at != null;
  const tempo =
    fmtMin(r.tempi?.totale_min) ||
    (r.tempi?.salita_min != null ? `~${fmtMin(r.tempi.salita_min)}` : null);

  return (
    <a
      className="rcard"
      href={hasTrack ? `/?route=${encodeURIComponent(r.slug)}` : `/routes/${r.slug}`}
    >
      <div className="rcard-head">
        <div className="rcard-id">
          {/* Attività come kicker testuale: era un'emoji, e un'emoji di
              attività è esattamente il glifo che cambia forma su ogni OS. */}
          <span className="rcard-kicker">
            {ACT_LABEL[r.activity] || r.activity?.replace("_", " ")}
          </span>
          <h3>{r.name}</h3>
          <p className="rcard-area">{r.area_name}</p>
        </div>
        {/* BSA e PD vengono da scale diverse: il grado da solo è ambiguo,
            la scala resta nel title. */}
        <span
          className="rcard-grade tnum"
          style={{ color: gradeColor(r.diff_grade) }}
          title={`${r.diff_grade || "difficoltà n.d."}${
            r.diff_scale ? ` (scala ${r.diff_scale})` : ""
          }`}
        >
          {r.diff_grade || "n.d."}
        </span>
      </div>

      <Profile points={r.track_points} freezingLevel={freezingLevel} slug={r.slug} />

      <div className="statgrid tnum">
        <div className="statcell">
          <span className="k">Tempo</span>
          <span className="v" title={r.tempi?.metodo || undefined}>{tempo || "—"}</span>
        </div>
        <div className="statcell">
          <span className="k">Dislivello</span>
          <span className="v">
            {fmtNum(r.vertical_gain_m) || "—"}
            {r.vertical_gain_m != null && <em className="u"> m</em>}
          </span>
        </div>
        <div className="statcell">
          <span className="k">Pendio</span>
          <span className="v">{r.max_slope_deg != null ? `${r.max_slope_deg}°` : "—"}</span>
        </div>
      </div>

      <div className="rcard-foot">
        <span className={verified ? "ok" : "todo"}>
          {verified && <Icon.Check size={13} />}
          {verified ? "verificato" : "da verificare"}
        </span>
        <span className="go">{hasTrack ? "Traccia sulla mappa →" : "Scheda itinerario →"}</span>
      </div>
    </a>
  );
}

/** Filtri attività come tab con conteggio — link veri, non bottoni: il
 *  filtro sopravvive al reload ed è condivisibile. */
export function ActivityTabs({ activities = [], current = "", counts = {} }) {
  return (
    <div className="acttabs" role="tablist" aria-label="Filtra per attività">
      {activities.map(([val, label]) => {
        const on = current === val;
        const n = val ? counts[val] || 0 : counts.__total__ || 0;
        return (
          <a
            key={val || "all"}
            role="tab"
            aria-selected={on}
            className={`acttab ${on ? "on" : ""}`}
            href={val ? `/itinerari?activity=${encodeURIComponent(val)}` : "/itinerari"}
          >
            {label}
            <span className="n tnum">{n}</span>
          </a>
        );
      })}
    </div>
  );
}
