// Server component: the meteo-first conditions board on the home page.
// One card per area — official avalanche bulletin (always prominent, with
// source link) + a representative trailhead forecast. Data comes from
// GET /conditions; everything here is display only.
import { serverFetch } from "@/lib/api";

const DANGER_LABELS = {
  1: "1 — Debole",
  2: "2 — Moderato",
  3: "3 — Marcato",
  4: "4 — Forte",
  5: "5 — Molto forte",
};

// Official EAWS palette-ish accents; text stays readable on both themes.
const DANGER_COLORS = { 1: "#9BC53D", 2: "#F5D547", 3: "#F49D37", 4: "#DA4167", 5: "#8B1E3F" };

function BulletinBadge({ bulletin }) {
  if (bulletin.status === "in_vigore") {
    return (
      <div className="meta" style={{ alignItems: "center" }}>
        <span
          className="pill"
          style={{
            background: DANGER_COLORS[bulletin.danger_level] || "transparent",
            color: bulletin.danger_level >= 4 ? "#fff" : "#1a1a1a",
            fontWeight: 600,
          }}
        >
          Valanghe {DANGER_LABELS[bulletin.danger_level] || bulletin.danger_level}
        </span>
        <a href={bulletin.source_url} target="_blank" rel="noopener" className="note">
          {bulletin.service} →
        </a>
      </div>
    );
  }
  if (bulletin.status === "non_verificabile") {
    // Safety-relevant: a bulletin SHOULD exist but can't be verified — always shown.
    return (
      <p className="note" style={{ margin: "4px 0", color: "var(--warn)" }}>
        ⚠️ Bollettino valanghe non verificabile ora — prudenza
      </p>
    );
  }
  // Off-season ("assente") or no connector: no avalanche chrome at all.
  return null;
}

export default async function ConditionsBoard() {
  let areas = [];
  try {
    areas = await serverFetch("/conditions", { revalidate: 300 });
  } catch {
    return null; // backend down: the page still renders; route grid shows the error
  }
  if (!areas.length) return null;

  const anyDemo = areas.some((a) => a.forecast && a.forecast_is_demo);
  const inSeason = areas.some((a) => a?.bulletin?.status === "in_vigore");

  return (
    <section style={{ marginTop: 28 }}>
      <h2 style={{ marginBottom: 4 }}>Condizioni adesso</h2>
      <p className="note" style={{ marginTop: 0 }}>
        {inSeason
          ? "Bollettino valanghe ufficiale per area e meteo al punto di partenza."
          : "Meteo al punto di partenza per area."}
      </p>
      <div className="grid">
        {areas.map((a) => (
          <div className="card" key={a.area_id} style={{ cursor: "default" }}>
            <h3 style={{ marginBottom: 2 }}>{a.area_name}</h3>
            <p className="note" style={{ margin: "0 0 8px" }}>
              {a.region} · {a.routes_count} itinerari
            </p>
            <BulletinBadge bulletin={a.bulletin} />
            {a.forecast && (
              <div className="meta" style={{ marginTop: 8, flexWrap: "wrap" }}>
                <span>❄ 0°C: <strong>{a.forecast.freezing_level_m} m</strong></span>
                <span>💨 {a.forecast.wind_avg_kmh} km/h</span>
                <span>⛈ {Math.round(a.forecast.thunderstorm_prob * 100)}%</span>
              </div>
            )}
            {a.forecast_route ? (
              <p className="note" style={{ marginTop: 6 }}>
                meteo su: <a href={`/routes/${a.forecast_route}`}>{a.forecast_route}</a>
              </p>
            ) : (
              <p className="note" style={{ marginTop: 6 }}>
                meteo indicativo (nessuna traccia GPX ancora ingerita in quest'area)
              </p>
            )}
          </div>
        ))}
      </div>
      {anyDemo && (
        <p className="note" style={{ marginTop: 8 }}>
          ⚠️ Meteo dimostrativo (nessuna chiave API configurata).
          {inSeason
            ? ` I gradi valanghe mostrati provengono dal connettore ufficiale ${areas[0]?.bulletin?.service || "AINEVA"} — in modalità demo sono anch'essi dimostrativi.`
            : ""}
        </p>
      )}
    </section>
  );
}
