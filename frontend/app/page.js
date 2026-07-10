// LANDING = the map, Windy-style. Full-viewport interactive map with wind
// particles, radar timeline and route markers; everything else lives on
// /itinerari and /planner. Server shell + client MapView.
import MapView from "./mappa/MapView";

export const metadata = {
  title: "AIMETEO — Meteo per la montagna, fatto bene",
  description:
    "Mappa meteo interattiva della montagna italiana: vento animato, radar precipitazioni, itinerari con traccia GPX reale e bollettino valanghe ufficiale per area.",
};

export default function Home({ searchParams }) {
  const focusRoute = searchParams?.route || null;
  return (
    <div>
      <MapView fullscreen focusRoute={focusRoute}>
        <div className="mapcta">
          <a href="/itinerari" className="primary">Itinerari →</a>
          <a href="/planner">Pianifica gita</a>
        </div>
      </MapView>
      <p className="disclaimer" style={{ marginTop: 14 }}>
        Supporto alla decisione, non una raccomandazione. Il bollettino valanghe ufficiale
        (AINEVA) prevale sempre. Mappa © CARTO / OpenTopoMap / OpenStreetMap contributors ·
        radar © RainViewer · vento © Open-Meteo.
      </p>
    </div>
  );
}
