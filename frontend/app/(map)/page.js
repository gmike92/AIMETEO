// LANDING = the map, Windy-style. Full-viewport interactive map with wind
// particles, radar timeline and route markers; everything else lives on
// /itinerari and /planner. MapView itself now lives in layout.js (route
// group "(map)", persists across / , /itinerari, /falesie, /planner), and
// so does the search bar + CTA (mapcta) — they need to stay visible and
// clickable even when this page isn't the active one, see layout.js.
export const metadata = {
  title: "Zerotermico — Il meteo alla tua quota.",
  description:
    "Mappa meteo interattiva della montagna italiana: vento animato, radar precipitazioni, itinerari con traccia GPX reale e bollettino valanghe ufficiale per area.",
};

export default function Home() {
  return null;
}
