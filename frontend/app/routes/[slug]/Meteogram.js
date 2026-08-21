"use client";
// Meteogram — 7-day hourly chart at the route's REAL trailhead (Open-Meteo:
// temperature, precipitation, wind, freezing level). Client-only (fetch);
// renders nothing without coordinates, shows an honest message when offline.
import { useEffect, useState } from "react";

const W = 720, H = 240, L = 46, RGT = 46, B = 30, TOP = 14;

export default function Meteogram({ lat, lon, name }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (lat == null || lon == null) return;
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&hourly=temperature_2m,precipitation,wind_speed_10m,freezing_level_height` +
      `&forecast_days=7&timezone=Europe%2FRome`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => setData(d.hourly))
      .catch(() => setErr("Meteogramma non disponibile (offline o servizio non raggiungibile)."));
  }, [lat, lon]);

  if (lat == null || lon == null) return null;
  if (err) return <p className="note">{err}</p>;
  if (!data) return <p className="note">Carico il meteogramma…</p>;

  const n = data.time.length;
  const temps = data.temperature_2m;
  const prec = data.precipitation;
  const frz = data.freezing_level_height;
  const tMin = Math.min(...temps), tMax = Math.max(...temps);
  const fMax = Math.max(...frz, 3000);
  const pMax = Math.max(...prec, 2);
  const x = (i) => L + (i / (n - 1)) * (W - L - RGT);
  const yT = (t) => (H - B) - ((t - tMin) / (tMax - tMin || 1)) * (H - B - TOP);
  const yF = (f) => (H - B) - (f / fMax) * (H - B - TOP);
  const yP = (p) => ((p / pMax) * (H - B - TOP)) * 0.55;

  const tLine = temps.map((t, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${yT(t).toFixed(1)}`).join(" ");
  const fLine = frz.map((f, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${yF(f).toFixed(1)}`).join(" ");
  const days = [];
  for (let i = 0; i < n; i += 24) days.push({ i, label: new Date(data.time[i]).toLocaleDateString("it-IT", { weekday: "short" }) });

  return (
    <div className="panel" style={{ padding: "18px 18px 10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 6 }}>
        <strong style={{ fontSize: 14 }}>Meteogramma 7 giorni — {name}</strong>
        <span className="note" style={{ margin: 0, display: "flex", gap: 12 }}>
          <span style={{ color: "#38bdf8" }}>— temperatura</span>
          <span style={{ color: "#5eead4" }}>— zero termico</span>
          <span style={{ color: "#7f9cf5" }}>▮ precipitazioni</span>
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", marginTop: 8 }}
           role="img" aria-label={`Meteogramma 7 giorni: temperatura da ${Math.round(tMin)} a ${Math.round(tMax)} gradi`}>
        {days.map((d) => (
          <g key={d.i}>
            <line x1={x(d.i)} y1={TOP} x2={x(d.i)} y2={H - B} stroke="rgba(148,180,208,.12)" />
            <text x={x(d.i) + 4} y={H - 10} fontSize="10.5" fill="#5c7186">{d.label}</text>
          </g>
        ))}
        {[tMin, (tMin + tMax) / 2, tMax].map((t, k) => (
          <text key={k} x={L - 6} y={yT(t) + 3.5} textAnchor="end" fontSize="10.5" fill="#38bdf8">{Math.round(t)}°</text>
        ))}
        {[0, fMax / 2, fMax].map((f, k) => (
          <text key={k} x={W - RGT + 6} y={yF(f) + 3.5} fontSize="10.5" fill="#5eead4">{Math.round(f / 100) / 10}k</text>
        ))}
        {prec.map((p, i) =>
          p > 0.05 ? (
            <rect key={i} x={x(i) - 1} y={H - B - yP(p)} width="2.2" height={yP(p)} fill="rgba(127,156,245,.65)" />
          ) : null
        )}
        <path d={fLine} fill="none" stroke="#5eead4" strokeWidth="1.6" strokeDasharray="5,4" opacity=".9" />
        <path d={tLine} fill="none" stroke="#38bdf8" strokeWidth="2.2" strokeLinejoin="round" />
        <line x1={L} y1={H - B} x2={W - RGT} y2={H - B} stroke="rgba(148,180,208,.3)" />
      </svg>
      <p className="note" style={{ marginTop: 4 }}>
        Modello Open-Meteo al punto di partenza ({Number(lat).toFixed(3)}, {Number(lon).toFixed(3)}).
        Dati indicativi: per la decisione finale contano bollettino e osservazione sul posto.
      </p>
    </div>
  );
}
