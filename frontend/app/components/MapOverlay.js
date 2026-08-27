"use client";
// Overlay weather-app sopra la mappa Windy-style:
// - search bar → /localita?q=… (il primo gesto di chiunque apra l'app)
// - striscia dei prossimi giorni per un riferimento esplicito (casa o
//   l'ultimo spillo piazzato con un click sulla mappa — vedi MapView.js;
//   NON segue più il centro mappa a ogni pan, solo un evento deliberato)
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import { scoreColor } from "@/lib/wx";
import { WxIcon, Icon } from "./WxIcon";
import { useUnits } from "@/lib/units";

// Icona + etichetta di ripiego (quando non c'è un nome, o l'utente ha
// scambiato nome↔coordinate col click sul badge) per ciascuna sorgente del
// riferimento meteo — vedi MapView.js per dove ognuna viene emessa.
const SOURCE_META = {
  home: { icon: Icon.Home, fallback: "Home" },
  route: { icon: Icon.Route, fallback: "Itinerario" },
  crag: { icon: Icon.Crag, fallback: "Falesia" },
  pin: { icon: Icon.Pin, fallback: "Punto" },
};

export function MapSearch() {
  const [q, setQ] = useState("");
  return (
    <form
      className="mapsearch"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim().length >= 2)
          window.location.href = `/localita?q=${encodeURIComponent(q.trim())}`;
      }}
    >
      <input
        type="search"
        placeholder="Cerca località…"
        aria-label="Cerca località"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
    </form>
  );
}

export function DayStrip() {
  const units = useUnits();
  const [week, setWeek] = useState(null);
  const [loc, setLoc] = useState(null); // { lat, lng, source: "home"|"pin", name? }
  // Un click sul badge scambia nome ↔ coordinate, ciclicamente — reimpostato
  // ogni volta che il riferimento cambia (nuovo click/casa), mai "congelato"
  // sulla scelta precedente per un punto diverso.
  const [showCoords, setShowCoords] = useState(false);
  const timer = useRef(null);
  const ctrl = useRef(null);

  useEffect(() => {
    const load = (lat, lon) => {
      ctrl.current?.abort();
      const ac = new AbortController();
      ctrl.current = ac;
      fetch(`${API_BASE}/localita/settimana?lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&ele=0`,
        { signal: ac.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((w) => w && setWeek(w))
        .catch(() => {}); // niente dati → niente striscia, mai inventata
    };
    const onCenter = (e) => {
      // Il nome del centro abitato (reverse geocoding) arriva con un secondo
      // evento, stesse coordinate — vedi MapView.js: qui basta rimpiazzare
      // il loc, il fetch meteo che riparte è ridondante ma innocuo.
      const { lat, lng, source, name } = e.detail;
      setLoc((prev) => {
        if (!prev || prev.lat !== lat || prev.lng !== lng || prev.source !== source) setShowCoords(false);
        return { lat, lng, source, name };
      });
      clearTimeout(timer.current);
      timer.current = setTimeout(() => load(lat, lng), 700);
    };
    window.addEventListener("zt-map-center", onCenter);
    return () => {
      window.removeEventListener("zt-map-center", onCenter);
      clearTimeout(timer.current);
      ctrl.current?.abort();
    };
  }, []);

  if (!week || !loc) return null;
  const meta = SOURCE_META[loc.source] || SOURCE_META.pin;
  const isHome = loc.source === "home";
  const primaryLabel = isHome ? "Home" : loc.name;
  const inCoordsMode = !primaryLabel || showCoords;
  const dText = inCoordsMode ? meta.fallback : primaryLabel;
  const locTitle = inCoordsMode && primaryLabel
    ? `${primaryLabel} · clicca per il nome`
    : primaryLabel
    ? `${primaryLabel} · clicca per le coordinate`
    : `Punto scelto sulla mappa: ${loc.lat.toFixed(4)}°, ${loc.lng.toFixed(4)}°`;
  const LocIcon = meta.icon;
  return (
    <div className="daystrip tnum" role="list" title={`Prossimi giorni · fonte ${week.source}`}>
      <button
        type="button"
        className={`daychip locbadge ${!inCoordsMode && loc.name ? "haslabel" : ""}`}
        disabled={!primaryLabel}
        onClick={() => setShowCoords((v) => !v)}
        title={locTitle}
      >
        <span className="d">{dText}</span>
        <span className="i"><LocIcon size={16} /></span>
        {inCoordsMode && <span className="t">{loc.lat.toFixed(2)}°<br />{loc.lng.toFixed(2)}°</span>}
      </button>
      {week.giorni.map((g) => (
        <div className="daychip" role="listitem" key={g.data}>
          <span className="d">
            {new Date(`${g.data}T12:00:00`).toLocaleDateString("it-IT", { weekday: "short" })}
          </span>
          <span className="i">
            <WxIcon precip_mm={g.precip_mm} nuvole_pct={g.nuvole_pct} size={17} />
          </span>
          <span className="t">{units.temp(g.temp_max_c)}</span>
          <span className="s" style={{ background: scoreColor(g.punteggio) }} />
        </div>
      ))}
    </div>
  );
}
