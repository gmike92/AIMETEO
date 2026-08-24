"use client";
// Windy-style map v4 — never blank on open.
// Defaults: light base (CARTO Voyager) + TEMPERATURE color field + animated
// wind particles, all live Open-Meteo model data over the Alps. Radar timeline
// (RainViewer) on demand. Real GPX tracks + official-danger markers.
import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import { DANGER_COLORS, dangerInk } from "@/lib/wx";
import { Icon } from "@/app/components/WxIcon";
import { useAutoHide } from "@/lib/useAutoHide";
import { MapRail, MapFields, MapDock } from "./MapChrome";

// Glifi per i contenuti che Leaflet vuole come STRINGA HTML (divIcon, popup):
// lì non possiamo montare un componente React, ma il markup SVG è lo stesso
// che disegna WxIcon — niente emoji nemmeno qui (regola 1.2).
const svg = (d, { size = 14, fill = false, stroke = "currentColor", extra = "" } = {}) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill ? stroke : "none"}" ` +
  `stroke="${fill ? "none" : stroke}" stroke-width="1.85" stroke-linecap="round" ` +
  `stroke-linejoin="round" aria-hidden="true" style="vertical-align:-2px;${extra}">${d}</svg>`;

const GLYPH = {
  warning: svg('<path d="M12 3.6l9.2 16.4H2.8z"/><path d="M12 9.8v4.4M12 17.4v.01"/>'),
  sun: svg('<circle cx="12" cy="12" r="4.4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2' +
    'M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4"/>'),
  moon: svg('<path d="M20.2 14.8A8.6 8.6 0 019.4 4a8.6 8.6 0 1010.8 10.8z"/>'),
  // I popup e i divIcon di Leaflet finiscono nel documento, quindi le
  // custom property di :root cascadono anche qui: niente hex nuovi.
  bolt: svg('<path d="M13.2 2L5.5 13.2H11l-1 8.8 7.7-11.4H12z"/>',
    { size: 20, fill: true, stroke: "var(--warn)" }),
};
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
// Blur pass (own canvas, read-then-write so browsers don't choke on
// self-referential filtered draws) — turns a resampled-but-still-gridded
// field into a soft, organic-looking glow.
function blurredDataUrl(cv, px) {
  const out = document.createElement("canvas");
  out.width = cv.width;
  out.height = cv.height;
  const ctx = out.getContext("2d");
  ctx.filter = `blur(${px}px)`;
  ctx.drawImage(cv, 0, 0);
  return out.toDataURL();
}

// NOAA's OVATION grid is 1 sample per degree — plotted 1px/degree it reads
// as visible squares. Oversample 2x and bilinearly interpolate between
// source samples (wrapping at the antimeridian) before blurring, so the
// glow is smooth instead of a blocky mosaic of the raw grid cells.
function auroraCanvas(coords) {
  const SRC_W = 360, SRC_H = 181; // lon 0..359, lat +90..-90 top-to-bottom
  const vals = new Float32Array(SRC_W * SRC_H);
  for (const [lon, lat, val] of coords) {
    const px = Math.round(((lon % 360) + 360) % 360);
    const py = Math.round(90 - lat);
    if (px < 0 || px >= SRC_W || py < 0 || py >= SRC_H) continue;
    vals[py * SRC_W + px] = val;
  }
  const W = SRC_W * 2, H = SRC_H * 2;
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d");
  const img = ctx.createImageData(W, H);
  for (let py = 0; py < H; py++) {
    const gy = Math.min(SRC_H - 1, (py / (H - 1)) * (SRC_H - 1));
    const y0 = Math.floor(gy);
    const y1 = Math.min(SRC_H - 1, y0 + 1);
    const fy = gy - y0;
    for (let px = 0; px < W; px++) {
      const gx = (px / W) * SRC_W; // longitude wraps, no clamping at the edge
      const x0 = Math.floor(gx) % SRC_W;
      const x1 = (x0 + 1) % SRC_W;
      const fx = gx - Math.floor(gx);
      const v =
        vals[y0 * SRC_W + x0] * (1 - fx) * (1 - fy) +
        vals[y0 * SRC_W + x1] * fx * (1 - fy) +
        vals[y1 * SRC_W + x0] * (1 - fx) * fy +
        vals[y1 * SRC_W + x1] * fx * fy;
      const i = (py * W + px) * 4;
      img.data[i] = 60; img.data[i + 1] = 255; img.data[i + 2] = 170;
      img.data[i + 3] = v > 4 ? Math.round(190 * Math.min(1, v / 55)) : 0;
    }
  }
  ctx.putImageData(img, 0, 0);
  return blurredDataUrl(cv, 3);
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
  const { alphaFn = () => 1, maxAlpha = 255, blur = 0 } = opts;
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
  return blur ? blurredDataUrl(cv, blur) : cv.toDataURL();
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
const uvCanvas = (uvs, nx, ny) => fieldCanvas(uvs, nx, ny, uvColor, { maxAlpha: 150 });

// Cloud cover 0–100% → neutral white haze, opacity scales with coverage
// (0% clouds = invisible, 100% = a soft overcast haze). Blurred: at ~200
// sample points bilinear interpolation alone still reads as a faceted
// mosaic once stretched over a real map — the blur is what makes it read
// as haze instead of tiles.
const cloudCanvas = (clouds, nx, ny) =>
  fieldCanvas(clouds, nx, ny, () => [244, 240, 232], {
    maxAlpha: 160, alphaFn: (v) => Math.min(1, Math.max(0, v) / 100), blur: 6,
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
// Amber/gold rather than blue: temperature already owns the cool end of the
// spectrum (violet→blue→cyan for cold Alpine readings), so a blue wind field
// on top just read as "everything is blue" — gold particles stay legible
// over both the cool temperature field and the plain basemap.
function windColorScale(light) {
  return light
    ? ["#fff7e6", "#ffe8ad", "#ffd166", "#ffb020", "#ff8c00", "#ff6a00"]
    : ["#7a4a00", "#9c6300", "#c17f00", "#e69a00", "#ffb020", "#ffd166"];
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

const CLOUD_GRADIENT = "linear-gradient(90deg, rgba(244,240,232,0), rgba(244,240,232,.82))";
const AURORA_GRADIENT = "linear-gradient(90deg, rgba(60,255,170,0), rgba(60,255,170,.9))";

function popupHtml(area, route) {
  const b = area?.bulletin;
  const f = area?.forecast;
  // Avalanche block only when a bulletin is in force, or when it SHOULD be
  // verifiable and isn't (safety warning). Off-season: nothing at all.
  const danger =
    b?.status === "in_vigore"
      ? `<div style="margin:7px 0"><span style="background:${DANGER_COLORS[b.danger_level]};color:${dangerInk(b.danger_level)};padding:2px 9px;border-radius:999px;font-weight:700;font-size:12px;font-variant-numeric:tabular-nums">Valanghe ${b.danger_level}/5</span>
         <a href="${b.source_url}" target="_blank" rel="noopener" style="margin-left:8px;font-size:12px">${b.service} →</a></div>`
      : b?.status === "non_verificabile"
      ? `<div style="margin:7px 0;display:flex;align-items:center;gap:6px;color:var(--warn)"><em style="font-size:12px;font-style:normal">${GLYPH.warning} Bollettino valanghe non verificabile — prudenza</em></div>`
      : "";
  const meteo = f
    ? `<div style="margin-top:7px;font-size:12.5px;font-variant-numeric:tabular-nums">0°C <b>${f.freezing_level_m} m</b> · vento ${f.wind_avg_kmh} km/h · temporali ${Math.round(f.thunderstorm_prob * 100)}%${f.source === "mock" ? " <em>(demo)</em>" : ""}</div>`
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
      ? `<span style="color:var(--warn);font-weight:700">${GLYPH.sun} Al sole ora</span>`
      : c.in_sole_adesso === false
      ? `<span style="opacity:.75">${GLYPH.moon} In ombra ora</span>`
      : `<em style="font-size:12px;opacity:.75">${c.nota || "esposizione non censita"}</em>`;
  return `<div style="min-width:200px;line-height:1.55">
    <b style="font-size:14px">${c.name}</b><br/><span style="font-size:12px;opacity:.7">Falesia${c.ele_m ? ` · ${c.ele_m} m` : ""}</span>
    <div style="margin:7px 0">${sun}</div>
    <a href="/falesie" style="display:inline-block;margin-top:4px;font-size:13px;font-weight:600">Tutte le falesie →</a>
  </div>`;
}

// useFlyoutMenu è stato cancellato, non ristilizzato (regola 1.7): livelli e
// campi meteo sono rail e segmented sempre visibili, e un menu che si apre
// sopra la mappa nasconde proprio la cosa che stai guardando mentre cambi
// il modo in cui è disegnata.

const BASES = ["chiaro", "terreno", "scuro"];

export default function MapView({
  fullscreen = false, focusRoute = null, children, days = null,
}) {
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
  const [uv, setUv] = useState(false);
  const [clouds, setClouds] = useState(false);
  const [sun, setSun] = useState(false);
  const [sunTick, setSunTick] = useState(0); // periodic re-render of the terminator
  const [sunNote, setSunNote] = useState(null); // "vista tutta di giorno/notte" quando non c'è confine visibile
  const [aurora, setAurora] = useState(false);
  const [auroraReady, setAuroraReady] = useState(false);
  const [auroraDataVersion, setAuroraDataVersion] = useState(0); // bump → nuovo fetch NOAA disegnato
  const [lightning, setLightning] = useState(false);

  const [showRoutes, setShowRoutes] = useState(true); // preserva il comportamento attuale (sempre visibili)
  const [showCrags, setShowCrags] = useState(false);

  // Rail (livelli/attività) e campi meteo: a scomparsa dopo qualche secondo
  // di inattività, tornano visibili a qualunque interazione sulla pagina —
  // stesso pattern della navbar immersiva (vedi useAutoHide.js).
  const railAutoHide = useAutoHide(ready);
  const fieldsAutoHide = useAutoHide(ready);

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
        // covers the current view, anywhere in the world. Also on a plain
        // 5' timer (below), so a transient failure (e.g. Open-Meteo's hourly
        // rate limit) recovers on its own instead of needing a pan/zoom.
        const refreshGrid = async () => {
          if (S.current.gridFetching) return;
          S.current.gridFetching = true;
          try {
            const data = await fetchGrid(computeGridFromBounds(map.getBounds()));
            const hadNoGrid = !S.current.grid;
            S.current.grid = data;
            if (!dead) {
              setTempRange([Math.min(...data.temps), Math.max(...data.temps)]);
              setGridVersion((v) => v + 1);
              // Il fetch iniziale può fallire (es. quota oraria Open-Meteo
              // esaurita) e lasciare il banner d'errore appeso a schermo:
              // appena arriva un fetch buono, il banner sparisce.
              if (hadNoGrid) {
                setMsg((m) => (m === "Dati meteo live non raggiungibili." ? "" : m));
              }
            }
          } catch {
            // silent on retry — keep showing the last good grid (se c'è)
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
        S.current.gridRetryTimer = setInterval(() => {
          if (!S.current.grid) S.current.refreshGrid?.();
        }, 5 * 60 * 1000);

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
      clearInterval(S.current.gridRetryTimer);
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
        { opacity: 0.4, interactive: false }
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
        { opacity: 0.45, interactive: false }
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
        { opacity: 0.5, interactive: false }
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
        // bottomleft: il dock occupa la fascia bassa da 104px in poi, e
        // l'attribuzione Leaflet sta in basso a destra — il readout del vento
        // è l'unico che può stare nell'angolo rimasto libero.
        velocityType: "vento 10 m", position: "bottomleft",
        emptyString: "", speedUnit: "m/s",
      },
      minVelocity: 0, maxVelocity: 16, velocityScale: 0.008,
      particleMultiplier: 1 / 260, lineWidth: 1.3, particleAge: 55,
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
  // Only the DATA fetch lives here — where it's drawn is a separate effect
  // below, so panning doesn't need a fresh network round-trip to update.
  useEffect(() => {
    if (!aurora) {
      setAuroraReady(false);
      return;
    }
    let dead = false;
    const load = async () => {
      try {
        const coords = await fetchAurora();
        if (dead) return;
        S.current.auroraDataUrl = auroraCanvas(coords);
        setAuroraDataVersion((v) => v + 1);
        setAuroraReady(true);
      } catch {
        if (!dead) setAuroraReady(false);
      }
    };
    load();
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => {
      dead = true;
      clearInterval(timer);
    };
  }, [aurora, ready]);

  // Aurora rendering — unlike temp/wind (refetched from the current bounds
  // on every pan) or radar (a native Leaflet tile layer, which tiles across
  // world copies on its own), the aurora image is one fixed world-sized
  // canvas. Anchored just once at [[-90,-180],[90,180]] it only ever showed
  // on the globe copy it was first drawn on, and vanished as soon as you
  // panned to a repeated copy. Fix: redraw it as one imageOverlay PER world
  // copy currently in view, recomputed on every pan/zoom (viewVersion) and
  // whenever fresh NOAA data lands (auroraDataVersion).
  useEffect(() => {
    const { L, map } = S.current;
    if (!map) return;
    if (S.current.auroraLayer) {
      map.removeLayer(S.current.auroraLayer);
      S.current.auroraLayer = null;
    }
    if (!aurora || !S.current.auroraDataUrl) return;
    const b = map.getBounds();
    const kMin = Math.floor((b.getWest() + 180) / 360);
    const kMax = Math.floor((b.getEast() + 180) / 360);
    const group = L.layerGroup();
    for (let k = kMin; k <= kMax; k++) {
      L.imageOverlay(
        S.current.auroraDataUrl,
        [[-90, -180 + 360 * k], [90, 180 + 360 * k]],
        { opacity: 0.55, interactive: false }
      ).addTo(group);
    }
    group.addTo(map);
    group.eachLayer((l) => l.bringToFront?.());
    S.current.auroraLayer = group;
  }, [aurora, ready, viewVersion, auroraDataVersion]);

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
          className: "", html: `<span class="lightning-bolt">${GLYPH.bolt}</span>`,
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
      layer.setOpacity(path === f.path ? 0.5 : 0)
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

  // ── descrizione dichiarativa del chrome ──────────────────────────
  // Nessuno stato nuovo: sono gli stessi toggle di prima, elencati invece
  // che scritti a mano uno per uno dentro il JSX.
  // `variant` dà a ciascun campo un colore distinto da acceso (vedi
  // .segbtn.on.v-* in globals.css) — prima solo vento aveva un colore
  // diverso (alt/teal), tutti gli altri diventavano lo stesso blu accent:
  // con più campi accesi insieme erano indistinguibili a colpo d'occhio.
  const fields = [
    { key: "temp", label: "Temp", on: temp, toggle: () => setTemp(!temp), variant: "temp" },
    { key: "wind", label: "Vento", on: wind, toggle: () => setWind(!wind), variant: "wind" },
    {
      key: "radar", label: "Pioggia", on: radar, toggle: () => setRadar(!radar),
      disabled: !frames.length, variant: "radar",
      title: frames.length ? undefined : "Radar RainViewer non raggiungibile",
    },
    { key: "uv", label: "UV", on: uv, toggle: () => setUv(!uv), variant: "uv" },
    { key: "clouds", label: "Nuvole", on: clouds, toggle: () => setClouds(!clouds), variant: "clouds" },
    {
      key: "sun", label: "Sole", on: sun, toggle: () => setSun(!sun), variant: "sun",
      title: "Terminatore giorno/notte — calcolo astronomico reale",
    },
    {
      key: "aurora", label: "Aurora", on: aurora, toggle: () => setAurora(!aurora), variant: "aurora",
      tag: aurora && !auroraReady ? "…" : undefined,
      title: "Probabilità aurora — modello NOAA OVATION",
    },
    {
      key: "lightning", label: "Fulmini", on: lightning, variant: "lightning",
      toggle: () => setLightning(!lightning), tag: "demo",
      title: "Dati dimostrativi — nessuna fonte gratuita real-time ancora integrata",
    },
  ];

  const layers = [
    {
      key: "rt", label: "Itin.", icon: Icon.Route, on: showRoutes,
      toggle: () => setShowRoutes(!showRoutes), title: "Itinerari: pin e tracce",
    },
    {
      key: "fal", label: "Falesie", icon: Icon.Crag, on: showCrags,
      toggle: () => setShowCrags(!showCrags),
    },
    ...(hasSlope
      ? [{
          key: "slope", label: "Pendenze", icon: Icon.Slope, on: slope,
          toggle: () => setSlope(!slope),
          title: "Pendenze dal DEM Copernicus: giallo ≥30° · arancio ≥35° · rosso ≥40° · viola ≥45° (area pilota)",
        }]
      : []),
    {
      key: "ski", label: "Piste", icon: Icon.Ski, disabled: true, sep: true,
      title: "In arrivo: nessuna fonte dati ancora integrata",
    },
  ];

  // La legenda mostra SOLO le scale effettivamente attive: se non ce n'è
  // nessuna il pannello non viene renderizzato affatto (regola 1.9).
  const legendRows = [
    temp && tempRange && {
      key: "temp", label: "Temp",
      min: `${Math.round(tempRange[0])}°`, max: `${Math.round(tempRange[1])}°`,
      gradient: rangeGradient(tempRange[0], tempRange[1]),
    },
    wind && {
      key: "wind", label: "Vento", min: "0", max: "58 km/h",
      gradient: windGradient(base === "scuro" || temp),
    },
    uv && { key: "uv", label: "UV", min: "0", max: "11+", gradient: uvGradient },
    clouds && { key: "clouds", label: "Nuvole", min: "0%", max: "100%", gradient: CLOUD_GRADIENT },
    aurora && { key: "aurora", label: "Aurora", min: "bassa", max: "alta", gradient: AURORA_GRADIENT },
  ].filter(Boolean);

  // La nota del terminatore ("tutta la vista è di giorno") deve poter
  // comparire anche da sola: il layer sole non aggiunge righe di scala, e
  // senza questo sparirebbe proprio quando è l'unico layer acceso.
  const sunOnlyNote = sun ? sunNote : null;
  const legend =
    legendRows.length || season || sunOnlyNote
      ? { rows: legendRows, danger: season, note: sunOnlyNote }
      : null;

  // Senza frame il pannello timeline non esiste — mai una barra vuota
  // disabilitata al posto suo.
  const radarProps =
    radar && frames.length
      ? { frames, frameIdx, setFrameIdx, playing, setPlaying, frameTime, isForecast }
      : null;

  return (
    <div className={`mapshell ${fullscreen ? "full" : ""}`}>
      <div ref={mapEl} style={{ position: "absolute", inset: 0 }} />
      {children}

      {/* Livelli — cosa è disegnato sulla mappa. A scomparsa (railAutoHide). */}
      <MapRail
        ready={ready}
        layers={layers}
        hidden={railAutoHide.hidden}
        onMouseEnter={railAutoHide.onMouseEnter}
        onMouseLeave={railAutoHide.onMouseLeave}
      />

      {/* Campi meteo + sfondo — come è disegnata la mappa. A scomparsa (fieldsAutoHide). */}
      <MapFields
        ready={ready}
        fields={fields}
        bases={BASES}
        base={base}
        setBase={setBase}
        hidden={fieldsAutoHide.hidden}
        onMouseEnter={fieldsAutoHide.onMouseEnter}
        onMouseLeave={fieldsAutoHide.onMouseLeave}
      />

      {/* Legenda, timeline radar e striscia giorni: un solo sistema di layout. */}
      <MapDock legend={legend} radar={radarProps} days={days} />

      {msg && <div className="mapmsg">{msg}</div>}
    </div>
  );
}
