"use client";
// Windy-style map v4 — never blank on open.
// Defaults: light base (CARTO Voyager) + TEMPERATURE color field + animated
// wind particles, all live Open-Meteo model data over the Alps. Radar timeline
// (RainViewer) on demand. Real GPX tracks + official-danger markers.
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

const DANGER_COLORS = { 1: "#9BC53D", 2: "#F5D547", 3: "#F49D37", 4: "#DA4167", 5: "#8B1E3F" };
// Wider grid (11×20 = 220 pts) so the color field covers the whole usable view.
const GRID = { la1: 48.2, la2: 43.2, lo1: 5.0, lo2: 16.4, dy: 0.5, dx: 0.6 };
// The map is pinned to the greater Alps: no panning into uncovered areas.
const MAX_BOUNDS = [[42.6, 3.8], [49.4, 17.6]];

// Windy-ish temperature colormap (°C → rgb)
const TEMP_STOPS = [
  [-15, [130, 87, 219]], [-8, [32, 140, 236]], [0, [80, 225, 227]],
  [8, [110, 221, 140]], [16, [252, 222, 82]], [24, [252, 150, 75]],
  [30, [245, 84, 66]], [38, [158, 22, 46]],
];
function tempColor(t) {
  if (t <= TEMP_STOPS[0][0]) return TEMP_STOPS[0][1];
  for (let i = 1; i < TEMP_STOPS.length; i++) {
    const [t1, c1] = TEMP_STOPS[i - 1];
    const [t2, c2] = TEMP_STOPS[i];
    if (t <= t2) {
      const k = (t - t1) / (t2 - t1);
      return c1.map((c, j) => Math.round(c + (c2[j] - c) * k));
    }
  }
  return TEMP_STOPS[TEMP_STOPS.length - 1][1];
}
const TEMP_GRADIENT = `linear-gradient(90deg, ${TEMP_STOPS.map(
  ([, c]) => `rgb(${c.join(",")})`
).join(",")})`;

async function fetchGrid() {
  const lats = [];
  const lons = [];
  for (let la = GRID.la1; la >= GRID.la2 - 1e-9; la -= GRID.dy)
    for (let lo = GRID.lo1; lo <= GRID.lo2 + 1e-9; lo += GRID.dx) {
      lats.push(la.toFixed(2));
      lons.push(lo.toFixed(2));
    }
  const ny = Math.round((GRID.la1 - GRID.la2) / GRID.dy) + 1;
  const nx = lats.length / ny;
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(",")}&longitude=${lons.join(",")}` +
    `&current=temperature_2m,wind_speed_10m,wind_direction_10m&wind_speed_unit=ms`;
  const data = await fetch(url).then((r) => r.json());
  const list = Array.isArray(data) ? data : [data];
  if (list.length !== nx * ny) throw new Error("griglia meteo incompleta");
  const u = [];
  const v = [];
  const temps = [];
  for (const p of list) {
    const s = p.current.wind_speed_10m;
    const d = (p.current.wind_direction_10m * Math.PI) / 180;
    u.push(-s * Math.sin(d));
    v.push(-s * Math.cos(d));
    temps.push(p.current.temperature_2m);
  }
  const header = {
    parameterUnit: "m.s-1", parameterCategory: 2, nx, ny,
    lo1: GRID.lo1, la1: GRID.la1, lo2: GRID.lo2, la2: GRID.la2,
    dx: GRID.dx, dy: GRID.dy, refTime: list[0]?.current?.time,
  };
  return {
    wind: [
      { header: { ...header, parameterNumber: 2 }, data: u },
      { header: { ...header, parameterNumber: 3 }, data: v },
    ],
    temps, nx, ny,
  };
}

// Bilinear-interpolated temperature field → canvas data-URL for an ImageOverlay.
function tempCanvas(temps, nx, ny) {
  const W = 560;
  const H = 320;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(W, H);
  for (let py = 0; py < H; py++) {
    const gy = (py / (H - 1)) * (ny - 1);
    const y0 = Math.floor(gy);
    const y1 = Math.min(ny - 1, y0 + 1);
    const fy = gy - y0;
    for (let px = 0; px < W; px++) {
      const gx = (px / (W - 1)) * (nx - 1);
      const x0 = Math.floor(gx);
      const x1 = Math.min(nx - 1, x0 + 1);
      const fx = gx - x0;
      const t =
        temps[y0 * nx + x0] * (1 - fx) * (1 - fy) +
        temps[y0 * nx + x1] * fx * (1 - fy) +
        temps[y1 * nx + x0] * (1 - fx) * fy +
        temps[y1 * nx + x1] * fx * fy;
      const [r, g, b] = tempColor(t);
      const i = (py * W + px) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      // Feathered edges: alpha fades to 0 in the outer 9% so the field melts
      // into the basemap instead of ending in a hard rectangle.
      const fxe = Math.min(px, W - 1 - px) / (W * 0.09);
      const fye = Math.min(py, H - 1 - py) / (H * 0.09);
      img.data[i + 3] = Math.round(255 * Math.min(1, fxe, fye));
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL();
}

// Legend gradient matching the CURRENT min→max (not the whole colormap).
function rangeGradient(tmin, tmax) {
  const stops = [];
  for (let i = 0; i <= 8; i++) {
    const c = tempColor(tmin + ((tmax - tmin) * i) / 8);
    stops.push(`rgb(${c.join(",")})`);
  }
  return `linear-gradient(90deg, ${stops.join(",")})`;
}

function popupHtml(area, route) {
  const b = area?.bulletin;
  const f = area?.forecast;
  // Avalanche block only when a bulletin is in force, or when it SHOULD be
  // verifiable and isn't (safety warning). Off-season: nothing at all.
  const danger =
    b?.status === "in_vigore"
      ? `<div style="margin:7px 0"><span style="background:${DANGER_COLORS[b.danger_level]};color:${b.danger_level >= 4 ? "#fff" : "#0b1722"};padding:2px 9px;border-radius:999px;font-weight:700;font-size:12px">Valanghe ${b.danger_level}/5</span>
         <a href="${b.source_url}" target="_blank" rel="noopener" style="margin-left:8px;font-size:12px">${b.service} →</a></div>`
      : b?.status === "non_verificabile"
      ? `<div style="margin:7px 0"><em style="font-size:12px">⚠️ Bollettino valanghe non verificabile — prudenza</em></div>`
      : "";
  const meteo = f
    ? `<div style="margin-top:7px;font-size:12.5px">0°C <b>${f.freezing_level_m} m</b> · vento ${f.wind_avg_kmh} km/h · temporali ${Math.round(f.thunderstorm_prob * 100)}%${f.source === "mock" ? " <em>(demo)</em>" : ""}</div>`
    : "";
  return `<div style="min-width:220px;line-height:1.55">
    <b style="font-size:14px">${route.name}</b><br/><span style="font-size:12px;opacity:.7">${route.activity} · ${area?.area_name || ""}</span>
    ${danger}${meteo}
    <a href="/routes/${route.slug}" style="display:inline-block;margin-top:7px;font-size:13px;font-weight:600">Scheda itinerario →</a>
  </div>`;
}

const BASES = ["chiaro", "terreno", "scuro"];

export default function MapView({ fullscreen = false, focusRoute = null, children }) {
  const mapEl = useRef(null);
  const S = useRef({});
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState("Carico la mappa…");
  const [base, setBase] = useState("chiaro");
  const [temp, setTemp] = useState(true);
  const [wind, setWind] = useState(true);
  const [radar, setRadar] = useState(false);
  const [frames, setFrames] = useState([]);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tempRange, setTempRange] = useState(null);
  const [season, setSeason] = useState(false); // true = a bulletin is in force somewhere
  const [slope, setSlope] = useState(false);
  const [hasSlope, setHasSlope] = useState(false); // tile generati? (area pilota)

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (typeof window !== "undefined") window.L = L;
        await import("leaflet-velocity");
        await import("leaflet.markercluster");
        if (dead || S.current.map) return;

        const map = L.map(mapEl.current, {
          zoomControl: false, scrollWheelZoom: true,
          fadeAnimation: true, zoomAnimation: true,
          maxBounds: MAX_BOUNDS, maxBoundsViscosity: 0.9, minZoom: 6,
        }).setView([46.1, 10.4], 7);
        L.control.zoom({ position: "topleft" }).addTo(map);
        setTimeout(() => map.invalidateSize(), 50);

        const bases = {
          chiaro: L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
            maxZoom: 18, attribution: '© <a href="https://carto.com">CARTO</a> · © OpenStreetMap',
          }),
          terreno: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
            maxZoom: 16, attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a> · © OpenStreetMap',
          }),
          scuro: L.tileLayer("https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png", {
            maxZoom: 18, attribution: '© <a href="https://carto.com">CARTO</a> · © OpenStreetMap',
          }),
        };
        bases.chiaro.addTo(map);
        S.current = { L, map, bases, radarLayers: {} };

        // Layer pendenze fatto in casa (Copernicus DEM → gdaldem): il toggle
        // appare solo se i tile sono stati generati (scripts/build_slope_tiles.py).
        fetch("/tiles/slope/12/2166/1453.png", { method: "HEAD" })
          .then((r) => !dead && setHasSlope(r.ok))
          .catch(() => {});

        // Notifica il centro mappa agli overlay (striscia giorni weather-app).
        const emitCenter = () =>
          window.dispatchEvent(new CustomEvent("zt-map-center", { detail: map.getCenter() }));
        map.on("moveend", emitCenter);
        setTimeout(emitCenter, 400);

        // Live model grid (temperature + wind) — the map is never blank.
        try {
          setMsg("Carico temperatura e vento…");
          S.current.grid = await fetchGrid();
          const ts = S.current.grid.temps;
          if (!dead) setTempRange([Math.min(...ts), Math.max(...ts)]);
        } catch {
          if (!dead) { setTemp(false); setWind(false); setMsg("Dati meteo live non raggiungibili."); }
        }

        const [conds, routes] = await Promise.all([
          fetch(`${API_BASE}/conditions`).then((r) => (r.ok ? r.json() : [])),
          fetch(`${API_BASE}/routes`).then((r) => (r.ok ? r.json() : [])),
        ]);
        const byArea = Object.fromEntries(conds.map((a) => [a.area_id, a]));
        const anyBulletin = conds.some((a) => a?.bulletin?.status === "in_vigore");
        if (!dead) setSeason(anyBulletin);

        // Marker clustering: grouped pins show a count at wide zoom, colored
        // by the worst avalanche danger among the routes they hold, and break
        // apart into individual markers as you zoom in (state-of-the-art map UX).
        const clusters = L.markerClusterGroup({
          maxClusterRadius: 55,
          disableClusteringAtZoom: 15,
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          iconCreateFunction: (cluster) => {
            const children = cluster.getAllChildMarkers();
            const maxDanger = Math.max(0, ...children.map((c) => c.options.dangerLevel || 0));
            const color = maxDanger > 0 ? DANGER_COLORS[maxDanger] : "#38bdf8";
            return L.divIcon({
              className: "",
              html: `<span class="rt-cluster" style="--c:${color}">${cluster.getChildCount()}</span>`,
              iconSize: [38, 38],
              iconAnchor: [19, 19],
            });
          },
        });
        S.current.clusters = clusters;
        let focusTarget = null; // { marker, pts } of the route to open on load
        for (const r of routes) {
          if (r.start_lat == null) continue;
          const area = byArea[r.area_id];
          // Danger color only when a bulletin is actually in force.
          const dangerLevel = area?.bulletin?.status === "in_vigore" ? area.bulletin.danger_level : 0;
          const color = dangerLevel > 0 ? DANGER_COLORS[dangerLevel] || "#38bdf8" : "#38bdf8";
          const detail = await fetch(`${API_BASE}/routes/${encodeURIComponent(r.slug)}`)
            .then((x) => (x.ok ? x.json() : null)).catch(() => null);
          const pts = (detail?.track_points || []).map((p) => [p.lat, p.lon]);
          if (pts.length > 1) {
            L.polyline(pts, { color: "#0b1722", weight: 5, opacity: 0.25 }).addTo(map);
            L.polyline(pts, { color: "#1272d3", weight: 2.5, opacity: 0.95 }).addTo(map);
          }
          const m = L.marker([r.start_lat, r.start_lon], {
            dangerLevel,
            icon: L.divIcon({
              className: "",
              html: `<span class="rt-dot" style="--c:${color}"></span>`,
              iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10],
            }),
          });
          m.bindTooltip(r.name, { direction: "top", offset: [0, -10] });
          m.bindPopup(popupHtml(area, r));
          clusters.addLayer(m);
          if (focusRoute && r.slug === focusRoute) focusTarget = { marker: m, pts };
        }
        map.addLayer(clusters);

        // Deep link: /?route=<slug> → zoom to that track and open its popup
        // (zoomToShowLayer breaks the marker out of its cluster first).
        if (focusTarget) {
          if (focusTarget.pts.length > 1) {
            map.fitBounds(focusTarget.pts, { padding: [70, 70], maxZoom: 13 });
            setTimeout(() => focusTarget.marker.openPopup(), 350);
          } else {
            clusters.zoomToShowLayer(focusTarget.marker, () => focusTarget.marker.openPopup());
          }
        }

        try {
          const meta = await fetch("https://api.rainviewer.com/public/weather-maps.json").then((r) => r.json());
          const all = [...(meta?.radar?.past || []), ...(meta?.radar?.nowcast || [])];
          S.current.radarHost = meta?.host;
          S.current.frames = all;
          if (!dead) {
            setFrames(all);
            setFrameIdx(Math.max(0, (meta?.radar?.past || []).length - 1));
          }
        } catch {}

        if (!dead) {
          setReady(true);
          // Clear only progress messages — keep warnings (e.g. live data down).
          setMsg((m) => (m.startsWith("Carico") ? "" : m));
        }
      } catch (e) {
        if (!dead) setMsg(`Mappa non disponibile: ${e.message}`);
      }
    })();
    const onResize = () => S.current.map?.invalidateSize();
    window.addEventListener("resize", onResize);
    return () => {
      dead = true;
      window.removeEventListener("resize", onResize);
      clearInterval(S.current.timer);
      if (S.current.map) S.current.map.remove();
      S.current = {};
    };
  }, []);

  useEffect(() => {
    const { map, bases } = S.current;
    if (!map) return;
    BASES.forEach((k) => (k === base ? bases[k].addTo(map) : map.removeLayer(bases[k])));
  }, [base, ready]);

  // temperature color field
  useEffect(() => {
    const { L, map, grid } = S.current;
    if (!map) return;
    if (S.current.tempOverlay) {
      map.removeLayer(S.current.tempOverlay);
      S.current.tempOverlay = null;
    }
    if (temp && grid) {
      S.current.tempOverlay = L.imageOverlay(
        tempCanvas(grid.temps, grid.nx, grid.ny),
        [[GRID.la2, GRID.lo1], [GRID.la1, GRID.lo2]],
        { opacity: 0.55, interactive: false }
      ).addTo(map);
      S.current.tempOverlay.bringToFront?.();
    }
  }, [temp, ready]);

  // slope layer fatto in casa (statico, viaggia col frontend: zero dipendenze)
  useEffect(() => {
    const { L, map } = S.current;
    if (!map) return;
    if (S.current.slopeLayer) {
      map.removeLayer(S.current.slopeLayer);
      S.current.slopeLayer = null;
    }
    if (slope) {
      S.current.slopeLayer = L.tileLayer("/tiles/slope/{z}/{x}/{y}.png", {
        opacity: 0.62, maxNativeZoom: 15, minZoom: 8,
        attribution: "pendenze: Copernicus DEM © ESA — elaborazione Zerotermico",
        errorTileUrl:
          "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
      }).addTo(map);
    }
  }, [slope, ready]);

  // wind particles (color scale adapts to what's beneath)
  useEffect(() => {
    const { L, map, grid } = S.current;
    if (!map) return;
    if (S.current.velocity) {
      map.removeLayer(S.current.velocity);
      S.current.velocity = null;
    }
    if (!wind || !grid) return;
    const scale =
      base === "scuro" || temp
        ? ["#ffffff", "#f0f4ff", "#dbe6ff", "#c3d5ff", "#a8c2ff", "#8facff"]
        : ["#33536f", "#2b618f", "#2470ae", "#1d7fce", "#158eee", "#0e9dff"];
    S.current.velocity = L.velocityLayer({
      data: grid.wind,
      displayValues: true,
      displayOptions: {
        velocityType: "vento 10 m", position: "bottomright",
        emptyString: "", speedUnit: "m/s",
      },
      minVelocity: 0, maxVelocity: 16, velocityScale: 0.008,
      particleMultiplier: 1 / 260, lineWidth: 1.6,
      colorScale: scale,
    }).addTo(map);
  }, [wind, temp, base, ready]);

  useEffect(() => {
    const { L, map, frames: fr, radarHost, radarLayers } = S.current;
    if (!map || !fr?.length) return;
    if (!radar) {
      Object.values(radarLayers).forEach((l) => map.removeLayer(l));
      S.current.radarLayers = {};
      setPlaying(false);
      return;
    }
    const f = fr[frameIdx];
    if (!f) return;
    if (!radarLayers[f.path]) {
      radarLayers[f.path] = L.tileLayer(`${radarHost}${f.path}/256/{z}/{x}/{y}/6/1_1.png`, {
        opacity: 0, attribution: 'radar © <a href="https://www.rainviewer.com">RainViewer</a>',
      }).addTo(map);
    }
    Object.entries(radarLayers).forEach(([path, layer]) =>
      layer.setOpacity(path === f.path ? 0.7 : 0)
    );
  }, [radar, frameIdx, frames]);

  useEffect(() => {
    clearInterval(S.current.timer);
    if (playing && radar && frames.length) {
      S.current.timer = setInterval(() => setFrameIdx((i) => (i + 1) % frames.length), 600);
    }
    return () => clearInterval(S.current.timer);
  }, [playing, radar, frames]);

  const frameTime = frames[frameIdx]
    ? new Date(frames[frameIdx].time * 1000).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
    : "";
  const isForecast = frames[frameIdx] && frames[frameIdx].time * 1000 > Date.now();

  return (
    <div className={`mapshell ${fullscreen ? "full" : ""}`}>
      <div ref={mapEl} style={{ position: "absolute", inset: 0 }} />
      {children}

      <div className="mapctl">
        <button className={`mapbtn ${temp ? "on" : ""}`} onClick={() => setTemp(!temp)} disabled={!ready}>
          <span className="dot" />Temperatura
        </button>
        <button className={`mapbtn ${wind ? "on" : ""}`} onClick={() => setWind(!wind)} disabled={!ready}>
          <span className="dot" />Vento
        </button>
        <button className={`mapbtn ${radar ? "on" : ""}`} onClick={() => setRadar(!radar)} disabled={!ready || !frames.length}>
          <span className="dot" />Pioggia
        </button>
        {hasSlope && (
          <button className={`mapbtn ${slope ? "on" : ""}`} onClick={() => setSlope(!slope)}
            disabled={!ready}
            title="Pendenze dal DEM Copernicus: giallo ≥30° · arancio ≥35° · rosso ≥40° · viola ≥45° (area pilota)">
            <span className="dot" />Pendenze
          </button>
        )}
        <button className="mapbtn" onClick={() => setBase(BASES[(BASES.indexOf(base) + 1) % BASES.length])} disabled={!ready}>
          {base === "chiaro" ? "Chiaro" : base === "terreno" ? "Terreno" : "Scuro"} ↺
        </button>
      </div>

      {radar && frames.length > 0 && (
        <div className="maptimeline">
          <button className="playbtn" onClick={() => setPlaying(!playing)} aria-label={playing ? "Pausa" : "Play"}>
            {playing ? "❚❚" : "▶"}
          </button>
          <input
            type="range" min={0} max={frames.length - 1} value={frameIdx}
            onChange={(e) => setFrameIdx(Number(e.target.value))}
            aria-label="Timeline radar"
          />
          <span className="t">{frameTime}{isForecast ? " · previsto" : ""}</span>
        </div>
      )}

      {((temp && tempRange) || season) && (
      <div className="maplegend" style={{ flexDirection: "column", alignItems: "stretch", gap: 6 }}>
        {temp && tempRange && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span>{Math.round(tempRange[0])}°</span>
            <span style={{ flex: 1, height: 8, borderRadius: 4, background: rangeGradient(tempRange[0], tempRange[1]), minWidth: 110, display: "inline-block" }} />
            <span>{Math.round(tempRange[1])}°</span>
          </div>
        )}
        {season && (
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <span>Valanghe</span>
            {[1, 2, 3, 4, 5].map((d) => (
              <span key={d} style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                <i style={{ background: DANGER_COLORS[d] }} />{d}
              </span>
            ))}
          </div>
        )}
      </div>
      )}

      {msg && <div className="mapmsg">{msg}</div>}
    </div>
  );
}
