"use client";
// Pannello a comparsa per le pagine testuali (Itinerari, Falesie, Pianifica)
// che ora vivono SOPRA la mappa persistente (vedi app/(map)/layout.js)
// invece che come pagine separate — la mappa resta visibile ai lati/sotto,
// un pulsante nella navbar (freccia ←, SiteNav.js) torna a vederla intera.
//
// L'apertura/chiusura non è un montaggio React (il pannello esiste solo
// finché la pagina che lo usa è quella attiva): qui c'è solo la classe sul
// <html> che dice al resto del chrome mappa (colonna Meteo/Attività/
// Strumenti a destra, dock in basso) di farsi da parte finché il pannello
// è aperto, altrimenti ci finirebbe sotto.
import { useEffect } from "react";

export default function OverlayPanel({ children }) {
  useEffect(() => {
    document.documentElement.classList.add("overlay-open");
    return () => document.documentElement.classList.remove("overlay-open");
  }, []);

  return (
    <div className="mapoverlay-panel">
      <div className="mapoverlay-scroll">{children}</div>
    </div>
  );
}
