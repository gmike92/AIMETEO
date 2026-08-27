// LANDING = the map, Windy-style. Full-viewport interactive map with wind
// particles, radar timeline and route markers; everything else lives on
// /itinerari and /planner. MapView itself now lives in layout.js (route
// group "(map)", persists across / , /itinerari, /falesie, /planner) —
// this page only adds the search bar + CTA that belong on the pure map view.
import Link from "next/link";
import { MapSearch } from "../components/MapOverlay";

export const metadata = {
  title: "Zerotermico — Il meteo alla tua quota.",
  description:
    "Mappa meteo interattiva della montagna italiana: vento animato, radar precipitazioni, itinerari con traccia GPX reale e bollettino valanghe ufficiale per area.",
};

export default function Home() {
  return (
    <div className="mapcta">
      <MapSearch />
      <Link href="/itinerari">Itinerari</Link>
      <Link href="/planner">Pianifica gita</Link>
    </div>
  );
}
