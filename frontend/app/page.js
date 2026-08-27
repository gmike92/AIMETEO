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
    // La mappa è l'intera pagina, senza scroll (vedi globals.css): il
    // disclaimer che prima stava qui sotto ora vive nel pulsante "Info"
    // della mappa (MapChrome.js / MapView.js), altrimenti non sarebbe più
    // raggiungibile.
    <MapView fullscreen focusRoute={focusRoute} days={<DayStrip />}>
      <div className="mapcta">
        <MapSearch />
        <a href="/itinerari">Itinerari</a>
        <a href="/planner">Pianifica gita</a>
      </div>
    </MapView>
  );
}
