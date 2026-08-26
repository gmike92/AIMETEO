// Server component: route data and forecast are fetched server-side (ISR,
// 5 min) so the page — titles included — is fully rendered for SEO. The only
// interactive part (the AI briefing) lives in the BriefingPanel client
// component. Testo fisso e numeri passano da isole client (T/Measurement)
// che seguono lingua e unità dei Settings senza perdere il render server.
import { notFound } from "next/navigation";
import { serverFetch, API_BASE } from "@/lib/api";
import BriefingPanel from "./BriefingPanel";
import ElevationProfile from "./ElevationProfile";
import Meteogram from "./Meteogram";
import RouteWeatherStrip from "./RouteWeatherStrip";
import OfflineButton from "./OfflineButton";
import BestWindowCard from "./BestWindowCard";
import PushButton from "../../components/PushButton";
import { Icon } from "../../components/WxIcon";
import T from "../../components/T";
import Measurement from "../../components/Measurement";

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
    return { title: "Itinerario non trovato | Zerotermico" };
  }
  const area = route.area?.name ? ` (${route.area.name})` : "";
  return {
    title: `Meteo e condizioni — ${route.name} | Zerotermico`,
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
      <a href="/itinerari" className="note"><T k="route.back" /></a>
      {hasRealCoords && (
        <>
          <a
            href={`/?route=${encodeURIComponent(params.slug)}`}
            className="note"
            style={{ marginLeft: 16, color: "var(--accent-text)" }}
          >
            <T k="route.see_on_map" />
          </a>
          <a
            href={`${API_BASE}/routes/${encodeURIComponent(params.slug)}/gpx`}
            className="note"
            style={{ marginLeft: 16, color: "var(--accent2-text)" }}
          >
            <T k="route.download_gpx" /> <Icon.Download size={12} style={{ display: "inline-block", verticalAlign: "-2px" }} />
          </a>
          <OfflineButton slug={params.slug} trackPoints={route.track_points} />
          <span style={{ marginLeft: 12 }}><PushButton /></span>
        </>
      )}
      <span className="eyebrow" style={{ display: "block", marginTop: 18 }}>
        {route.activity} · {route.area?.name}
      </span>
      <h1>{route.name}</h1>
      {route.proposto_da && (
        <p className="note" style={{ marginTop: 2 }}>
          Nella collezione di{" "}
          <a href={`/autori/${route.proposto_da.slug}`}
            style={{ color: "var(--accent-text)", textDecoration: "underline" }}>
            {route.proposto_da.name}
          </a>
          {route.proposto_da.ruolo ? ` — ${route.proposto_da.ruolo}` : ""}
        </p>
      )}
      <p className="sub">{route.ideal_conditions}</p>

      <div className="stats tnum">
        {route.tempi?.totale_min != null && (
          <div className="stat" title={`${route.tempi.metodo} · ${route.tempi.parametri}`}>
            <div className="k"><T k="route.stat_time" /></div>
            <div className="v">
              {Math.floor(route.tempi.totale_min / 60)}h
              {String(route.tempi.totale_min % 60).padStart(2, "0")}
            </div>
          </div>
        )}
        {route.tempi?.distanza_km != null && (
          <div className="stat"><div className="k"><T k="route.stat_distance" /></div>
            <div className="v"><Measurement kind="distance" value={route.tempi.distanza_km} /></div></div>
        )}
        <div className="stat"><div className="k"><T k="route.stat_diff" /></div><div className="v">{route.diff_grade}</div></div>
        <div className="stat"><div className="k"><T k="route.stat_start" /></div>
          <div className="v"><Measurement kind="elevation" value={route.start_altitude_m} /></div></div>
        <div className="stat"><div className="k"><T k="route.stat_max" /></div>
          <div className="v"><Measurement kind="elevation" value={route.max_altitude_m} /></div></div>
        <div className="stat"><div className="k"><T k="route.stat_gain" /></div>
          <div className="v"><Measurement kind="elevation" value={route.vertical_gain_m} /></div></div>
        <div className="stat"><div className="k"><T k="route.stat_aspects" /></div><div className="v">{(route.primary_aspects || []).join(" ")}</div></div>
        <div className="stat"><div className="k"><T k="route.stat_slope" /></div><div className="v">{route.max_slope_deg}°</div></div>
      </div>

      {route.exposure_notes && (
        <p className="note"><strong>Note esposizione:</strong> {route.exposure_notes}</p>
      )}

      <h2><T k="route.conditions_heading" /></h2>
      {forecast ? (
        <div className="panel">
          <div className="stats tnum" style={{ border: "none", margin: 0, padding: 0 }}>
            <div className="stat"><div className="k"><T k="route.freezing" /></div>
              <div className="v"><Measurement kind="elevation" value={forecast.freezing_level_m} /></div></div>
            <div className="stat"><div className="k"><T k="route.wind" /></div>
              <div className="v"><Measurement kind="speed" value={forecast.wind_avg_kmh} /></div></div>
            <div className="stat"><div className="k"><T k="route.gust" /></div>
              <div className="v"><Measurement kind="speed" value={forecast.wind_gust_kmh} /></div></div>
            <div className="stat"><div className="k"><T k="route.storm" /></div><div className="v">{Math.round(forecast.thunderstorm_prob * 100)}%</div></div>
          </div>
          <p className="note">
            <T k="route.freezing_note_a" /> <strong><T k="route.freezing_note_b" /></strong>
            <T k="route.freezing_note_c" /> {forecast.source}
            {isDemoForecast && <> <T k="route.demo_data" /></>}
          </p>
        </div>
      ) : (
        <p className="note"><T k="route.no_forecast" /></p>
      )}

      <BestWindowCard slug={params.slug} />

      <RouteWeatherStrip slug={params.slug} />

      <ElevationProfile trackPoints={route.track_points} />

      {hasRealCoords && (
        <Meteogram
          lat={route.start_lat}
          lon={route.start_lon}
          name={route.name}
          startAltitude={route.start_altitude_m}
          maxAltitude={route.max_altitude_m}
        />
      )}

      <BriefingPanel slug={params.slug} />

      <p className="note" style={{ marginTop: 26 }}>
        <T k="route.report_a" />{" "}
        <a
          style={{ color: "var(--accent-text)", textDecoration: "underline" }}
          href={`mailto:michele.guizzardi@gmail.com?subject=${encodeURIComponent(
            `Zerotermico · segnalazione: ${route.name}`
          )}&body=${encodeURIComponent(
            "Cosa hai trovato di diverso? (traccia, tempi, condizioni, quota...)\n\n" +
            `Itinerario: ${route.name} (${params.slug})\n`
          )}`}
        >
          <T k="route.report_b" />
        </a>{" "}
        <T k="route.report_c" />
      </p>

      <p className="disclaimer"><T k="route.disclaimer" /></p>
    </div>
  );
}
