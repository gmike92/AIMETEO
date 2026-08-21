// Route browser + conditions board (moved here when the map became the
// landing page). Server component, ISR 5 min, SEO metadata.
import { serverFetch } from "@/lib/api";
import WaitlistSignup from "../components/WaitlistSignup";
import ConditionsBoard from "../components/ConditionsBoard";

export const revalidate = 300;

export const metadata = {
  title: "Itinerari e condizioni — Zerotermico",
  description:
    "Itinerari di scialpinismo, alpinismo, ferrate ed escursionismo con bollettino valanghe ufficiale, meteo sul percorso e relazione di gita AI.",
};

const ACTIVITIES = [
  ["", "Tutti"],
  ["scialpinismo", "Scialpinismo"],
  ["alpinismo", "Alpinismo"],
  ["via_ferrata", "Via ferrata"],
  ["escursionismo", "Escursionismo"],
];

const ACT_ICON = {
  scialpinismo: "⛷", alpinismo: "🏔", via_ferrata: "🧗", escursionismo: "🥾",
};

// Colore del badge difficoltà (scala CAI; altre scale → neutro).
function diffColor(grade) {
  const g = (grade || "").toUpperCase();
  if (g === "T") return "var(--accent2)";
  if (g === "E") return "var(--accent)";
  if (g === "EE") return "var(--warn)";
  if (g === "EEA" || g.startsWith("F") || g.startsWith("PD") || g.startsWith("AD"))
    return "var(--danger)";
  return "var(--muted)";
}

function fmtMin(min) {
  if (min == null) return null;
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m}min`;
}

// Mini profilo altimetrico alla Komoot — SVG server-rendered dai punti REALI.
function Spark({ pts }) {
  const eles = (pts || []).map((p) => p.ele).filter((e) => e != null);
  if (eles.length < 8) {
    // niente traccia: placeholder discreto, così le card restano allineate
    return (
      <div style={{ margin: "12px 0 2px", height: 54, borderRadius: 8,
        border: "1px dashed var(--line-strong)", display: "flex",
        alignItems: "center", justifyContent: "center",
        color: "var(--faint)", fontSize: 11.5 }}>
        profilo altimetrico in arrivo
      </div>
    );
  }
  const N = 48;
  const step = Math.max(1, Math.floor(eles.length / N));
  const ys = eles.filter((_, i) => i % step === 0);
  if (ys[ys.length - 1] !== eles[eles.length - 1]) ys.push(eles[eles.length - 1]);
  const min = Math.min(...ys), max = Math.max(...ys);
  const range = Math.max(1, max - min);
  const W = 280, H = 54, PAD = 6;
  const pt = (e, i) =>
    `${((i / (ys.length - 1)) * W).toFixed(1)},` +
    `${(H - PAD - ((e - min) / range) * (H - PAD * 2)).toFixed(1)}`;
  const line = ys.map(pt).join(" ");
  return (
    <div style={{ position: "relative", margin: "12px 0 2px" }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden
        style={{ width: "100%", height: 54, display: "block" }}>
        <polygon points={`0,${H} ${line} ${W},${H}`} fill="rgba(56,189,248,.10)" />
        <polyline points={line} fill="none" stroke="var(--accent)"
          strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <span style={{ position: "absolute", right: 0, top: -4, fontSize: 10.5,
        color: "var(--faint)", fontVariantNumeric: "tabular-nums" }}>
        {Math.round(min)}–{Math.round(max)} m
      </span>
    </div>
  );
}

export default async function Itinerari({ searchParams }) {
  const activity = searchParams?.activity || "";

  let routes = [];
  let error = null;
  try {
    routes = await serverFetch(
      `/routes${activity ? `?activity=${encodeURIComponent(activity)}` : ""}`,
      { revalidate: 300 }
    );
  } catch (e) {
    error = e.message;
  }

  return (
    <div>
      <span className="eyebrow">Italia-first · per la montagna</span>
      <h1>Itinerari e <em>condizioni</em>.</h1>
      <p className="sub">
        Sfoglia gli itinerari, controlla le condizioni sul percorso e genera una relazione
        di gita. Il bollettino valanghe ufficiale è sempre in evidenza.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
        {ACTIVITIES.map(([val, label]) => (
          <a
            key={val}
            className={`btn ${activity === val ? "" : "ghost"}`}
            href={val ? `/itinerari?activity=${encodeURIComponent(val)}` : "/itinerari"}
          >
            {label}
          </a>
        ))}
      </div>

      {error && <p className="err">Backend non raggiungibile: {error}</p>}

      <ConditionsBoard />

      <h2 style={{ marginTop: 28 }}>Itinerari</h2>
      <div className="grid">
        {routes.map((r) => {
          // With a real GPX track → open the map on the track; otherwise → scheda.
          const hasTrack = r.start_lat != null && r.start_lon != null;
          const verified = r.verified_at != null;
          return (
            <a
              className="card"
              key={r.slug}
              href={hasTrack ? `/?route=${encodeURIComponent(r.slug)}` : `/routes/${r.slug}`}
            >
              <div style={{ display: "flex", justifyContent: "space-between",
                gap: 10, alignItems: "baseline" }}>
                <h3 style={{ flex: "1 1 auto", minWidth: 0 }}>{r.name}</h3>
                <span title={`${r.diff_grade || "difficoltà n.d."}${r.diff_scale ? ` (scala ${r.diff_scale})` : ""}`}
                  style={{ flex: "0 0 auto", maxWidth: 90, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                    fontSize: 11.5, fontWeight: 800, letterSpacing: ".4px",
                    color: diffColor(r.diff_grade),
                    border: "1px solid currentColor", borderRadius: 999,
                    padding: "2px 10px" }}>
                  {r.diff_grade || "n.d."}
                </span>
              </div>
              <div className="meta">
                <span className="pill">
                  {ACT_ICON[r.activity] || "⛰"} {r.activity?.replace("_", " ")}
                </span>
                <span>{r.area_name}</span>
              </div>

              <Spark pts={r.track_points} />

              <div className="meta" style={{ fontVariantNumeric: "tabular-nums" }}>
                {r.tempi?.totale_min != null && (
                  <span title={`${r.tempi.metodo} · ${r.tempi.parametri}`}>
                    ⏱ {fmtMin(r.tempi.totale_min)}
                  </span>
                )}
                {r.tempi?.totale_min == null && r.tempi?.salita_min != null && (
                  <span title={r.tempi.metodo}>⏱ ~{fmtMin(r.tempi.salita_min)} salita</span>
                )}
                {r.tempi?.distanza_km != null && <span>{r.tempi.distanza_km} km</span>}
                <span>↗ {r.vertical_gain_m} m disl.</span>
                <span>▲ {r.max_altitude_m} m</span>
                <span style={{ color: verified ? "var(--accent2)" : "var(--faint)" }}>
                  {verified ? "✓ verificato" : "da verificare"}
                </span>
              </div>
              <div className="meta" style={{ color: "var(--accent)" }}>
                {hasTrack ? "Traccia sulla mappa →" : "Scheda itinerario →"}
              </div>
            </a>
          );
        })}
      </div>
      {!error && routes.length === 0 && (
        <p className="note">Nessun itinerario per questo filtro.</p>
      )}

      <WaitlistSignup source="frontend" />
    </div>
  );
}
