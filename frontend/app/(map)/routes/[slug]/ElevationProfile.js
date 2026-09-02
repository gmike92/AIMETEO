// Elevation profile — pure server-rendered SVG from the route's REAL ingested
// track points (haversine distance + <ele>). No chart library, no client JS.
const R = 6371000;
function hav(a, b) {
  const [la1, lo1, la2, lo2] = [a.lat, a.lon, b.lat, b.lon].map((d) => (d * Math.PI) / 180);
  const h =
    Math.sin((la2 - la1) / 2) ** 2 +
    Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export default function ElevationProfile({ trackPoints }) {
  const pts = (trackPoints || []).filter((p) => p.lat != null && p.ele != null);
  if (pts.length < 5) return null;

  let dist = 0;
  const series = pts.map((p, i) => {
    if (i > 0) dist += hav(pts[i - 1], p);
    return { d: dist, e: p.ele };
  });
  const totalKm = dist / 1000;
  const eMin = Math.min(...series.map((s) => s.e));
  const eMax = Math.max(...series.map((s) => s.e));
  const pad = Math.max(40, (eMax - eMin) * 0.08);
  const [W, H, L, B] = [720, 220, 52, 26]; // canvas, left/bottom axis space
  const x = (d) => L + (d / dist) * (W - L - 10);
  const y = (e) => (H - B) - ((e - (eMin - pad)) / (eMax + pad - (eMin - pad))) * (H - B - 12);

  const line = series.map((s, i) => `${i ? "L" : "M"}${x(s.d).toFixed(1)},${y(s.e).toFixed(1)}`).join(" ");
  const area = `${line} L${x(dist).toFixed(1)},${H - B} L${L},${H - B} Z`;

  // Horizontal gridlines at round elevations
  const step = eMax - eMin > 1500 ? 500 : eMax - eMin > 600 ? 250 : 100;
  const gridlines = [];
  for (let e = Math.ceil(eMin / step) * step; e <= eMax; e += step) gridlines.push(e);
  // Distance ticks every ~1/4
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * totalKm);

  return (
    <div className="panel" style={{ padding: "18px 18px 10px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <strong style={{ fontSize: 14 }}>Profilo altimetrico</strong>
        <span className="note" style={{ margin: 0 }}>
          {totalKm.toFixed(1)} km · {Math.round(eMin)}–{Math.round(eMax)} m
        </span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", marginTop: 8 }}
        role="img"
        aria-label={`Profilo altimetrico: ${totalKm.toFixed(1)} km, da ${Math.round(series[0].e)} a ${Math.round(eMax)} metri`}
      >
        {gridlines.map((e) => (
          <g key={e}>
            <line x1={L} y1={y(e)} x2={W - 10} y2={y(e)} stroke="rgba(148,180,208,.14)" strokeDasharray="3,5" />
            <text x={L - 6} y={y(e) + 3.5} textAnchor="end" fontSize="10.5" fill="#5c7186">{e}</text>
          </g>
        ))}
        {ticks.map((t, i) => (
          <text key={i} x={x(t * 1000)} y={H - 8} textAnchor={i === 0 ? "start" : i === 4 ? "end" : "middle"} fontSize="10.5" fill="#5c7186">
            {t.toFixed(t >= 10 ? 0 : 1)} km
          </text>
        ))}
        <path d={area} fill="rgba(56,189,248,.14)" stroke="none" />
        <path d={line} fill="none" stroke="#38bdf8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(0)} cy={y(series[0].e)} r="3.5" fill="#5eead4" stroke="#0b1722" strokeWidth="1.5" />
        <circle cx={x(dist)} cy={y(series[series.length - 1].e)} r="3.5" fill="#38bdf8" stroke="#0b1722" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
