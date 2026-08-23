// LANDING = the map, Windy-style. Full-viewport interactive map with wind
// particles, radar timeline and route markers; everything else lives on
// /itinerari and /planner. Server shell + client MapView.
import MapView from "./mappa/MapView";
import { MapSearch, DayStrip } from "./components/MapOverlay";

export const metadata = {
  title: "Zerotermico — Il meteo alla tua quota.",
  description:
    "Mappa meteo interattiva della montagna italiana: vento animato, radar precipitazioni, itinerari con traccia GPX reale e bollettino valanghe ufficiale per area.",
};

export default function Home({ searchParams }) {
  const focusRoute = searchParams?.route || null;
  return (
    <div>
      {/* La striscia dei giorni passa come prop invece che come children:
          nel chrome 1a vive DENTRO il dock in basso, insieme a legenda e
          timeline, non come sesto elemento absolute per conto suo. */}
      <MapView fullscreen focusRoute={focusRoute} days={<DayStrip />}>
        <div className="mapcta">
          <MapSearch />
          <a href="/itinerari" className="primary">Itinerari →</a>
          <a href="/planner">Pianifica gita</a>
        </div>
      </MapView>
      <p className="disclaimer" style={{ marginTop: 14 }}>
        Supporto alla decisione, non una raccomandazione. Il bollettino valanghe ufficiale
        (AINEVA) prevale sempre. Mappa © CARTO / OpenTopoMap / OpenStreetMap contributors ·
        radar © RainViewer · vento © Open-Meteo · pendenze: elaborazione propria da
        Copernicus DEM © ESA (30 m, indicative: la risoluzione non vede canali e rocce —
        la valutazione del terreno resta tua).
      </p>
    </div>
  );
}
