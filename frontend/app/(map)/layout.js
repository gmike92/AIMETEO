"use client";
// Guscio condiviso da "/", "/itinerari", "/falesie" e "/planner" (route
// group — non cambia gli URL): la mappa vive QUI, non nelle singole pagine,
// così non si smonta/rimonta (niente Leaflet ricreato da zero, niente
// griglia meteo riscaricata) quando si passa da una all'altra — resta
// sempre la stessa istanza, le pagine cambiano solo cosa ci sta sopra
// (vedi OverlayPanel.js per Itinerari/Falesie/Planner; "/" non ne usa uno,
// resta la sola barra di ricerca com'era prima).
import { useSearchParams } from "next/navigation";
import MapView from "../mappa/MapView";
import { DayStrip } from "../components/MapOverlay";

export default function MapShellLayout({ children }) {
  const searchParams = useSearchParams();
  const focusRoute = searchParams.get("route");
  const focusCrag = searchParams.get("crag");

  return (
    <MapView fullscreen focusRoute={focusRoute} focusCrag={focusCrag} days={<DayStrip />}>
      {children}
    </MapView>
  );
}
