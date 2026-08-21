"use client";
// Overlay weather-app sopra la mappa Windy-style:
// - search bar → /localita?q=… (il primo gesto di chiunque apra l'app)
// - striscia dei prossimi giorni al CENTRO MAPPA (si aggiorna quando ti sposti)
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import { wxIcon, scoreColor } from "@/lib/wx";

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
  const [week, setWeek] = useState(null);
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
      clearTimeout(timer.current);
      timer.current = setTimeout(() => load(e.detail.lat, e.detail.lng), 700);
    };
    window.addEventListener("zt-map-center", onCenter);
    return () => {
      window.removeEventListener("zt-map-center", onCenter);
      clearTimeout(timer.current);
      ctrl.current?.abort();
    };
  }, []);

  if (!week) return null;
  return (
    <div className="daystrip" role="list"
      title={`Prossimi giorni al centro della mappa · fonte ${week.source}`}>
      {week.giorni.map((g) => (
        <div className="daychip" role="listitem" key={g.data}>
          <span className="d">
            {new Date(`${g.data}T12:00:00`).toLocaleDateString("it-IT", { weekday: "short" })}
          </span>
          <span className="i" aria-hidden>
            {wxIcon({ precip_mm: g.precip_mm, nuvole_pct: g.nuvole_pct })}
          </span>
          <span className="t">{Math.round(g.temp_max_c)}°</span>
          <span className="s" style={{ background: scoreColor(g.punteggio) }} />
        </div>
      ))}
      {week.source === "mock" && <span className="demo">demo</span>}
    </div>
  );
}
