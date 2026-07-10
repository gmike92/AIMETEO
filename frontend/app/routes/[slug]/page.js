// Server component: route data and forecast are fetched server-side (ISR,
// 5 min) so the page — titles included — is fully rendered for SEO. The only
// interactive part (the AI briefing) lives in the BriefingPanel client
// component.
import { notFound } from "next/navigation";
import { serverFetch } from "@/lib/api";
import BriefingPanel from "./BriefingPanel";

export const revalidate = 300;

async function getRoute(slug) {
  try {
    // Next dedupes this fetch between generateMetadata and the page render.
    return await serverFetch(`/routes/${encodeURIComponent(slug)}`, {
      revalidate: 300,
    });
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({ params }) {
  const route = await getRoute(params.slug);
  if (!route) {
    return { title: "Itinerario non trovato | AIMETEO" };
  }
  const area = route.area?.name ? ` (${route.area.name})` : "";
  return {
    title: `Meteo e condizioni — ${route.name} | AIMETEO`,
    description:
      `Previsioni sul percorso, bollettino valanghe ufficiale e relazione di gita AI per ` +
      `${route.name}${area}: ${route.activity}, difficoltà ${route.diff_grade}, ` +
      `dislivello ${route.vertical_gain_m} m, quota massima ${route.max_altitude_m} m.`,
  };
}

export default async function RouteDetail({ params }) {
  const route = await getRoute(params.slug);
  if (!route) notFound();

  // Real trailhead coordinates when a GPX has been ingested; demo coords
  // otherwise (and we say so under the panel).
  const hasRealCoords = route.start_lat != null && route.start_lon != null;
  const lat = hasRealCoords ? route.start_lat : 46.4;
  const lon = hasRealCoords ? route.start_lon : 12.0;
  let forecast = null;
  try {
    forecast = await serverFetch(
      `/forecast/point?lat=${lat}&lon=${lon}&altitude_m=${route.start_altitude_m}`,
      { revalidate: 300 }
    );
  } catch {
    forecast = null;
  }
  const isDemoForecast = !hasRealCoords || forecast?.source === "mock";

  return (
    <div>
      <a href="/itinerari" className="note">← Tutti gli itinerari</a>
      {hasRealCoords && (
        <a
          href={`/?route=${encodeURIComponent(params.slug)}`}
          className="note"
          style={{ marginLeft: 16, color: "var(--accent)" }}
        >
          Vedi traccia sulla mappa →
        </a>
      )}
      <span className="eyebrow" style={{ display: "block", marginTop: 18 }}>
        {route.activity} · {route.area?.name}
      </span>
      <h1>{route.name}</h1>
      <p className="sub">{route.ideal_conditions}</p>

      <div className="stats">
        <div className="stat"><div className="k">Difficoltà</div><div className="v">{route.diff_grade}</div></div>
        <div className="stat"><div className="k">Partenza</div><div className="v">{route.start_altitude_m} m</div></div>
        <div className="stat"><div className="k">Quota max</div><div className="v">{route.max_altitude_m} m</div></div>
        <div className="stat"><div className="k">Dislivello</div><div className="v">{route.vertical_gain_m} m</div></div>
        <div className="stat"><div className="k">Esposizioni</div><div className="v">{(route.primary_aspects || []).join(" ")}</div></div>
        <div className="stat"><div className="k">Pendio max</div><div className="v">{route.max_slope_deg}°</div></div>
      </div>

      {route.exposure_notes && (
        <p className="note"><strong>Note esposizione:</strong> {route.exposure_notes}</p>
      )}

      <h2>Condizioni sul percorso</h2>
      {forecast ? (
        <div className="panel">
          <div className="stats" style={{ border: "none", margin: 0, padding: 0 }}>
            <div className="stat"><div className="k">Zero termico</div><div className="v">{forecast.freezing_level_m} m</div></div>
            <div className="stat"><div className="k">Vento</div><div className="v">{forecast.wind_avg_kmh} km/h</div></div>
            <div className="stat"><div className="k">Raffiche</div><div className="v">{forecast.wind_gust_kmh} km/h</div></div>
            <div className="stat"><div className="k">Temporali</div><div className="v">{Math.round(forecast.thunderstorm_prob * 100)}%</div></div>
          </div>
          <p className="note">
            Fonte: {forecast.source}
            {isDemoForecast ? " (dati dimostrativi)" : ""}
          </p>
        </div>
      ) : (
        <p className="note">Previsioni non disponibili al momento.</p>
      )}

      <BriefingPanel slug={params.slug} />

      <p className="disclaimer">
        Le relazioni sono un <strong>supporto alla decisione</strong>, non una raccomandazione.
        La responsabilità finale è del capogita; il bollettino ufficiale prevale sempre.
      </p>
    </div>
  );
}
