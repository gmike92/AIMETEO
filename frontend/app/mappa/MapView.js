"use client";
// Windy-style map v4 — never blank on open.
// Defaults: light base (CARTO Voyager) + TEMPERATURE color field + animated
// wind particles, all live Open-Meteo model data over the Alps. Radar timeline
// (RainViewer) on demand. Real GPX tracks + official-danger markers.
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

const DANGER_COLORS = { 1: "#9BC53D", 2: "#F5D547", 3: "#F49D37", 4: "#DA4167", 5: "#8B1E3F" };
// Fixed point budget (~200 pts) resampled from the CURRENT map bounds on every
// pan/zoom (debounced) — the weather field always covers whatever is on
// screen, anywhere in the world, not just a hardcoded Alps box.
const GRID_POINTS = { nx: 18, ny: 11 };
const MIN_SPAN_DEG = 0.02;

function normalizeLon(lon) {
  return ((lon + 180) % 360 + 360) % 360 - 180;
}

// Solar elevation (°) for a point/time — standard low-precision solar
// position formula (NOAA/SPA-derived, ~0.5° accuracy), pure client-side
// astronomy, no API. Used for the real (not synthetic) day/night layer.
function solarElevationDeg(lat, lon, date) {
  const rad = Math.PI / 180;
  const n = (date.getTime() - Date.UTC(2000, 0, 1, 12, 0, 0)) / 86400000;
  const L = ((280.46 + 0.9856474 * n) % 360 + 360) % 360;
  const g = (((357.528 + 0.9856003 * n) % 360 + 360) % 360) * rad;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const epsilon = 23.439 * rad;
  const decl = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const ra = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) / rad;
  const gmst = ((280.46061837 + 360.98564736629 * n) % 360 + 360) % 360;
  const hourAngle = (((gmst + lon - ra + 540) % 360) + 360) % 360 - 180;
  const sinEl =
    Math.sin(lat * rad) * Math.sin(decl) +
    Math.cos(lat * rad) * Math.cos(decl) * Math.cos(hourAngle * rad);
  return Math.asin(Math.max(-1, Math.min(1, sinEl))) / rad;
}

// Night-shading value (0 = full daylight, 1 = fully dark past civil twilight).
// Coarse-grid version — only used to decide the "whole view is day/night"
// note (see sunCanvasDirect below for the actual rendered layer, which needs
// far more resolution than the shared weather grid to look non-blocky).
function sunNightValues(g, date) {
  const vals = [];
  for (let iy = 0; iy < g.ny; iy++) {
    const la = g.la1 - iy * g.dy;
    for (let ix = 0; ix < g.nx; ix++) {
      const lo = normalizeLon(g.lo1 + ix * g.dx);
      const el = solarElevationDeg(la, lo, date);
      vals.push(el >= 0 ? 0 : el <= -6 ? 1 : -el / 6);
    }
  }
  return vals;
}

// Aurora forecast — NOAA SWPC OVATION model (free, public, no key), a fixed
// 1°×360×181 world grid updated every ~1 min server-side.
const AURORA_URL = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";
async function fetchAurora() {
  const res = await fetch(AURORA_URL);
  const data = await res.json();
  return data.coordinates || [];
}
function auroraCanvas(coords) {
  const W = 360, H = 181; // 1px/degree: lon 0..359, lat +90..-90 top-to-bottom
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(W, H);
  for (const [lon, lat, val] of coords) {
    const px = Math.round(((lon % 360) + 360) % 360);
    const py = Math.round(90 - lat);
    if (px < 0 || px >= W || py < 0 || py >= H) continue;
    const i = (py * W + px) * 4;
    img.data[i] = 60; img.data[i + 1] = 255; img.data[i + 2] = 170;
    img.data[i + 3] = val > 4 ? Math.round(255 * Math.min(1, val / 55)) : 0;
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL();
}

// Leaflet bounds (possibly outside ±180° after panning around the globe) →
// a grid descriptor in the SAME unwrapped coordinate space (correct for
// placing the canvas overlay / velocity layer); only individual sample
// points are normalized before being sent to the weather API.
function computeGridFromBounds(bounds) {
  const north = Math.min(85, bounds.getNorth());
  const south = Math.max(-85, bounds.getSouth());
  const west = bounds.getWest();
  const east = Math.max(west + MIN_SPAN_DEG, bounds.getEast());
  const { nx, ny } = GRID_POINTS;
  return {
    la1: north, la2: south, lo1: west, lo2: east,
    dy: Math.max(MIN_SPAN_DEG, (north - south) / (ny - 1)),
    dx: Math.max(MIN_SPAN_DEG, (east - west) / (nx - 1)),
    nx, ny,
  };
}

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

async function fetchGrid(g) {
  const lats = [];
  const lons = [];
  for (let iy = 0; iy < g.ny; iy++) {
    const la = g.la1 - iy * g.dy;
    for (let ix = 0; ix < g.nx; ix++) {
      lats.push(la.toFixed(2));
      lons.push(normalizeLon(g.lo1 + ix * g.dx).toFixed(2));
    }
  }
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(",")}&longitude=${lons.join(",")}` +
    `&current=temperature_2m,wind_speed_10m,wind_direction_10m,uv_index,cloud_cover&wind_speed_unit=ms`;
  const data = await fetch(url).then((r) => r.json());
  const list = Array.isArray(data) ? data : [data];
  if (list.length !== g.nx * g.ny) throw new Error("griglia meteo incompleta");
  const u = [];
  const v = [];
  const temps = [];
  const uvs = [];
  const clouds = [];
  for (const p of list) {
    const s = p.current.wind_speed_10m;
    const d = (p.current.wind_direction_10m * Math.PI) / 180;
    u.push(-s * Math.sin(d));
    v.push(-s * Math.cos(d));
    temps.push(p.current.temperature_2m);
    uvs.push(p.current.uv_index ?? 0);
    clouds.push(p.current.cloud_cover ?? 0);
  }
  const header = {
    parameterUnit: "m.s-1", parameterCategory: 2, nx: g.nx, ny: g.ny,
    lo1: g.lo1, la1: g.la1, lo2: g.lo2, la2: g.la2,
    dx: g.dx, dy: g.dy, refTime: list[0]?.current?.time,
  };
  return {
    wind: [
      { header: { ...header, parameterNumber: 2 }, data: u },
      { header: { ...header, parameterNumber: 3 }, data: v },
    ],
    temps, uvs, clouds, nx: g.nx, ny: g.ny, lo1: g.lo1, la1: g.la1, lo2: g.lo2, la2: g.la2,
  };
}

// Bilinear-interpolated scalar field → canvas data-URL for an ImageOverlay.
// Shared by temperature/UV/cloud-cover — only the color function and max
// opacity differ per field.
function fieldCanvas(values, nx, ny, colorFn, opts = {}) {
  const { alphaFn = () => 1, maxAlpha = 255 } = opts;
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
        values[y0 * nx + x0] * (1 - fx) * (1 - fy) +
        values[y0 * nx + x1] * fx * (1 - fy) +
        values[y1 * nx + x0] * (1 - fx) * fy +
        values[y1 * nx + x1] * fx * fy;
      const [r, g, b] = colorFn(t);
      const i = (py * W + px) * 4;
      img.data[i] = r;
      img.data[i + 1] = g;
      img.data[i + 2] = b;
      // Feathered edges: alpha fades to 0 in the outer 9% so the field melts
      // into the basemap instead of ending in a hard rectangle; multiplied
      // by the field's own per-value opacity (e.g. cloud cover %).
      const fxe = Math.min(px, W - 1 - px) / (W * 0.09);
      const fye = Math.min(py, H - 1 - py) / (H * 0.09);
      const feather = Math.min(1, fxe, fye);
      img.data[i + 3] = Math.round(maxAlpha * alphaFn(t) * feather);
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv.toDataURL();
}
const tempCanvas = (temps, nx, ny) => fieldCanvas(temps, nx, ny, tempColor);

// UV index 0–11+ → standard WHO UV scale (verde→giallo→arancio→rosso→viola).
const UV_STOPS = [
  [0, [80, 225, 140]], [3, [247, 213, 71]], [6, [244, 157, 55]],
  [8, [218, 65, 103]], [11, [139, 30, 63]],
];
function uvColor(v) {
  if (v <= UV_STOPS[0][0]) return UV_STOPS[0][1];
  for (let i = 1; i < UV_STOPS.length; i++) {
    const [v1, c1] = UV_STOPS[i - 1];
    const [v2, c2] = UV_STOPS[i];
    if (v <= v2) {
      const k = (v - v1) / (v2 - v1);
      return c1.map((c, j) => Math.round(c + (c2[j] - c) * k));
    }
  }
  return UV_STOPS[UV_STOPS.length - 1][1];
}
const uvCanvas = (uvs, nx, ny) => fieldCanvas(uvs, nx, ny, uvColor, { maxAlpha: 190 });

// Cloud cover 0–100% → neutral white haze, opacity scales with coverage
// (0% clouds = invisible, 100% = a soft overcast haze).
const cloudCanvas = (clouds, nx, ny) =>
  fieldCanvas(clouds, nx, ny, () => [235, 240, 245], {
    maxAlpha: 210, alphaFn: (v) => Math.min(1, Math.max(0, v) / 100),
  });

// Day/night terminator, computed per OUTPUT pixel directly (not interpolated
// off the coarse ~200-point weather grid): the terminator is close to a hard
// edge, so bilinear interpolation between sparse samples made it look
// blocky/staircase-y. Solar elevation is cheap enough (pure trig, no network)
// to evaluate at full canvas resolution — no edge feathering either, since
// this is real geography, not a field that should fade out at the view edge.
function sunCanvasDirect(bounds, date) {
  const W = 320, H = 180;
  const { la1, la2, lo1, lo2 } = bounds; // north, south, west, east (unwrapped)
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(W, H);
  for (let py = 0; py < H; py++) {
    const lat = la1 - (py / (H - 1)) * (la1 - la2);
    for (let px = 0; px < W; px++) {
      const lon = normalizeLon(lo1 + (px / (W - 1)) * (lo2 - lo1));
      const el = solarElevationDeg(lat, lon, date);
      const night = el >= 0 ? 0 : el <= -6 ? 1 : -el / 6;
      const i = (py * W + px) * 4;
      img.data[i] = 6; img.data[i + 1] = 12; img.data[i + 2] = 22;
      img.data[i + 3] = Math.round(165 * night);
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

// Wind particle color scale — same array feeds both the velocity layer and
// its legend, so they can never drift apart. `light` = busy/dark background
// (dark base or the temperature field underneath) → lighter particle colors.
function windColorScale(light) {
  return light
    ? ["#ffffff", "#f0f4ff", "#dbe6ff", "#c3d5ff", "#a8c2ff", "#8facff"]
    : ["#33536f", "#2b618f", "#2470ae", "#1d7fce", "#158eee", "#0e9dff"];
}
const windGradient = (light) => `linear-gradient(90deg, ${windColorScale(light).join(",")})`;

// Static 0–11+ WHO UV gradient (the field itself is dynamic per-pixel, but
// the legend scale is fixed, like any UV index chart).
const uvGradient = (() => {
  const min = UV_STOPS[0][0];
  const max = UV_STOPS[UV_STOPS.length - 1][0];
  const stops = UV_STOPS.map(([v, c]) => `rgb(${c.join(",")}) ${(((v - min) / (max - min)) * 100).toFixed(0)}%`);
  return `linear-gradient(90deg, ${stops.join(",")})`;
})();

const CLOUD_GRADIENT = "linear-gradient(90deg, rgba(235,240,245,0), rgba(235,240,245,.82))";
const AURORA_GRADIENT = "linear-gradient(90deg, rgba(60,255,170,0), rgba(60,255,170,.9))";

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

function popupHtmlCrag(c) {
  const sun =
    c.in_sole_adesso === true
      ? `<span style="color:#f5d547;font-weight:700">☀️ Al sole ora</span>`
      : c.in_sole_adesso === false
      ? `<span style="opacity:.75">🌑 In ombra ora</span>`
      : `<em style="font-size:12px;opacity:.75">${c.nota || "esposizione non censita"}</em>`;
  return `<div style="min-width:200px;line-height:1.55">
    <b style="font-size:14px">${c.name}</b><br/><span style="font-size:12px;opacity:.7">Falesia${c.ele_m ? ` · ${c.ele_m} m` : ""}</span>
    <div style="margin:7px 0">${sun}</div>
    <a href="/falesie" style="display:inline-block;margin-top:4px;font-size:13px;font-weight:600">Tutte le falesie →</a>
  </div>`;
}

// Small reusable hover/click flyout menu: open instantly, close after a
// short delay so moving the pointer from button to submenu doesn't snap it
// shut (shared by the Meteo and Livelli control menus).
function useFlyoutMenu() {
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const openMenu = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const closeMenuDelayed = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 400);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return [open, openMenu, closeMenuDelayed, setOpen];
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
  const [gridVersion, setGridVersion] = useState(0); // bump → ridisegna temp/vento sulla griglia corrente
  const [viewVersion, setViewVersion] = useState(0); // bump → ridisegna layer client-only (giorno/notte), SUBITO su ogni moveend, senza aspettare il fetch meteo
  const [meteoOpen, openMeteoMenu, closeMeteoMenuDelayed, setMeteoOpen] = useFlyoutMenu();
  const [uv, setUv] = useState(false);
  const [clouds, setClouds] = useState(false);
  const [sun, setSun] = useState(false);
  const [sunTick, setSunTick] = useState(0); // periodic re-render of the terminator
  const [sunNote, setSunNote] = useState(null); // "vista tutta di giorno/notte" quando non c'è confine visibile
  const [aurora, setAurora] = useState(false);
  const [auroraReady, setAuroraReady] = useState(false);
  const [lightning, setLightning] = useState(false);

  const [layersOpen, openLayersMenu, closeLayersMenuDelayed, setLayersOpen] = useFlyoutMenu();
  const [showRoutes, setShowRoutes] = useState(true); // preserva il comportamento attuale (sempre visibili)
  const [showCrags, setShowCrags] = useState(false);

  useEffect(() => {
    if (!sun) return;
    const id = setInterval(() => setSunTick((t) => t + 1), 5 * 60 * 1000);
    return () => clearInterval(id);
  }, [sun]);

  useEffect(() => {
    let dead = false;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        if (typeof window !== "undefined") window.L = L;
        await import("leaflet-velocity");
        await import("leaflet.markercluster");
        if (dead || S.current.map) return;

        // Free pan/zoom over the whole world (Google-Maps-style) — the Alps
        // are just the default starting view, not a hard boundary, so future
        // paid packages in other ranges/regions need no code change here.
        // NOTE: worldCopyJump deliberately OFF — Leaflet already wraps tiles
        // seamlessly around the antimeridian; worldCopyJump periodically
        // re-centers the view when crossing it, which reads as a visible
        // stutter/snap when panning towards the Pacific.
        const map = L.map(mapEl.current, {
          zoomControl: false, scrollWheelZoom: true,
          fadeAnimation: true, zoomAnimation: true,
          minZoom: 2,
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

        // Live model grid (temperature + wind), resampled from whatever is
        // on screen — refetched (debounced) on every pan/zoom so it always
        // covers the current view, anywhere in the world.
        const refreshGrid = async () => {
          if (S.current.gridFetching) return;
          S.current.gridFetching = true;
          try {
            const data = await fetchGrid(computeGridFromBounds(map.getBounds()));
            S.current.grid = data;
            if (!dead) {
              setTempRange([Math.min(...data.temps), Math.max(...data.temps)]);
              setGridVersion((v) => v + 1);
            }
          } catch {
            // silent on pan/zoom refetch — keep showing the last good grid
          } finally {
            S.current.gridFetching = false;
          }
        };
        S.current.refreshGrid = refreshGrid;

        setMsg("Carico temperatura e vento…");
        await refreshGrid();
        if (!S.current.grid && !dead) {
          setTemp(false); setWind(false); setMsg("Dati meteo live non raggiungibili.");
        }
        map.on("moveend", () => {
          if (!dead) setViewVersion((v) => v + 1); // client-only layers: instant, no network wait
          clearTimeout(S.current.gridTimer);
          S.current.gridTimer = setTimeout(() => S.current.refreshGrid?.(), 700);
        });

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
        // Track polylines live in their own group (not directly on the map)
        // so the whole "Itinerari" layer — pins and tracks together — can be
        // hidden via the Livelli menu, same as any other layer.
        const routeTracks = L.layerGroup();
        S.current.routeTracks = routeTracks;
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
            L.polyline(pts, { color: "#0b1722", weight: 5, opacity: 0.25 }).addTo(routeTracks);
            L.polyline(pts, { color: "#1272d3", weight: 2.5, opacity: 0.95 }).addTo(routeTracks);
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
        // Initial add matches showRoutes' default (true); the dedicated
        // effect below (keyed on showRoutes) handles it from here on.
        if (showRoutes) {
          map.addLayer(clusters);
          map.addLayer(routeTracks);
        }

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
      clearTimeout(S.current.gridTimer);
      if (S.current.map) S.current.map.remove();
      S.current = {};
    };
  }, []);

  useEffect(() => {
    const { map, bases } = S.current;
    if (!map) return;
    BASES.forEach((k) => (k === base ? bases[k].addTo(map) : map.removeLayer(bases[k])));
  }, [base, ready]);

  // Itinerari: pins + tracks together, one "Livelli" toggle.
  useEffect(() => {
    const { map, clusters, routeTracks } = S.current;
    if (!map || !clusters || !routeTracks) return;
    [clusters, routeTracks].forEach((layer) => {
      if (showRoutes) map.addLayer(layer);
      else map.removeLayer(layer);
    });
  }, [showRoutes, ready]);

  // Falesie: fetched lazily on first toggle-on (small dataset, but no point
  // paying for it if the layer is never opened), then just shown/hidden.
  useEffect(() => {
    const { L, map } = S.current;
    if (!map) return;
    if (!showCrags) {
      if (S.current.cragsLayer) map.removeLayer(S.current.cragsLayer);
      return;
    }
    let dead = false;
    (async () => {
      if (!S.current.cragsLayer) {
        const crags = await fetch(`${API_BASE}/falesie`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []);
        if (dead) return;
        const group = L.markerClusterGroup({
          maxClusterRadius: 50, disableClusteringAtZoom: 15, showCoverageOnHover: false,
          iconCreateFunction: (cluster) => L.divIcon({
            className: "", html: `<span class="crag-cluster">${cluster.getChildCount()}</span>`,
            iconSize: [34, 34], iconAnchor: [17, 17],
          }),
        });
        for (const c of crags) {
          if (c.lat == null || c.lon == null) continue;
          const m = L.marker([c.lat, c.lon], {
            icon: L.divIcon({
              className: "", html: `<span class="crag-dot"></span>`,
              iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -8],
            }),
          });
          m.bindTooltip(c.name, { direction: "top", offset: [0, -8] });
          m.bindPopup(popupHtmlCrag(c));
          group.addLayer(m);
        }
        S.current.cragsLayer = group;
      }
      if (!dead) map.addLayer(S.current.cragsLayer);
    })();
    return () => { dead = true; };
  }, [showCrags, ready]);

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
        [[grid.la2, grid.lo1], [grid.la1, grid.lo2]],
        { opacity: 0.55, interactive: false }
      ).addTo(map);
      S.current.tempOverlay.bringToFront?.();
    }
  }, [temp, ready, gridVersion]);

  // UV index field
  useEffect(() => {
    const { L, map, grid } = S.current;
    if (!map) return;
    if (S.current.uvOverlay) {
      map.removeLayer(S.current.uvOverlay);
      S.current.uvOverlay = null;
    }
    if (uv && grid) {
      S.current.uvOverlay = L.imageOverlay(
        uvCanvas(grid.uvs, grid.nx, grid.ny),
        [[grid.la2, grid.lo1], [grid.la1, grid.lo2]],
        { opacity: 0.6, interactive: false }
      ).addTo(map);
      S.current.uvOverlay.bringToFront?.();
    }
  }, [uv, ready, gridVersion]);

  // Cloud cover field
  useEffect(() => {
    const { L, map, grid } = S.current;
    if (!map) return;
    if (S.current.cloudOverlay) {
      map.removeLayer(S.current.cloudOverlay);
      S.current.cloudOverlay = null;
    }
    if (clouds && grid) {
      S.current.cloudOverlay = L.imageOverlay(
        cloudCanvas(grid.clouds, grid.nx, grid.ny),
        [[grid.la2, grid.lo1], [grid.la1, grid.lo2]],
        { opacity: 0.75, interactive: false }
      ).addTo(map);
      S.current.cloudOverlay.bringToFront?.();
    }
  }, [clouds, ready, gridVersion]);

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
    const scale = windColorScale(base === "scuro" || temp);
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
  }, [wind, temp, base, ready, gridVersion]);

  // Day/night terminator — real solar-elevation shading. Computed from the
  // map's OWN current bounds (not the network-fetched weather grid): it's
  // pure client-side astronomy, so it must update instantly on pan/zoom
  // instead of waiting on Open-Meteo's debounced/possibly-stale fetch.
  useEffect(() => {
    const { L, map } = S.current;
    if (!map) return;
    if (S.current.sunOverlay) {
      map.removeLayer(S.current.sunOverlay);
      S.current.sunOverlay = null;
    }
    if (sun) {
      const g = computeGridFromBounds(map.getBounds());
      const now = new Date();
      S.current.sunOverlay = L.imageOverlay(
        sunCanvasDirect(g, now),
        [[g.la2, g.lo1], [g.la1, g.lo2]],
        { opacity: 1, interactive: false }
      ).addTo(map);
      S.current.sunOverlay.bringToFront?.();
      // The layer is correct even when it shows nothing — the whole current
      // view can legitimately be all-day or all-night. Say so, otherwise it
      // just looks broken. (Coarse grid here is fine — this is just a
      // statistical check, not what gets rendered.)
      const nightVals = sunNightValues(g, now);
      const min = Math.min(...nightVals);
      const max = Math.max(...nightVals);
      setSunNote(
        max === 0 ? "tutta la vista è di giorno ora — zoom out per vedere il confine"
        : min === 1 ? "tutta la vista è di notte ora — zoom out per vedere il confine"
        : null
      );
    } else {
      setSunNote(null);
    }
  }, [sun, ready, viewVersion, sunTick]);

  // Aurora boreale/australe — NOAA OVATION model, fetched once per toggle-on
  // (world-fixed grid, refreshed every 5' while visible; not tied to pan/zoom).
  useEffect(() => {
    const { L, map } = S.current;
    if (!map) return;
    if (S.current.auroraLayer) {
      map.removeLayer(S.current.auroraLayer);
      S.current.auroraLayer = null;
    }
    if (!aurora) {
      setAuroraReady(false);
      return;
    }
    let dead = false;
    const load = async () => {
      try {
        const coords = await fetchAurora();
        if (dead) return;
        if (S.current.auroraLayer) map.removeLayer(S.current.auroraLayer);
        S.current.auroraLayer = L.imageOverlay(
          auroraCanvas(coords), [[-90, -180], [90, 180]],
          { opacity: 0.85, interactive: false }
        ).addTo(map);
        S.current.auroraLayer.bringToFront?.();
        if (!dead) setAuroraReady(true);
      } catch {
        if (!dead) setAuroraReady(false);
      }
    };
    load();
    S.current.auroraTimer = setInterval(load, 5 * 60 * 1000);
    return () => {
      dead = true;
      clearInterval(S.current.auroraTimer);
    };
  }, [aurora, ready]);

  // Fulmini — DATI SINTETICI (dimostrativi): nessuna fonte gratuita
  // real-time affidabile individuata; struttura pronta per un feed reale
  // (es. Blitzortung) quando disponibile.
  useEffect(() => {
    const { L, map } = S.current;
    if (!map) return;
    if (S.current.lightningLayer) {
      map.removeLayer(S.current.lightningLayer);
      S.current.lightningLayer = null;
    }
    if (!lightning) return;
    const layer = L.layerGroup().addTo(map);
    S.current.lightningLayer = layer;
    const strike = () => {
      const b = map.getBounds();
      const lat = b.getSouth() + Math.random() * (b.getNorth() - b.getSouth());
      const lon = b.getWest() + Math.random() * (b.getEast() - b.getWest());
      const m = L.marker([lat, lon], {
        interactive: false,
        icon: L.divIcon({
          className: "", html: `<span class="lightning-bolt">⚡</span>`,
          iconSize: [22, 22], iconAnchor: [11, 11],
        }),
      }).addTo(layer);
      setTimeout(() => layer.removeLayer(m), 1300); // matches .lightning-bolt fade duration
    };
    strike();
    S.current.lightningTimer = setInterval(strike, 1800);
    return () => clearInterval(S.current.lightningTimer);
  }, [lightning, ready]);

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

      <div className="mapctl-left">
        <div className="mapmenu" onMouseEnter={openLayersMenu} onMouseLeave={closeLayersMenuDelayed}>
          <button
            className={`mapbtn ${showRoutes || showCrags ? "on" : ""}`}
            onClick={() => (layersOpen ? setLayersOpen(false) : openLayersMenu())}
            aria-expanded={layersOpen}
            disabled={!ready}
          >
            <span className="dot" />Livelli
          </button>
          {layersOpen && (
            <div className="mapsubmenu-down" onMouseEnter={openLayersMenu} onMouseLeave={closeLayersMenuDelayed}>
              <button className={`mapbtn ${showRoutes ? "on" : ""}`} onClick={() => setShowRoutes(!showRoutes)} disabled={!ready}>
                <span className="dot" />Itinerari
              </button>
              <button className={`mapbtn ${showCrags ? "on" : ""}`} onClick={() => setShowCrags(!showCrags)} disabled={!ready}>
                <span className="dot" />Falesie
              </button>
              <button className="mapbtn soon" disabled title="In arrivo: nessuna fonte dati ancora integrata">
                <span className="dot" />Piste da sci <em className="soontag">in arrivo</em>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mapctl">
        <div className="mapmenu" onMouseEnter={openMeteoMenu} onMouseLeave={closeMeteoMenuDelayed}>
          <button
            className={`mapbtn ${temp || wind || radar || uv || clouds || sun || aurora || lightning ? "on" : ""}`}
            onClick={() => (meteoOpen ? setMeteoOpen(false) : openMeteoMenu())}
            aria-expanded={meteoOpen}
            disabled={!ready}
          >
            <span className="dot" />Meteo
          </button>
        </div>
        {meteoOpen && (
          <div className="mapsubmenu" onMouseEnter={openMeteoMenu} onMouseLeave={closeMeteoMenuDelayed}>
            <button className={`mapbtn ${temp ? "on" : ""}`} onClick={() => setTemp(!temp)} disabled={!ready}>
              <span className="dot" />Temperatura
            </button>
            <button className={`mapbtn ${wind ? "on" : ""}`} onClick={() => setWind(!wind)} disabled={!ready}>
              <span className="dot" />Vento
            </button>
            <button className={`mapbtn ${radar ? "on" : ""}`} onClick={() => setRadar(!radar)} disabled={!ready || !frames.length}>
              <span className="dot" />Pioggia
            </button>
            <button className={`mapbtn ${uv ? "on" : ""}`} onClick={() => setUv(!uv)} disabled={!ready}>
              <span className="dot" />UV
            </button>
            <button className={`mapbtn ${clouds ? "on" : ""}`} onClick={() => setClouds(!clouds)} disabled={!ready}>
              <span className="dot" />Nuvole
            </button>
            <button className={`mapbtn ${sun ? "on" : ""}`} onClick={() => setSun(!sun)} disabled={!ready}
              title="Terminatore giorno/notte — calcolo astronomico reale">
              <span className="dot" />Esposizione al sole
            </button>
            {sun && sunNote && <div className="legendnote">{sunNote}</div>}
            <button className={`mapbtn ${aurora ? "on" : ""}`} onClick={() => setAurora(!aurora)} disabled={!ready}
              title="Probabilità aurora — modello NOAA OVATION">
              <span className="dot" />Aurora boreale{aurora && !auroraReady ? "…" : ""}
            </button>
            <button className={`mapbtn ${lightning ? "on" : ""}`} onClick={() => setLightning(!lightning)} disabled={!ready}
              title="Dati dimostrativi — nessuna fonte gratuita real-time ancora integrata">
              <span className="dot" />Fulmini <em className="soontag">demo</em>
            </button>
            <button className="mapbtn soon" disabled
              title="In arrivo: eclissi di sole, di luna e altri eventi astronomici visibili dalla zona">
              <span className="dot" />Eventi speciali <em className="soontag">in arrivo</em>
            </button>
          </div>
        )}
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

      {((temp && tempRange) || wind || uv || clouds || aurora || season) && (
      <div className="maplegend" style={{ flexDirection: "column", alignItems: "stretch", gap: 8 }}>
        {temp && tempRange && (
          <div className="legendrow">
            <span className="legendlabel">Temp</span>
            <span>{Math.round(tempRange[0])}°</span>
            <span className="legendbar" style={{ background: rangeGradient(tempRange[0], tempRange[1]) }} />
            <span>{Math.round(tempRange[1])}°</span>
          </div>
        )}
        {wind && (
          <div className="legendrow">
            <span className="legendlabel">Vento</span>
            <span>0</span>
            <span className="legendbar" style={{ background: windGradient(base === "scuro" || temp) }} />
            <span>58 km/h</span>
          </div>
        )}
        {uv && (
          <div className="legendrow">
            <span className="legendlabel">UV</span>
            <span>0</span>
            <span className="legendbar" style={{ background: uvGradient }} />
            <span>11+</span>
          </div>
        )}
        {clouds && (
          <div className="legendrow">
            <span className="legendlabel">Nuvole</span>
            <span>0%</span>
            <span className="legendbar" style={{ background: CLOUD_GRADIENT }} />
            <span>100%</span>
          </div>
        )}
        {aurora && (
          <div className="legendrow">
            <span className="legendlabel">Aurora</span>
            <span>bassa</span>
            <span className="legendbar" style={{ background: AURORA_GRADIENT }} />
            <span>alta</span>
          </div>
        )}
        {season && (
          <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
            <span className="legendlabel">Valanghe</span>
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
