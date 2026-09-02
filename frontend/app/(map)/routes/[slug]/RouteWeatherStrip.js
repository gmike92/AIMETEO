// Meteo lungo l'itinerario — three cards at the REAL track elevations
// (partenza / metà / vetta). Server component: fetched with ISR like the rest
// of the page; renders nothing when the route has no ingested track.
import { serverFetch } from "@/lib/api";

const LABELS = { partenza: "Partenza", meta: "Metà percorso", vetta: "Vetta" };

export default async function RouteWeatherStrip({ slug }) {
  let data = null;
  try {
    data = await serverFetch(`/routes/${encodeURIComponent(slug)}/weather`, {
      revalidate: 900,
    });
  } catch {
    return null; // no track or weather down: the page stays clean
  }
  if (!data?.points?.length) return null;

  return (
    <div className="panel" style={{ padding: "18px 18px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6 }}>
        <strong style={{ fontSize: 14 }}>Meteo lungo l&apos;itinerario</strong>
        <span className="note" style={{ margin: 0 }}>
          alle quote reali della traccia{data.is_demo ? " · dati dimostrativi" : ""}
        </span>
      </div>
      <div className="stats" style={{ marginBottom: 0 }}>
        {data.points.map((p) => (
          <div className="stat" key={p.label}>
            <div className="k">{LABELS[p.label] || p.label} · {p.ele_m} m</div>
            <div className="v">{Math.round(p.forecast.temp_c)}°C</div>
            <div className="note" style={{ marginTop: 4 }}>
              vento {p.forecast.wind_avg_kmh} km/h · 0°C a {p.forecast.freezing_level_m} m
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
