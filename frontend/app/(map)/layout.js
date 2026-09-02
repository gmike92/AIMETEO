"use client";
// Guscio condiviso da "/", "/itinerari", "/falesie" e "/planner" (route
// group — non cambia gli URL): la mappa vive QUI, non nelle singole pagine,
// così non si smonta/rimonta (niente Leaflet ricreato da zero, niente
// griglia meteo riscaricata) quando si passa da una all'altra — resta
// sempre la stessa istanza, le pagine cambiano solo cosa ci sta sopra
// (vedi OverlayPanel.js per Itinerari/Falesie/Planner; "/" non ne usa uno,
// resta la sola barra di ricerca com'era prima).
import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams, usePathname } from "next/navigation";
import MapView from "../mappa/MapView";
import { DayStrip, MapSearch } from "../components/MapOverlay";
import { useSettings } from "../components/SettingsProvider";

// useSearchParams() forza il bailout a client-side rendering per chiunque
// lo chiami, e Next lo tratta come un errore di build (non un semplice
// warning) se chi lo chiama non è dentro una Suspense — per questo il vero
// corpo del layout è isolato in MapShellInner, con MapShellLayout che fa
// solo da confine Suspense. fallback:null va bene qui: la mappa è comunque
// interattiva solo lato client, non c'è nulla di significativo da
// prerenderizzare al posto suo.
function MapShellInner({ children }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const focusRoute = searchParams.get("route");
  const focusCrag = searchParams.get("crag");
  // Impostazioni → Preferenze → "Pannelli rapidi": quali di questi tre
  // scorciatoie offrire qui — non toglie il pannello (resta raggiungibile
  // da SiteNav in alto), solo la scorciatoia accanto alla ricerca.
  const { settings } = useSettings();

  return (
    <MapView fullscreen focusRoute={focusRoute} focusCrag={focusCrag} days={<DayStrip />}>
      {/* Ricerca + Itinerari/Falesie/Pianifica: qui nel guscio persistente,
          non nella pagina "/" (com'era prima) — così restano visibili e
          cliccabili ANCHE quando un pannello (Itinerari/Falesie/Pianifica) è
          aperto, invece di sparire con la pagina che li rendeva. Il link
          attivo mostra lo stato "selezionato" (className "on") e un secondo
          click torna a "/" invece di restare fermo sulla stessa pagina —
          stesso pattern toggle già usato in SiteNav.js per le stesse tre voci. */}
      <div className="mapcta">
        <MapSearch />
        {settings.visibleMapCta.includes("itinerari") && (
          <Link
            href={pathname === "/itinerari" ? "/" : "/itinerari"}
            className={pathname === "/itinerari" ? "on" : ""}
            aria-pressed={pathname === "/itinerari"}
          >
            Itinerari
          </Link>
        )}
        {settings.visibleMapCta.includes("falesie") && (
          <Link
            href={pathname === "/falesie" ? "/" : "/falesie"}
            className={pathname === "/falesie" ? "on" : ""}
            aria-pressed={pathname === "/falesie"}
          >
            Falesie
          </Link>
        )}
        {settings.visibleMapCta.includes("planner") && (
          <Link
            href={pathname === "/planner" ? "/" : "/planner"}
            className={pathname === "/planner" ? "on" : ""}
            aria-pressed={pathname === "/planner"}
          >
            Pianifica gita
          </Link>
        )}
      </div>
      {children}
    </MapView>
  );
}

export default function MapShellLayout({ children }) {
  return (
    <Suspense fallback={null}>
      <MapShellInner>{children}</MapShellInner>
    </Suspense>
  );
}
