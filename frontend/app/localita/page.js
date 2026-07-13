"use client";
// Cerca una località → meteo della settimana + escursioni e falesie vicine.
// L'idea: "dove abiti (o dove vai) → cosa puoi fare e quando".
import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";

function dayLabel(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", {
    weekday: "short", day: "numeric",
  });
}
function scoreColor(p) {
  if (p >= 80) return "var(--accent2)";
  if (p >= 55) return "var(--warn)";
  return "var(--danger)";
}

export default function Localita() {
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState(null);
  const [sel, setSel] = useState(null);
  const [week, setWeek] = useState(null);
  const [near, setNear] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const search = async (e) => {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true); setError(null); setPlaces(null); setSel(null);
    setWeek(null); setNear(null);
    try {
      const r = await fetch(`${API_BASE}/localita/search?q=${encodeURIComponent(q.trim())}`);
      if (!r.ok) throw new Error((await r.json()).detail || r.status);
      const list = await r.json();
      setPlaces(list);
      if (list.length === 1) pick(list[0]);
    } catch (err) { setError(String(err.message || err)); }
    finally { setBusy(false); }
  };

  const pick = async (p) => {
    setSel(p); setWeek(null); setNear(null); setError(null);
    try {
      const ele = p.elevation_m ?? 0;
      const [w, n] = await Promise.all([
        fetch(`${API_BASE}/localita/settimana?lat=${p.lat}&lon=${p.lon}&ele=${ele}`),
        fetch(`${API_BASE}/localita/vicino?lat=${p.lat}&lon=${p.lon}`),
      ]);
      if (w.ok) setWeek(await w.json());
      if (n.ok) setNear(await n.json());
      if (!w.ok && !n.ok) setError("Dati non disponibili per questa località.");
    } catch (err) { setError(String(err.message || err)); }
  };

  // link condivisibile: /localita?q=vezza+d'oglio → cerca subito
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const qs = sp.get("q");
    if (qs) { setQ(qs); setTimeout(() => document.getElementById("loc-form")?.requestSubmit(), 0); }
  }, []);

  return (
    <div>
      <span className="eyebrow">cerca</span>
      <h1>La tua <em>località</em>.</h1>
      <p className="sub">
        Cerca un paese di montagna: ti diciamo com'è la settimana e cosa c'è
        da fare nei dintorni — sentieri con traccia reale e falesie.
      </p>

      <form id="loc-form" onSubmit={search} className="panel"
        style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          placeholder="es. Vezza d'Oglio, Ponte di Legno, Cortina…"
          value={q} onChange={(e) => setQ(e.target.value)}
          style={{ margin: 0 }}
        />
        <button className="btn" type="submit" disabled={busy}>
          {busy ? "Cerco…" : "Cerca"}
        </button>
      </form>

      {error && <p className="err">{error}</p>}

      {places && places.length === 0 && (
        <p className="note">Nessuna località trovata per «{q}».</p>
      )}
      {places && places.length > 1 && !sel && (
        <div className="grid">
          {places.map((p, i) => (
            <button key={i} className="card" onClick={() => pick(p)}
              style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}>
              <h3>{p.name}</h3>
              <div className="meta">
                {p.admin && <span>{p.admin}</span>}
                {p.elevation_m != null && <span>{p.elevation_m} m</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {sel && (
        <>
          <h2>{sel.name}{sel.elevation_m != null ? ` · ${sel.elevation_m} m` : ""}</h2>

          {week && (
            <div className="panel">
              <span className="eyebrow">la settimana</span>
              <div className="stats" style={{ marginBottom: 0 }}>
                {week.giorni.map((g) => (
                  <div className="stat" key={g.data}>
                    <div className="k">{dayLabel(g.data)}</div>
                    <div className="v" style={{ color: scoreColor(g.punteggio) }}>
                      {g.punteggio}
                    </div>
                    <div className="k" style={{ textTransform: "none", letterSpacing: 0 }}>
                      {g.temp_min_c}°/{g.temp_max_c}° · {g.precip_mm > 0 ? `${g.precip_mm} mm` : "asciutto"}
                    </div>
                  </div>
                ))}
              </div>
              <p className="note" style={{ opacity: 0.75 }}>
                Punteggio 0–100 (pioggia, vento, nuvole, freddo). Fonte: {week.source}
                {week.source === "mock" ? " (dati dimostrativi)" : ""}.
              </p>
            </div>
          )}

          <h2>Nei dintorni</h2>
          {near === null && <p className="loading">Cerco itinerari e falesie…</p>}
          {near && near.length === 0 && (
            <p className="note">
              Niente nel nostro database entro 25 km — per ora. Le aree crescono
              con la curatela: se conosci i sentieri di zona, scrivici.
            </p>
          )}
          {near && near.length > 0 && (
            <div className="grid">
              {near.map((x) => (
                <a className="card" key={`${x.kind}-${x.slug}`}
                  href={x.kind === "itinerario" ? `/routes/${x.slug}` : "/falesie"}>
                  <h3>{x.name}</h3>
                  <div className="meta">
                    <span className="pill">{x.kind}</span>
                    <span>{x.distance_km} km</span>
                    {x.ele_m != null && <span>{x.ele_m} m</span>}
                    {x.diff_grade && <span>diff. {x.diff_grade}</span>}
                    {x.aspect && <span>parete {x.aspect}</span>}
                  </div>
                </a>
              ))}
            </div>
          )}
        </>
      )}

      <p className="disclaimer">
        Distanze in linea d'aria dal centro della località. Geocoding: Open-Meteo.
      </p>
    </div>
  );
}
