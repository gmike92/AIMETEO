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
import { FooterLinks } from "@/app/components/SiteFooter";
import { useSettings } from "@/app/components/SettingsProvider";
import { ACTIVITY_KEYS, DEFAULT_ACTIVITY_COLORS } from "@/lib/settings";
import { MapRail, MapFields, MapTools, MapDock } from "./MapChrome";
import RouteCard from "@/app/components/RouteCard";

// CARTO ora richiede una chiave (gratuita, 5M richieste/mese) sui suoi
// raster basemap — senza, i tile arrivano comunque ma con un watermark
// "API KEY REQUIRED" sopra. Se la var d'ambiente non è impostata l'URL
// resta quello di sempre (stesso degrado onesto, mai un errore): vedi
// frontend/.env.local.example per dove ottenerla.
const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY;
const cartoTileUrl = (style) =>
  `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png` +
  (CARTO_KEY ? `?key=${CARTO_KEY}` : "");

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

// Zoom +/- di Leaflet: sostituisce il carattere di sistema (bruttino, mai
// centrato bene) con un segno vettoriale — stesso stroke arrotondato delle
// altre icone dell'app, solo un filo più spesso per restare leggibile a 18px.
const ZOOM_IN_SVG = svg('<path d="M12 5v14M5 12h14"/>', { size: 18, extra: "stroke-width:2.4;" });
const ZOOM_OUT_SVG = svg('<path d="M5 12h14"/>', { size: 18, extra: "stroke-width:2.4;" });

// Casa (posizione di riferimento del riepilogo meteo) e spillo (punto
// cliccato sulla mappa): marker vettoriali, non i pin bitmap di default di
// Leaflet — viewBox/fill propri, non lo stesso stroke a 24x24 di GLYPH.
const HOME_MARKER_HTML =
  `<span class="home-marker"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
  `stroke-width="1.85" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">` +
  `<path d="M4 11.5L12 4l8 7.5"/><path d="M6 10v9h5v-5h2v5h5v-9"/></svg></span>`;
// --marker-pin invece di un colore fisso: lo spillo cambia "skin" col tema
// (bosco → marrone, mare → blu profondo, chiaro → blu notte scuro apposta —
// vedi le 4 palette marker in :root/[data-theme] sopra, una per ogni tipo
// di pin: casa/spillo/falesia/pianifica, sempre diverse tra loro).
const PIN_MARKER_HTML =
  `<svg class="pin-marker" width="26" height="34" viewBox="0 0 26 34" aria-hidden="true">` +
  `<path d="M13 2C6.9 2 2 6.9 2 13c0 8.5 11 19 11 19s11-10.5 11-19c0-6.1-4.9-11-11-11z" ` +
  `fill="var(--marker-pin)" stroke="#fff" stroke-width="2"/><circle cx="13" cy="13" r="4.2" fill="#fff"/></svg>`;
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

// Pendenza da un campo di quote (stessa griglia nx×ny del meteo, così basta
// UN fetch elevazioni in più per ciclo invece di una griglia dedicata):
// differenze finite centrate (laterali sui bordi) convertite in metri reali
// per riga (dx varia con la latitudine, dy no), poi atan(|∇z|) in gradi.
const M_PER_DEG_LAT = 111320;
function computeSlopes(elevations, nx, ny, dx, dy, la1) {
  const dyM = dy * M_PER_DEG_LAT;
  const slopes = new Array(nx * ny);
  for (let iy = 0; iy < ny; iy++) {
    const lat = la1 - iy * dy;
    const dxM = dx * M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
    for (let ix = 0; ix < nx; ix++) {
      const ixL = Math.max(0, ix - 1);
      const ixR = Math.min(nx - 1, ix + 1);
      const iyU = Math.max(0, iy - 1); // iy cresce verso sud (la1 - iy*dy): iyU è più a nord
      const iyD = Math.min(ny - 1, iy + 1);
      const dzdx = ixR > ixL
        ? (elevations[iy * nx + ixR] - elevations[iy * nx + ixL]) / ((ixR - ixL) * dxM)
        : 0;
      const dzdy = iyD > iyU
        ? (elevations[iyU * nx + ix] - elevations[iyD * nx + ix]) / ((iyD - iyU) * dyM)
        : 0;
      slopes[iy * nx + ix] = (Math.atan(Math.hypot(dzdx, dzdy)) * 180) / Math.PI;
    }
  }
  return slopes;
}

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
  // Stessi punti della griglia meteo, un'altra API Open-Meteo (Copernicus
  // DEM, globale — niente più tile pregenerati per una sola "area pilota"):
  // in parallelo con /forecast, non in coda, e mai bloccante se fallisce —
  // niente pendenza quel giro, il resto della griglia resta valido.
  const elevUrl = `https://api.open-meteo.com/v1/elevation?latitude=${lats.join(",")}&longitude=${lons.join(",")}`;
  const [data, elevData] = await Promise.all([
    fetch(url).then((r) => r.json()),
    fetch(elevUrl).then((r) => r.json()).catch(() => null),
  ]);
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
  const elevations = Array.isArray(elevData?.elevation) && elevData.elevation.length === g.nx * g.ny
    ? elevData.elevation
    : null;
  const slopes = elevations ? computeSlopes(elevations, g.nx, g.ny, g.dx, g.dy, g.la1) : null;
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
    temps, uvs, clouds, slopes, nx: g.nx, ny: g.ny, lo1: g.lo1, la1: g.la1, lo2: g.lo2, la2: g.la2,
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

// Pendenza → heatmap: sotto i 30° il punto resta piano/trasparente (si vede
// solo la mappa), da lì in su le fasce ricalcano esattamente le soglie già
// annunciate nel titolo del layer (giallo/arancio/rosso/viola) — nessun
// gradiente continuo perché quelle soglie sono una promessa già fatta
// all'utente, non solo un'estetica. L'opacità cresce con la pendenza (non
// solo il colore): è l'effetto "zone ripide mostrate diversamente da quelle
// piatte" richiesto, non un semplice ricolorare uniforme.
const SLOPE_STOPS = [
  [30, [250, 204, 21]],  // giallo
  [35, [249, 115, 22]],  // arancio
  [40, [239, 68, 68]],   // rosso
  [45, [168, 85, 247]],  // viola
];
function slopeColor(deg) {
  for (let i = SLOPE_STOPS.length - 1; i >= 0; i--) {
    if (deg >= SLOPE_STOPS[i][0]) return SLOPE_STOPS[i][1];
  }
  return SLOPE_STOPS[0][1];
}
function slopeAlpha(deg) {
  if (deg < 30) return 0;
  return Math.min(0.8, 0.4 + (deg - 30) / 40);
}
const slopeCanvas = (slopes, nx, ny) =>
  fieldCanvas(slopes, nx, ny, slopeColor, { alphaFn: slopeAlpha });
const SLOPE_GRADIENT = `linear-gradient(90deg, ${SLOPE_STOPS.map(
  ([, c]) => `rgb(${c.join(",")})`
).join(",")})`;

// Dissolvenza incrociata per i campi meteo (temp/UV/nuvole): al posto dello
// scatto secco removeLayer+addTo, il nuovo overlay nasce a opacity 0 e sale
// al suo target, il vecchio scende a 0 e si rimuove dopo la transizione
// (.wx-field-overlay in globals.css). Il doppio requestAnimationFrame serve
// perché il browser deve "vedere" il primo paint a opacity:0 prima che un
// cambio successivo abbia davvero una transizione da cui partire — un solo
// rAF a volte collassa i due stati nello stesso frame e la CSS transition
// non ha nulla da animare.
//
// Replicato a ±360°: un ImageOverlay è ancorato a UN rettangolo lat/lon
// fisso — a differenza dei tile (che Leaflet ripete da sé) o del terminatore
// giorno/notte (ridisegnato da zero a ogni pan sui bound ESATTI della vista
// corrente, quindi segue automaticamente qualunque copia del planisfero),
// un'unica immagine non compare mai nella copia adiacente del mondo. Tre
// copie identiche (stessa immagine, stesso URL — nessun costo aggiuntivo di
// calcolo) spostate di -360°/0°/+360° in longitudine coprono la vista
// corrente più le due adiacenti, che è quanto serve per un pan normale.
const FIELD_FADE_MS = 260; // in sync con la transition di .wx-field-overlay
const WORLD_COPY_OFFSETS = [-360, 0, 360];
function swapFieldOverlay(S, map, slotKey, makeSpec, targetOpacity) {
  const { L } = S.current;
  const prev = S.current[slotKey];
  const { url, bounds } = makeSpec();
  const [[la2, lo1], [la1, lo2]] = bounds;
  const next = WORLD_COPY_OFFSETS.map((k) =>
    L.imageOverlay(url, [[la2, lo1 + k], [la1, lo2 + k]], {
      opacity: 0, interactive: false, className: "wx-field-overlay",
    }).addTo(map)
  );
  next.forEach((l) => l.bringToFront?.());
  S.current[slotKey] = next;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (S.current[slotKey] !== next) return; // già superato da un refresh più recente
      next.forEach((l) => l.setOpacity(targetOpacity));
    });
  });
  if (prev) {
    prev.forEach((l) => l.setOpacity(0));
    const timer = setTimeout(() => prev.forEach((l) => map.removeLayer(l)), FIELD_FADE_MS + 40);
    (S.current.fieldFadeTimers ??= new Set()).add(timer);
  }
}
// Percorso di spegnimento (nessun sostituto): sfuma le copie attive e poi le
// toglie, stesso principio della metà "in uscita" di swapFieldOverlay sopra.
function fadeOutFieldOverlay(S, map, slotKey) {
  const layers = S.current[slotKey];
  if (!layers) return;
  S.current[slotKey] = null;
  layers.forEach((l) => l.setOpacity(0));
  const timer = setTimeout(() => layers.forEach((l) => map.removeLayer(l)), FIELD_FADE_MS + 40);
  (S.current.fieldFadeTimers ??= new Set()).add(timer);
}

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
// Il radar RainViewer arriva già come tile colorate (nessun valore numerico
// per pixel, a differenza di temp/UV/nuvole che disegniamo noi): scala
// statica leggera→intensa nella stessa convenzione blu→verde→giallo→rosso
// dei radar meteo, come UV/Nuvole/Aurora sopra (anche loro fisse, non
// ricalcolate sulla vista).
const RADAR_GRADIENT =
  "linear-gradient(90deg, #6dd1f7, #34a1e0, #34c759, #ffd60a, #ff9500, #ff3b30, #af52de)";


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

// Spillo di un risultato "Pianifica gita": niente icone meteo qui (sarebbe
// la stessa logica di WxIcon duplicata a mano in stringa HTML per un
// popup) — giorno + temperatura massima bastano per un riepilogo al volo,
// il dettaglio vero resta nel pannello Pianifica stesso.
function popupHtmlPlan(place, week) {
  const days = (week?.giorni || []).slice(0, 4)
    .map((g) => `<span style="display:inline-flex;flex-direction:column;align-items:center;gap:2px;min-width:38px">
        <b style="font-size:9px;font-weight:800;letter-spacing:.4px;text-transform:uppercase;opacity:.65">${
          new Date(`${g.data}T12:00:00`).toLocaleDateString("it-IT", { weekday: "short" })
        }</b>
        <span style="font-size:13px;font-weight:800">${Math.round(g.temp_max_c)}°</span>
      </span>`)
    .join("");
  return `<div style="min-width:190px;line-height:1.55">
    <b style="font-size:14px">${place.name}</b>
    ${days ? `<div style="display:flex;gap:8px;margin-top:8px">${days}</div>`
           : `<div style="margin-top:6px;font-size:12px;opacity:.7">Meteo non disponibile</div>`}
  </div>`;
}

//: colore pista da sci — scala alpina standard (verde/blu/rosso/nero) per
//  discesa; il fondo non segue quella scala (tecnica libera/classica, non
//  difficoltà), un solo colore lo distingue a colpo d'occhio dalle piste da
//  discesa. difficulty assente/non riconosciuta → grigio neutro (mai un
//  colore di difficoltà inventato).
const PISTE_COLOR = {
  novice: "#22c55e", easy: "#3b82f6", intermediate: "#ef4444",
  advanced: "#111827", expert: "#111827", freeride: "#f97316",
};
// DEFAULT_ACTIVITY_COLORS vive in lib/settings.js — unica fonte, letta
// anche dalle Impostazioni per colorare il chip "Predefinito" col vero
// colore dell'attività invece di un chip di solo testo.
function activityColor(key, settings) {
  return settings?.activityColors?.[key] || DEFAULT_ACTIVITY_COLORS[key];
}

// Solo l'eventuale override, senza fallback — per "falesie", che non ha un
// colore predefinito in JS (segue --marker-crag, dipendente dal tema).
function activityColorOverride(key, settings) {
  return settings?.activityColors?.[key] || null;
}

function pisteColor(p, settings) {
  if (p.kind === "nordic") return activityColor("skifondo", settings);
  return PISTE_COLOR[p.difficulty] || "#94a3b8";
}

const PISTE_DIFFICULTY_LABEL = {
  novice: "Molto facile", easy: "Facile", intermediate: "Media difficoltà",
  advanced: "Difficile", expert: "Molto difficile", freeride: "Fuoripista",
};

function popupHtmlPiste(p) {
  const diff = p.kind === "nordic"
    ? "Sci di fondo"
    : PISTE_DIFFICULTY_LABEL[p.difficulty] || "Difficoltà non censita";
  return `<div style="min-width:180px;line-height:1.55">
    <b style="font-size:14px">${p.name}</b><br/><span style="font-size:12px;opacity:.7">${diff}</span>
  </div>`;
}

// useFlyoutMenu è stato cancellato, non ristilizzato (regola 1.7): livelli e
// campi meteo sono rail e segmented sempre visibili, e un menu che si apre
// sopra la mappa nasconde proprio la cosa che stai guardando mentre cambi
// il modo in cui è disegnata.

const BASES = ["chiaro", "terreno", "scuro"];

export default function MapView({
  fullscreen = false, focusRoute = null, focusCrag = null, children, days = null,
}) {
  const mapEl = useRef(null);
  const S = useRef({});
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState("Carico la mappa…");
  // Nessun campo acceso finché le Impostazioni (defaultFields, applicate
  // subito sotto non appena disponibili) non dicono diversamente — vedi
  // lib/settings.js.
  const [temp, setTemp] = useState(false);
  const [wind, setWind] = useState(false);
  const [radar, setRadar] = useState(false);
  const [frames, setFrames] = useState([]);
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [tempRange, setTempRange] = useState(null);
  const [windRange, setWindRange] = useState(null); // [min,max] m/s nella vista corrente
  const [season, setSeason] = useState(false); // true = a bulletin is in force somewhere
  const [slope, setSlope] = useState(false);
  const slopeWarnedRef = useRef(false); // un solo avviso per accensione se le quote non arrivano
  // Anteprima grande di un itinerario/MTB cliccato sulla mappa (sovraimpressione,
  // non il minuscolo popup Leaflet di prima) — null quando non c'è nulla di
  // selezionato. "Scheda itinerario" dentro la card porta alla pagina piena
  // (ora un pannello laterale, vedi app/(map)/routes/[slug]/page.js), non
  // rimpiazza questa anteprima.
  const [selectedRoute, setSelectedRoute] = useState(null);
  // Esc chiude l'anteprima grande di un itinerario/MTB, come la × —
  // nessun listener quando non c'è nulla di selezionato.
  useEffect(() => {
    if (!selectedRoute) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") setSelectedRoute(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [selectedRoute]);
  // Esc rimuove anche lo spillo dell'ultimo click sulla mappa
  // (S.current.pinMarker, piazzato dal listener "click" più sotto): prima
  // non c'era modo di tornare a una mappa senza segnaposto una volta
  // piazzato — un nuovo click lo spostava, ma nulla lo toglieva. Vive in
  // S.current (non stato React), quindi legge/scrive quel ref direttamente
  // invece di dipendere da uno stato che farebbe ri-registrare l'effetto
  // ad ogni click.
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key !== "Escape") return;
      const { map, pinMarker } = S.current;
      if (map && pinMarker) {
        map.removeLayer(pinMarker);
        S.current.pinMarker = null;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
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

  const [showRoutes, setShowRoutes] = useState(false); // nessuna attività attiva di default
  const [showCrags, setShowCrags] = useState(false);
  const [showMtb, setShowMtb] = useState(false); // come Falesie: attività specifica, opt-in
  const [showSki, setShowSki] = useState(false);
  const [showSkifondo, setShowSkifondo] = useState(false);

  const { settings, setSetting, ready: settingsReady } = useSettings();
  // Letto dai closure di lunga vita (iconCreateFunction dei cluster, stringhe
  // di stile costruite una volta sola alla creazione del layer) che altrimenti
  // resterebbero legati al valore di `settings` catturato in quel momento —
  // vedi l'effect di ricolorazione più sotto, che aggiorna anche questi.
  S.current.settings = settings;

  // Sfondo mappa (Chiaro/Terreno/Scuro): niente più uno switch rapido sulla
  // mappa (era il segmented prima del trigger Meteo) — si sceglie dalle
  // Impostazioni, e l'ultimo scelto È il default per la prossima apertura,
  // niente distinzione "acceso ora" / "acceso di default" come per campi
  // meteo e attività: un solo stato, sempre sincronizzato con settings.
  const base = settings.mapBase;
  const setBase = (v) => setSetting("mapBase", v);

  // Applica UNA sola volta le preferenze "acceso all'avvio" (Impostazioni →
  // Meteo predefinito / Attività all'avvio) non appena le preferenze vere
  // sono disponibili (settingsReady, dopo il mount — vedi SettingsProvider,
  // prima di quel momento settings è ancora il DEFAULTS server-side, che ha
  // già tutto spento: nessun hydration mismatch). Un ref, non un altro
  // useState, perché non deve MAI più rieseguirsi dopo il primo giro — se
  // no, cambiare le Impostazioni a runtime riaccenderebbe campi che
  // l'utente aveva appena spento a mano.
  const defaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (!settingsReady || defaultsAppliedRef.current) return;
    defaultsAppliedRef.current = true;
    const df = settings.defaultFields;
    if (df.includes("temp")) setTemp(true);
    if (df.includes("wind")) setWind(true);
    if (df.includes("radar")) setRadar(true);
    if (df.includes("uv")) setUv(true);
    if (df.includes("clouds")) setClouds(true);
    if (df.includes("sun")) setSun(true);
    if (df.includes("aurora")) setAurora(true);
    if (df.includes("lightning")) setLightning(true);
    const da = settings.defaultActivities;
    if (da.includes("rt")) setShowRoutes(true);
    if (da.includes("fal")) setShowCrags(true);
    if (da.includes("mtb")) setShowMtb(true);
    if (da.includes("skifondo")) setShowSkifondo(true);
    if (da.includes("ski")) setShowSki(true);
  }, [settingsReady, settings]);

  // Rail (livelli/attività), campi meteo e strumenti: a scomparsa dopo
  // qualche secondo di inattività, tornano visibili a qualunque interazione
  // sulla pagina — stesso pattern della navbar immersiva (vedi useAutoHide.js).
  const railAutoHide = useAutoHide(ready);
  const fieldsAutoHide = useAutoHide(ready);
  const toolsAutoHide = useAutoHide(ready);
  const [locating, setLocating] = useState(false);

  // Un solo pannello a comparsa aperto alla volta su tutta la mappa (Attività,
  // Meteo, Impostazioni, Info): senza, fissandone uno con un click e poi
  // passando sopra un altro (hover) si sovrapponevano, illeggibili.
  // className del FlyoutGroup fa da id — vedi MapChrome.js.
  const [activeFlyout, setActiveFlyout] = useState(null);
  useEffect(() => {
    document.documentElement.classList.toggle("flyout-pinned", !!activeFlyout);
    return () => document.documentElement.classList.remove("flyout-pinned");
  }, [activeFlyout]);

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
          // Latitudine limitata a dove i tile esistono davvero (Web Mercator,
          // ±85.06°) — oltre non c'è nulla da mostrare, solo lo sfondo del
          // container (fasce nere sopra/sotto quando si trascina troppo in
          // verticale). Longitudine SENZA limiti (Infinity): il pan
          // orizzontale libero intorno al globo resta intatto, solo il verticale
          // ha davvero un bordo oltre cui non c'è mappa.
          maxBounds: [[-85.06, -Infinity], [85.06, Infinity]],
          maxBoundsViscosity: 1.0,
        }).setView([46.1, 10.4], 7);
        const zoomCtl = L.control.zoom({ position: "topleft" }).addTo(map);
        // Leaflet disegna +/- col carattere di sistema (bruttino, spesso non
        // centrato verticalmente): un segno vettoriale coerente col resto
        // delle icone dell'app (stesso stroke arrotondato di WxIcon.Glyph).
        if (zoomCtl._zoomInButton) zoomCtl._zoomInButton.innerHTML = ZOOM_IN_SVG;
        if (zoomCtl._zoomOutButton) zoomCtl._zoomOutButton.innerHTML = ZOOM_OUT_SVG;
        setTimeout(() => map.invalidateSize(), 50);

        const bases = {
          chiaro: L.tileLayer(cartoTileUrl("rastertiles/voyager"), {
            maxZoom: 18, attribution: '© <a href="https://carto.com">CARTO</a> · © OpenStreetMap',
          }),
          terreno: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
            maxZoom: 16, attribution: '© <a href="https://opentopomap.org">OpenTopoMap</a> · © OpenStreetMap',
          }),
          scuro: L.tileLayer(cartoTileUrl("dark_all"), {
            maxZoom: 18, attribution: '© <a href="https://carto.com">CARTO</a> · © OpenStreetMap',
          }),
        };
        bases.chiaro.addTo(map);
        S.current = { L, map, bases, radarLayers: {} };

        // Riepilogo meteo (striscia giorni): non segue più il pan della
        // mappa (regola di questa modifica — un giro sulla mappa non deve
        // stravolgere "le previsioni di casa"), segue invece un riferimento
        // esplicito: casa (geolocalizzazione) o lo spillo dell'ultimo click.
        const emitLocation = (lat, lng, source, name) =>
          window.dispatchEvent(new CustomEvent("zt-map-center", { detail: { lat, lng, source, name } }));

        const placeHomeMarker = (lat, lng) => {
          if (S.current.homeMarker) map.removeLayer(S.current.homeMarker);
          S.current.homeMarker = L.marker([lat, lng], {
            interactive: false, zIndexOffset: 500,
            icon: L.divIcon({ className: "", html: HOME_MARKER_HTML, iconSize: [30, 30], iconAnchor: [15, 15] }),
          }).addTo(map);
        };
        S.current.placeHomeMarker = placeHomeMarker;

        // Un click vero — non un pan: Leaflet non emette "click" dopo un
        // drag, quindi qui dentro non serve distinguere i due gesti a mano.
        S.current.pinClickId = 0;
        map.on("click", (e) => {
          const { lat, lng } = e.latlng;
          if (S.current.pinMarker) map.removeLayer(S.current.pinMarker);
          S.current.pinMarker = L.marker([lat, lng], {
            interactive: false, zIndexOffset: 500,
            icon: L.divIcon({ className: "", html: PIN_MARKER_HTML, iconSize: [26, 34], iconAnchor: [13, 32] }),
          }).addTo(map);
          emitLocation(lat, lng, "pin"); // subito lat/lon, il nome (se c'è) arriva dopo
          const clickId = ++S.current.pinClickId;
          fetch(`${API_BASE}/localita/reverse?lat=${lat}&lon=${lng}`)
            .then((r) => (r.ok ? r.json() : null))
            .then((place) => {
              // Un click più recente ha già sostituito questo spillo: il nome
              // arrivato in ritardo non deve rimettere sotto il badge vecchio.
              if (place?.name && S.current.pinClickId === clickId) emitLocation(lat, lng, "pin", place.name);
            })
            .catch(() => {}); // niente nome → resta lat/lon, mai inventato
        });

        // Casa al mount: SOLO se il permesso è già stato concesso in una
        // visita precedente (Permissions API, non richiede mai il prompt da
        // sola) — la prima volta la posizione arriva solo dal Mirino
        // (gesto esplicito dell'utente, vedi handleLocate più sotto).
        if (navigator.geolocation && navigator.permissions?.query) {
          navigator.permissions.query({ name: "geolocation" }).then((status) => {
            if (dead || status.state !== "granted") return;
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                if (dead) return;
                const { latitude, longitude } = pos.coords;
                placeHomeMarker(latitude, longitude);
                emitLocation(latitude, longitude, "home");
              },
              () => {},
              { timeout: 10000 }
            );
          }).catch(() => {});
        }

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
              // Scala del vento (legenda + colore delle particelle) ricalcolata
              // sulla vista corrente, stessa logica della temperatura: la
              // scala "0–58 km/h" fissa aveva senso solo per il caso peggiore
              // di tutta Italia, non per un lembo di Alpi con vento debole.
              const [uComp, vComp] = data.wind;
              const speeds = uComp.data.map((u, i) => Math.hypot(u, vComp.data[i]));
              setWindRange([Math.min(...speeds), Math.max(...speeds)]);
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
        // Sotto pericolo, il colore del cluster segue l'attività SOLO se tutti
        // i marker che contiene sono della stessa (un blob non può mostrarne
        // due insieme) — altrimenti resta l'azzurro neutro di prima.
        const clusters = L.markerClusterGroup({
          maxClusterRadius: 55,
          disableClusteringAtZoom: 15,
          spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          iconCreateFunction: (cluster) => {
            const children = cluster.getAllChildMarkers();
            const maxDanger = Math.max(0, ...children.map((c) => c.options.dangerLevel || 0));
            const activities = new Set(children.map((c) => c.options.activityKey));
            const sameActivity = activities.size === 1 ? [...activities][0] : null;
            const color = maxDanger > 0
              ? DANGER_COLORS[maxDanger]
              : sameActivity ? activityColor(sameActivity, S.current.settings) : "#38bdf8";
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

        // MTB in un gruppo a parte, con un suo pulsante "MTB" nel rail
        // indipendente da "Itinerari": non è un'attività da neve (niente
        // bollettino valanghe, vedi backend/app/safety_filters.py
        // SNOW_ACTIVITIES), quindi niente colore-pericolo sui marker — solo
        // il suo colore attività (predefinito o personalizzato).
        const mtbClusters = L.markerClusterGroup({
          maxClusterRadius: 55, disableClusteringAtZoom: 15, spiderfyOnMaxZoom: true,
          showCoverageOnHover: false,
          iconCreateFunction: (cluster) => L.divIcon({
            className: "",
            html: `<span class="rt-cluster" style="--c:${activityColor("mtb_alpino", S.current.settings)}">${cluster.getChildCount()}</span>`,
            iconSize: [38, 38], iconAnchor: [19, 19],
          }),
        });
        S.current.mtbClusters = mtbClusters;
        const mtbTracks = L.layerGroup();
        S.current.mtbTracks = mtbTracks;

        // Un fetch per route IN PARALLELO, non in sequenza: con centinaia di
        // itinerari (espansione internazionale) un await per giro dentro il
        // for avrebbe tenuto la mappa su "Carico…" per lo stesso numero di
        // round-trip, uno via l'altro — qui il tempo totale è quello del più
        // lento dei fetch, non la somma di tutti.
        const eligible = routes.filter((r) => r.start_lat != null);
        const details = await Promise.all(
          eligible.map((r) =>
            fetch(`${API_BASE}/routes/${encodeURIComponent(r.slug)}`)
              .then((x) => (x.ok ? x.json() : null)).catch(() => null)
          )
        );
        // slug → { marker, pts, isMtb, lat, lon, name }: usata sotto per il
        // deep link iniziale E da un effect separato per riaprire un
        // itinerario diverso senza dover ricreare tutti i marker da capo
        // (la mappa ora resta viva passando da Itinerari a "/", niente più
        // remount — vedi app/(map)/layout.js).
        const routeMarkers = {};
        S.current.routeMarkers = routeMarkers;
        eligible.forEach((r, i) => {
          const detail = details[i];
          const isMtb = r.activity === "mtb_alpino";
          const area = byArea[r.area_id];
          // Danger color only when a bulletin is actually in force (MTB has
          // none to check — not a snow activity) — vince sempre sul colore
          // attività, è l'informazione più importante delle due.
          const dangerLevel = !isMtb && area?.bulletin?.status === "in_vigore" ? area.bulletin.danger_level : 0;
          const color = dangerLevel > 0 ? DANGER_COLORS[dangerLevel] || "#38bdf8" : activityColor(r.activity, settings);
          const pts = (detail?.track_points || []).map((p) => [p.lat, p.lon]);
          const tracksGroup = isMtb ? mtbTracks : routeTracks;
          // Riferimento alla polilinea colorata (non quella d'ombra sotto)
          // tenuto per il ricolorare-in-diretta più sotto — senza, l'unico
          // modo per aggiornarla sarebbe ricreare l'intero layer.
          let line = null;
          if (pts.length > 1) {
            L.polyline(pts, { color: "#0b1722", weight: 5, opacity: 0.25 }).addTo(tracksGroup);
            line = L.polyline(pts, { color, weight: 2.5, opacity: 0.95 }).addTo(tracksGroup);
          }
          const m = L.marker([r.start_lat, r.start_lon], {
            dangerLevel, activityKey: r.activity,
            icon: L.divIcon({
              className: "",
              html: `<span class="rt-dot" style="--c:${color}"></span>`,
              iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10],
            }),
          });
          m.bindTooltip(r.name, { direction: "top", offset: [0, -10] });
          // Anteprima grande (React, sovraimpressione) al posto del vecchio
          // popup minuscolo — vedi selectedRoute più sopra. `detail` è già
          // quello che serve a RouteCard, solo l'area va appiattita in
          // area_name (get_route ritorna un oggetto area annidato, list_routes
          // invece la stringa piatta che RouteCard si aspetta).
          const preview = detail
            ? {
                ...detail, area_name: detail.area?.name, country: detail.area?.country,
                // Bollettino/meteo dell'area — RouteCard non li mostra (è la
                // stessa card della lista Itinerari), l'anteprima sulla mappa
                // sì: era l'informazione utile del vecchio popup, non va persa.
                bulletin: area?.bulletin, forecast: area?.forecast,
              }
            : null;
          if (preview) {
            m.on("click", () => setSelectedRoute(preview));
          }
          (isMtb ? mtbClusters : clusters).addLayer(m);
          routeMarkers[r.slug] = { marker: m, line, pts, isMtb, lat: r.start_lat, lon: r.start_lon, name: r.name, preview };
        });
        // Initial add matches showRoutes/showMtb defaults; the dedicated
        // effects below (keyed on showRoutes/showMtb) handle it from here on.
        if (showRoutes) {
          map.addLayer(clusters);
          map.addLayer(routeTracks);
        }
        if (showMtb) {
          map.addLayer(mtbClusters);
          map.addLayer(mtbTracks);
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
      S.current.fieldFadeTimers?.forEach(clearTimeout);
      if (S.current.map) {
        // Leaflet pianifica un setTimeout(250ms) di riserva per completare
        // un'animazione di zoom in corso (workaround webkit per transitionend
        // che non parte sempre — leaflet-src.js, _onZoomTransitionEnd) — un
        // timer crudo, non un event listener, quindi map.remove() qui sotto
        // non lo annulla. Se scatta DOPO la rimozione trova _mapPane già
        // smontato e crasha su _getMapPanePos ("_leaflet_pos" di undefined).
        // Spegnere il flag prima del remove lo fa uscire subito (stesso guard
        // che la funzione usa già in testa), innocuo perché la mappa sta
        // comunque per sparire — riproducibile navigando via dalla mappa
        // (es. Impostazioni) mentre uno zoom è ancora in animazione.
        S.current.map._animatingZoom = false;
        S.current.map.remove();
      }
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

  // MTB: stesso pattern di "Itinerari", ma gruppo e toggle indipendenti
  // (vedi il commento sul mount — niente colore-pericolo, non è un'attività
  // da neve).
  useEffect(() => {
    const { map, mtbClusters, mtbTracks } = S.current;
    if (!map || !mtbClusters || !mtbTracks) return;
    [mtbClusters, mtbTracks].forEach((layer) => {
      if (showMtb) map.addLayer(layer);
      else map.removeLayer(layer);
    });
  }, [showMtb, ready]);

  // Deep link /?route=<slug> (Itinerari → click un itinerario con traccia):
  // reattivo, non solo al mount — la mappa ora resta viva passando da
  // Itinerari a "/" (route group "(map)", niente remount), quindi un
  // secondo itinerario scelto più tardi deve poter riaprire un marker
  // diverso senza un reload. Il marker è già lì (S.current.routeMarkers,
  // costruito una volta sola al mount): qui si accende solo il layer giusto
  // (se non lo era già) e si centra/apre il popup su quello scelto.
  useEffect(() => {
    if (!ready || !focusRoute) return;
    const { map, clusters, routeTracks, mtbClusters, mtbTracks, routeMarkers } = S.current;
    const entry = routeMarkers?.[focusRoute];
    if (!map || !entry) return;
    const { marker, isMtb, lat, lon, name } = entry;
    const group = isMtb ? mtbClusters : clusters;
    const tracks = isMtb ? mtbTracks : routeTracks;
    if (!map.hasLayer(group)) map.addLayer(group);
    if (!map.hasLayer(tracks)) map.addLayer(tracks);
    if (isMtb) setShowMtb(true); else setShowRoutes(true);
    // Solo pan, mai un nuovo livello di zoom — l'utente decide se e quanto
    // zoomare, qui si centra soltanto (stesso zoom di quando ha cliccato).
    map.panTo([lat, lon], { animate: true });
    setTimeout(() => marker.openPopup(), 350);
    window.dispatchEvent(new CustomEvent("zt-map-center",
      { detail: { lat, lng: lon, source: "route", name } }));
  }, [focusRoute, ready]);

  // Deep link /?crag=<slug> (Falesie → click una falesia): stessa idea di
  // focusRoute sopra, ma la falesia non ha un marker preesistente (il layer
  // Falesie si carica lazy solo al primo toggle-on, vedi sotto) — un marker
  // dedicato, indipendente da quel layer, così funziona anche a Falesie spento.
  useEffect(() => {
    if (!ready || !focusCrag) return;
    const { L, map } = S.current;
    if (!map) return;
    let dead = false;
    fetch(`${API_BASE}/falesie/${encodeURIComponent(focusCrag)}/sole`)
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => {
        if (dead || !c || c.lat == null) return;
        if (S.current.cragFocusMarker) map.removeLayer(S.current.cragFocusMarker);
        const m = L.marker([c.lat, c.lon], {
          icon: L.divIcon({
            className: "", html: `<span class="crag-dot"></span>`,
            iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -8],
          }),
        }).addTo(map);
        m.bindPopup(popupHtmlCrag(c));
        S.current.cragFocusMarker = m;
        // Solo pan: stesso zoom di prima, mai uno automatico (vedi focusRoute sopra).
        map.panTo([c.lat, c.lon], { animate: true });
        setTimeout(() => m.openPopup(), 350);
        window.dispatchEvent(new CustomEvent("zt-map-center",
          { detail: { lat: c.lat, lng: c.lon, source: "crag", name: c.name } }));
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [focusCrag, ready]);

  // Risultati "Pianifica gita": zero coordinate nella risposta del planner
  // (solo route_id/nome, vedi backend/app/models.py PlanCandidate) — la
  // pagina Planner recupera lat/lon di ogni candidato sicuro via
  // /routes/{slug} e le manda qui con un evento, uno spillo numerato per
  // posto con la sua mini-previsione già aperta (non un click alla volta:
  // "per ogni pin" nella richiesta era esplicito). Ascolto sempre attivo
  // (mount-once): la mappa persiste tra le pagine, l'evento può arrivare
  // in qualunque momento dopo il primo submit del planner.
  useEffect(() => {
    const onPins = (e) => {
      const { L, map } = S.current;
      if (!map) return;
      if (S.current.planPinsLayer) map.removeLayer(S.current.planPinsLayer);
      const places = (e.detail?.places || []).filter((p) => p.lat != null && p.lon != null);
      if (!places.length) return;
      const group = L.layerGroup().addTo(map);
      S.current.planPinsLayer = group;
      (async () => {
        const bounds = [];
        for (const [i, p] of places.entries()) {
          const m = L.marker([p.lat, p.lon], {
            icon: L.divIcon({
              className: "", html: `<span class="plan-pin">${i + 1}</span>`,
              iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -13],
            }),
          });
          m.addTo(group);
          bounds.push([p.lat, p.lon]);
          const week = await fetch(
            `${API_BASE}/localita/settimana?lat=${p.lat.toFixed(3)}&lon=${p.lon.toFixed(3)}&ele=0`
          ).then((r) => (r.ok ? r.json() : null)).catch(() => null);
          if (S.current.planPinsLayer !== group) return; // risultati sostituiti nel frattempo
          m.bindPopup(popupHtmlPlan(p, week), { autoClose: false, closeOnClick: false });
          m.openPopup();
        }
        // Solo pan al centroide, mai un nuovo zoom (vedi focusRoute sopra —
        // stessa regola: l'unico zoom che conta è quello che sceglie l'utente).
        if (bounds.length > 0) {
          const centroid = [
            bounds.reduce((s, b) => s + b[0], 0) / bounds.length,
            bounds.reduce((s, b) => s + b[1], 0) / bounds.length,
          ];
          map.panTo(centroid, { animate: true });
        }
      })();
    };
    window.addEventListener("zt-result-pins", onPins);
    return () => window.removeEventListener("zt-result-pins", onPins);
  }, []);

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
        // Predefinito: --marker-crag segue il tema (vedi globals.css, un
        // colore per Scuro/Chiaro/Bosco/Mare) — un override esplicito lo
        // scavalca con uno stile inline, così vince sulla variabile CSS
        // ereditata senza dover riscrivere le regole del tema. Letto da
        // S.current.settings (non `settings` di chiusura) sia qui sia
        // nell'iconCreateFunction, così un cambio colore resta live anche
        // se questo layer è stato costruito tempo fa — vedi l'effect di
        // ricolorazione più sotto, che chiama cragStyleAttr() di nuovo.
        const cragStyleAttr = () => {
          const ov = activityColorOverride("falesie", S.current.settings);
          return ov ? ` style="--marker-crag:${ov};--marker-crag-ink:#04121f"` : "";
        };
        const group = L.markerClusterGroup({
          maxClusterRadius: 50, disableClusteringAtZoom: 15, showCoverageOnHover: false,
          iconCreateFunction: (cluster) => L.divIcon({
            className: "", html: `<span class="crag-cluster"${cragStyleAttr()}>${cluster.getChildCount()}</span>`,
            iconSize: [34, 34], iconAnchor: [17, 17],
          }),
        });
        const cragMarkers = [];
        for (const c of crags) {
          if (c.lat == null || c.lon == null) continue;
          const m = L.marker([c.lat, c.lon], {
            icon: L.divIcon({
              className: "", html: `<span class="crag-dot"${cragStyleAttr()}></span>`,
              iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -8],
            }),
          });
          m.bindTooltip(c.name, { direction: "top", offset: [0, -8] });
          m.bindPopup(popupHtmlCrag(c));
          group.addLayer(m);
          cragMarkers.push(m);
        }
        S.current.cragsLayer = group;
        S.current.cragMarkers = cragMarkers;
        S.current.cragStyleAttr = cragStyleAttr;
      }
      if (!dead) map.addLayer(S.current.cragsLayer);
    })();
    return () => { dead = true; };
  }, [showCrags, ready]);

  // Piste (discesa + fondo): stesso accorpamento di Itinerari/MTB/Falesie —
  // un marker per pista (nel punto medio del tracciato) dentro un
  // L.markerClusterGroup, così a zoom molto in fuori si vede un unico blob
  // col conteggio invece di centinaia di linee sovrapposte (l'espansione
  // internazionale ne porta ben più delle poche decine di prima). Il
  // tracciato vero resta comunque sempre disegnato, in un layer separato
  // non raggruppato — stesso schema di routeTracks/mtbTracks. Colore
  // cluster fisso per kind (blu discesa generico, ciano fondo): un "colore
  // peggiore vince" come per il pericolo valanghe non avrebbe un ordine
  // onesto per un grado sci (nero non è "più pericoloso" di rosso, solo una
  // convenzione di classificazione diversa).
  useEffect(() => {
    const { L, map } = S.current;
    if (!map) return;
    if (!showSki && !showSkifondo) {
      [S.current.skiCluster, S.current.skiTracks,
       S.current.skifondoCluster, S.current.skifondoTracks]
        .forEach((layer) => layer && map.removeLayer(layer));
      return;
    }
    let dead = false;
    (async () => {
      if (!S.current.skiCluster) {
        const pistes = await fetch(`${API_BASE}/pistes`)
          .then((r) => (r.ok ? r.json() : []))
          .catch(() => []);
        if (dead) return;
        // getColor() invece di un colore fisso alla creazione: "fondo" è
        // personalizzabile (S.current.settings letto live), "discesa" resta
        // sempre blu (convenzione reale, vedi commento sopra) ma la stessa
        // forma di chiamata evita due percorsi diversi qui sotto.
        const makeCluster = (getColor) => L.markerClusterGroup({
          maxClusterRadius: 50, disableClusteringAtZoom: 15, showCoverageOnHover: false,
          iconCreateFunction: (cluster) => L.divIcon({
            className: "", html: `<span class="rt-cluster" style="--c:${getColor()}">${cluster.getChildCount()}</span>`,
            iconSize: [34, 34], iconAnchor: [17, 17],
          }),
        });
        const skiCluster = makeCluster(() => "#3b82f6");
        const skifondoCluster = makeCluster(() => activityColor("skifondo", S.current.settings));
        const skiTracks = L.layerGroup();
        const skifondoTracks = L.layerGroup();
        // Riferimenti marker+linea per pista, tenuti per il ricolorare-in-
        // diretta (solo "fondo" è personalizzabile — vedi l'effect sotto).
        const pisteEntries = [];
        for (const p of pistes) {
          if (!Array.isArray(p.coords) || p.coords.length < 2) continue;
          const color = pisteColor(p, settings);
          const line = L.polyline(p.coords, { color, weight: 3, opacity: 0.85 });
          line.bindTooltip(p.name, { sticky: true });
          line.bindPopup(popupHtmlPiste(p));
          const mid = p.coords[Math.floor(p.coords.length / 2)];
          const marker = L.marker(mid, {
            icon: L.divIcon({
              className: "", html: `<span class="rt-dot" style="--c:${color}"></span>`,
              iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10],
            }),
          });
          marker.bindTooltip(p.name, { direction: "top", offset: [0, -10] });
          marker.bindPopup(popupHtmlPiste(p));
          const isNordic = p.kind === "nordic";
          (isNordic ? skifondoTracks : skiTracks).addLayer(line);
          (isNordic ? skifondoCluster : skiCluster).addLayer(marker);
          if (isNordic) pisteEntries.push({ marker, line });
        }
        S.current.pisteEntries = pisteEntries;
        S.current.skiCluster = skiCluster;
        S.current.skifondoCluster = skifondoCluster;
        S.current.skiTracks = skiTracks;
        S.current.skifondoTracks = skifondoTracks;
      }
      if (dead) return;
      [S.current.skiCluster, S.current.skiTracks].forEach((layer) => {
        if (showSki) map.addLayer(layer);
        else map.removeLayer(layer);
      });
      [S.current.skifondoCluster, S.current.skifondoTracks].forEach((layer) => {
        if (showSkifondo) map.addLayer(layer);
        else map.removeLayer(layer);
      });
    })();
    return () => { dead = true; };
  }, [showSki, showSkifondo, ready]);

  // Ricolorazione in diretta: quando l'utente cambia un colore attività in
  // Impostazioni, l'utente vuole vederlo SUBITO sulla mappa per valutare se
  // gli piace, non al prossimo caricamento. I layer sopra sono costruiti una
  // sola volta (mount, o al primo toggle-on) e restano vivi tra le pagine —
  // qui si aggiornano i marker/tracciati già disegnati invece di ricrearli.
  // I badge dei cluster si aggiornano da soli: le loro iconCreateFunction
  // sopra leggono già S.current.settings (mai la `settings` di chiusura),
  // refreshClusters() le richiama con lo stato attuale.
  useEffect(() => {
    const { L, map } = S.current;
    if (!map || !ready) return;
    // refreshClusters() presuppone che il gruppo sia già stato aggiunto alla
    // mappa (onAdd inizializza le strutture interne del plugin) — un layer
    // spento di default (tutte le attività partono spente) esiste ma non è
    // ancora "montato": chiamarlo comunque rompe con un TypeError interno.
    const refresh = (group) => { if (group && map.hasLayer(group)) group.refreshClusters(); };

    const routeMarkers = S.current.routeMarkers || {};
    for (const slug in routeMarkers) {
      const entry = routeMarkers[slug];
      const dangerLevel = entry.marker.options.dangerLevel || 0;
      const color = dangerLevel > 0
        ? DANGER_COLORS[dangerLevel] || "#38bdf8"
        : activityColor(entry.marker.options.activityKey, settings);
      entry.marker.setIcon(L.divIcon({
        className: "",
        html: `<span class="rt-dot" style="--c:${color}"></span>`,
        iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10],
      }));
      entry.line?.setStyle({ color });
    }
    refresh(S.current.clusters);
    refresh(S.current.mtbClusters);

    if (S.current.cragMarkers) {
      const cragStyle = S.current.cragStyleAttr?.() || "";
      for (const m of S.current.cragMarkers) {
        m.setIcon(L.divIcon({
          className: "", html: `<span class="crag-dot"${cragStyle}></span>`,
          iconSize: [16, 16], iconAnchor: [8, 8], popupAnchor: [0, -8],
        }));
      }
      refresh(S.current.cragsLayer);
    }

    if (S.current.pisteEntries) {
      const color = activityColor("skifondo", settings);
      for (const { marker, line } of S.current.pisteEntries) {
        marker.setIcon(L.divIcon({
          className: "", html: `<span class="rt-dot" style="--c:${color}"></span>`,
          iconSize: [18, 18], iconAnchor: [9, 9], popupAnchor: [0, -10],
        }));
        line.setStyle({ color });
      }
      refresh(S.current.skifondoCluster);
    }
  }, [settings.activityColors, ready]);

  // temperature color field — dissolvenza incrociata, vedi swapFieldOverlay
  useEffect(() => {
    const { L, map, grid } = S.current;
    if (!map) return;
    if (temp && grid) {
      swapFieldOverlay(
        S, map, "tempOverlay",
        () => ({
          url: tempCanvas(grid.temps, grid.nx, grid.ny),
          bounds: [[grid.la2, grid.lo1], [grid.la1, grid.lo2]],
        }),
        0.4
      );
    } else {
      fadeOutFieldOverlay(S, map, "tempOverlay");
    }
  }, [temp, ready, gridVersion]);

  // UV index field
  useEffect(() => {
    const { L, map, grid } = S.current;
    if (!map) return;
    if (uv && grid) {
      swapFieldOverlay(
        S, map, "uvOverlay",
        () => ({
          url: uvCanvas(grid.uvs, grid.nx, grid.ny),
          bounds: [[grid.la2, grid.lo1], [grid.la1, grid.lo2]],
        }),
        0.45
      );
    } else {
      fadeOutFieldOverlay(S, map, "uvOverlay");
    }
  }, [uv, ready, gridVersion]);

  // Cloud cover field
  useEffect(() => {
    const { L, map, grid } = S.current;
    if (!map) return;
    if (clouds && grid) {
      swapFieldOverlay(
        S, map, "cloudOverlay",
        () => ({
          url: cloudCanvas(grid.clouds, grid.nx, grid.ny),
          bounds: [[grid.la2, grid.lo1], [grid.la1, grid.lo2]],
        }),
        0.5
      );
    } else {
      fadeOutFieldOverlay(S, map, "cloudOverlay");
    }
  }, [clouds, ready, gridVersion]);

  // Pendenza: heatmap dinamica sulla vista corrente (Copernicus DEM via
  // Open-Meteo elevation, stessa griglia del meteo — vedi computeSlopes) al
  // posto dei tile statici pregenerati per una sola area pilota: funziona
  // ovunque nel mondo, stesso trattamento (dissolvenza + copie ±360°) di
  // temp/UV/nuvole.
  useEffect(() => {
    const { L, map, grid } = S.current;
    if (!map) return;
    if (!slope) {
      slopeWarnedRef.current = false;
      fadeOutFieldOverlay(S, map, "slopeOverlay");
      return;
    }
    if (grid?.slopes) {
      slopeWarnedRef.current = false;
      swapFieldOverlay(
        S, map, "slopeOverlay",
        () => ({
          url: slopeCanvas(grid.slopes, grid.nx, grid.ny),
          bounds: [[grid.la2, grid.lo1], [grid.la1, grid.lo2]],
        }),
        1
      );
    } else if (grid && !slopeWarnedRef.current) {
      // La griglia meteo è arrivata ma le quote no (tipicamente: quota
      // giornaliera dell'elevation API di Open-Meteo esaurita, indipendente
      // da quella oraria del meteo) — un avviso esplicito una volta sola per
      // accensione, non un fallimento silenzioso: senza, il toggle sembra
      // rotto invece che "dati momentaneamente non disponibili". Non si
      // ripete a ogni pan finché resta acceso, altrimenti sarebbe spam.
      slopeWarnedRef.current = true;
      showTransientMsg("Pendenze non disponibili al momento (quote non raggiungibili) — riprova più tardi.");
    }
  }, [slope, ready, gridVersion]);

  // wind particles (color scale adapts to what's beneath)
  useEffect(() => {
    const { L, map, grid } = S.current;
    if (!map) return;
    if (!wind || !grid) {
      if (S.current.velocity) {
        map.removeLayer(S.current.velocity);
        S.current.velocity = null;
      }
      return;
    }
    const scale = windColorScale(base === "scuro" || temp);
    // Scala min/max ricalcolata sulla vista corrente (vedi windRange sopra),
    // non più fissa a 0–16 m/s (~58 km/h, il caso peggiore di tutta Italia):
    // così un lembo di Alpi con vento debole usa davvero tutta la scala di
    // colore invece di restare quasi tutto sul primo colore, appiattito.
    const minV = windRange ? windRange[0] : 0;
    const maxV = windRange ? Math.max(windRange[1], minV + 1) : 16;
    if (S.current.velocity) {
      // Aggiorna dati/colore sul layer già in mappa invece di ricrearlo ad
      // ogni pan/zoom (gridVersion cambia in continuazione): oltre a essere
      // più leggero, evita un bug noto di leaflet-velocity — il vecchio
      // layer ha un requestAnimationFrame di disegno già schedulato, e se
      // arriva DOPO la rimozione (Leaflet azzera _map in removeLayer)
      // crasha su this._map.getSize(). Ricreare il layer solo quando serve
      // davvero (vento appena acceso) tiene questa corsa rara invece che
      // su ogni singolo movimento della mappa.
      S.current.velocity.setOptions({
        data: grid.wind, colorScale: scale, minVelocity: minV, maxVelocity: maxV,
      });
      return;
    }
    S.current.velocity = L.velocityLayer({
      data: grid.wind,
      displayValues: true,
      displayOptions: {
        // bottomright: impilato sopra l'attribuzione Leaflet, che sta nello
        // stesso angolo appena sotto (vedi margine in .mapshell
        // .leaflet-control-velocity).
        velocityType: "vento 10 m", position: "bottomright",
        emptyString: "", speedUnit: "m/s",
      },
      minVelocity: minV, maxVelocity: maxV, velocityScale: 0.008,
      particleMultiplier: 1 / 260, lineWidth: 1.3, particleAge: 55,
      colorScale: scale,
    }).addTo(map);
    // Rete di sicurezza residua per lo stesso bug: se il layer viene
    // acceso e spento di scatto (toggle rapido), resta comunque una
    // finestra minima prima che il primo frame parta. Un guard sull'istanza
    // (non sul prototipo — non tocca node_modules, sopravvive a npm
    // install) rende il vecchio frame un no-op invece di un crash.
    const canvasLayer = S.current.velocity._canvasLayer;
    if (canvasLayer && typeof canvasLayer.drawLayer === "function") {
      const drawOriginal = canvasLayer.drawLayer.bind(canvasLayer);
      canvasLayer.drawLayer = () => {
        if (canvasLayer._map) drawOriginal();
      };
    }
  }, [wind, temp, base, ready, gridVersion, windRange]);

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

  // Messaggio che si pulisce da solo — a differenza del banner "dati non
  // raggiungibili" (quello resta finché non arriva un fetch buono), un
  // errore di geolocalizzazione è un evento singolo: non deve restare
  // appeso per sempre se l'utente non tocca più nulla.
  const showTransientMsg = (text, ms = 4500) => {
    setMsg(text);
    setTimeout(() => setMsg((m) => (m === text ? "" : m)), ms);
  };

  // Mirino — centra la mappa sulla posizione del browser, ci lascia la
  // casina (vedi placeHomeMarker in S.current) e la rende di nuovo il
  // riferimento del riepilogo meteo, anche se nel frattempo c'era uno
  // spillo piazzato con un click. Un secondo click aggiorna semplicemente
  // marker e vista — niente stato persistito oltre a quello del marker.
  const handleLocate = () => {
    const { map } = S.current;
    if (!map) return;
    if (!navigator.geolocation) {
      showTransientMsg("Geolocalizzazione non supportata da questo browser.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude } = pos.coords;
        map.flyTo([latitude, longitude], Math.max(map.getZoom(), 12), { duration: 1.2 });
        S.current.placeHomeMarker?.(latitude, longitude);
        window.dispatchEvent(new CustomEvent("zt-map-center",
          { detail: { lat: latitude, lng: longitude, source: "home" } }));
      },
      (err) => {
        setLocating(false);
        showTransientMsg(
          err.code === err.PERMISSION_DENIED
            ? "Permesso di geolocalizzazione negato."
            : "Posizione non disponibile al momento."
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // ── descrizione dichiarativa del chrome ──────────────────────────
  // Nessuno stato nuovo: sono gli stessi toggle di prima, elencati invece
  // che scritti a mano uno per uno dentro il JSX.
  // `variant` dà a ciascun campo un colore distinto da acceso (vedi
  // .railbtn.on.v-* in globals.css) — prima solo vento aveva un colore
  // diverso (alt/teal), tutti gli altri diventavano lo stesso blu accent:
  // con più campi accesi insieme erano indistinguibili a colpo d'occhio.
  // `icon` è il glifo rappresentativo del campo, stesso principio delle
  // voci di Attività: la lista Meteo ora è verticale con icona come quella,
  // non più una griglia di pillole di solo testo.
  const fields = [
    {
      key: "temp", label: "Temp", on: temp, toggle: () => setTemp(!temp), variant: "temp",
      icon: Icon.Thermometer,
    },
    {
      key: "wind", label: "Vento", on: wind, toggle: () => setWind(!wind), variant: "wind",
      icon: Icon.Wind,
    },
    {
      key: "radar", label: "Pioggia", on: radar, toggle: () => setRadar(!radar),
      disabled: !frames.length, variant: "radar", icon: Icon.Rain,
      title: frames.length ? undefined : "Radar RainViewer non raggiungibile",
    },
    { key: "uv", label: "UV", on: uv, toggle: () => setUv(!uv), variant: "uv", icon: Icon.Uv },
    {
      key: "clouds", label: "Nuvole", on: clouds, toggle: () => setClouds(!clouds), variant: "clouds",
      icon: Icon.Cloud,
    },
    {
      key: "sun", label: "Sole", on: sun, toggle: () => setSun(!sun), variant: "sun", icon: Icon.Sun,
      title: "Terminatore giorno/notte — calcolo astronomico reale",
    },
    {
      key: "aurora", label: "Aurora", on: aurora, toggle: () => setAurora(!aurora), variant: "aurora",
      icon: Icon.Aurora, tag: aurora && !auroraReady ? "…" : undefined,
      title: "Probabilità aurora — modello NOAA OVATION",
    },
    {
      key: "lightning", label: "Fulmini", on: lightning, variant: "lightning", icon: Icon.Bolt,
      toggle: () => setLightning(!lightning), tag: "demo",
      title: "Dati dimostrativi — nessuna fonte gratuita real-time ancora integrata",
    },
  ];

  // `color` è lo stesso colore dei pin di quella voce sulla mappa (vedi
  // activityColor()/--marker-crag più sopra) — solo dove esiste DAVVERO un
  // unico colore: "Itinerari" mischia 4 attività ciascuna col suo colore,
  // "Piste" segue la scala alpina ufficiale (verde/blu/rosso/nero) e
  // "Pendenze" è un overlay a bande (giallo→viola), nessuna delle tre ha UN
  // colore da rappresentare — inventarne uno sarebbe falso, restano quindi
  // senza (evidenziate con l'accento neutro, come prima).
  const allLayers = [
    {
      key: "rt", label: "Itin.", icon: Icon.Route, on: showRoutes, group: "estive",
      toggle: () => setShowRoutes(!showRoutes), title: "Itinerari: pin e tracce",
    },
    {
      key: "fal", label: "Falesie", icon: Icon.Crag, on: showCrags, group: "estive",
      toggle: () => setShowCrags(!showCrags),
      color: activityColorOverride("falesie", settings) || "var(--marker-crag)",
    },
    {
      key: "mtb", label: "MTB", icon: Icon.Bike, on: showMtb, group: "bici",
      toggle: () => setShowMtb(!showMtb), title: "Itinerari MTB: pin e tracce",
      color: activityColor("mtb_alpino", settings),
    },
    {
      key: "slope", label: "Pendenze", icon: Icon.Slope, on: slope, group: "terreno",
      toggle: () => setSlope(!slope),
      title: "Pendenze dal DEM Copernicus: giallo ≥30° · arancio ≥35° · rosso ≥40° · viola ≥45°",
    },
    {
      key: "skifondo", label: "Sci fondo", icon: Icon.CrossCountrySki, on: showSkifondo, group: "invernali",
      toggle: () => setShowSkifondo(!showSkifondo), title: "Piste da fondo: geometria reale da OpenStreetMap",
      color: activityColor("skifondo", settings),
    },
    {
      key: "ski", label: "Piste", icon: Icon.Ski, on: showSki, group: "invernali",
      toggle: () => setShowSki(!showSki), title: "Piste da discesa: geometria e difficoltà reale da OpenStreetMap",
    },
  ];
  // Impostazioni → "attività visualizzabili": decide quali di queste voci
  // offrire nel rail (non le accende/spegne, solo se compaiono). "Pendenze"
  // non è un'attività (è la conditional sopra, niente chiave in
  // ACTIVITY_KEYS) e resta sempre visibile quando c'è.
  // Un separatore compare all'inizio di ogni nuovo gruppo (estive/bici/
  // terreno/invernali), ma solo tra voci effettivamente visibili — così un
  // gruppo nascosto da Impostazioni non lascia una linea orfana.
  const layers = allLayers
    .filter((l) => !ACTIVITY_KEYS.includes(l.key) || settings.visibleActivities.includes(l.key))
    .map((l, i, arr) => ({ ...l, sep: i > 0 && l.group !== arr[i - 1].group }));

  // La legenda mostra SOLO le scale effettivamente attive: se non ce n'è
  // nessuna il pannello non viene renderizzato affatto (regola 1.9).
  const legendRows = [
    temp && tempRange && {
      key: "temp", label: "Temp",
      min: `${Math.round(tempRange[0])}°`, max: `${Math.round(tempRange[1])}°`,
      gradient: rangeGradient(tempRange[0], tempRange[1]),
    },
    wind && windRange && {
      key: "wind", label: "Vento",
      min: `${Math.round(windRange[0] * 3.6)}`, max: `${Math.round(windRange[1] * 3.6)} km/h`,
      gradient: windGradient(base === "scuro" || temp),
    },
    uv && { key: "uv", label: "UV", min: "0", max: "11+", gradient: uvGradient },
    clouds && { key: "clouds", label: "Nuvole", min: "0%", max: "100%", gradient: CLOUD_GRADIENT },
    radar && { key: "radar", label: "Pioggia", min: "leggera", max: "intensa", gradient: RADAR_GRADIENT },
    aurora && { key: "aurora", label: "Aurora", min: "bassa", max: "alta", gradient: AURORA_GRADIENT },
    slope && { key: "slope", label: "Pendenze", min: "30°", max: "45°+", gradient: SLOPE_GRADIENT },
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
  // disabilitata al posto suo. Compare anche con "Nuvole" attivo (non solo
  // "Pioggia"): i frame restano quelli del radar RainViewer — nuvole è un
  // campo statico, senza una sua sequenza — ma la richiesta era la
  // comparsa/posizione coerente del pannello, non una seconda animazione.
  const radarProps =
    (radar || clouds) && frames.length
      ? { frames, frameIdx, setFrameIdx, playing, setPlaying, frameTime, isForecast }
      : null;

  // Contenuto del pulsante "Info" — prima era un paragrafo fisso sotto la
  // mappa più il footer del sito; la pagina mappa non scrolla più (vedi
  // globals.css), quindi vivono qui. FooterLinks è lo stesso componente che
  // usa il footer sulle altre pagine (nessun testo duplicato).
  const infoContent = (
    <>
      <p>
        Supporto alla decisione, non una raccomandazione. Il bollettino valanghe ufficiale
        (AINEVA) prevale sempre. Mappa © CARTO / OpenTopoMap / OpenStreetMap contributors ·
        radar © RainViewer · vento © Open-Meteo · pendenze: elaborazione propria da
        Copernicus DEM © ESA (30 m, indicative: la risoluzione non vede canali e rocce —
        la valutazione del terreno resta tua).
      </p>
      <p><FooterLinks /></p>
    </>
  );

  return (
    <div className={`mapshell ${fullscreen ? "full" : ""}`}>
      <div ref={mapEl} style={{ position: "absolute", inset: 0 }} />
      {children}

      {/* Livelli, campi meteo, impostazioni/info/localizza: una sola colonna
          destra, spaziata con flex gap invece di tre top assoluti a mano
          (vedi .map-right-col in globals.css). */}
      <div className="map-right-col">
        {/* Livelli — cosa è disegnato sulla mappa. A scomparsa (railAutoHide). */}
        <MapRail
          ready={ready}
          layers={layers}
          hidden={railAutoHide.hidden}
          onMouseEnter={railAutoHide.onMouseEnter}
          onMouseLeave={railAutoHide.onMouseLeave}
          activeFlyout={activeFlyout}
          setActiveFlyout={setActiveFlyout}
        />

        {/* Campi meteo — come è disegnata la mappa. Lo sfondo (Chiaro/Terreno/
            Scuro) non ha più un suo switch qui: si sceglie dalle Impostazioni
            (vedi settings.mapBase sopra). A scomparsa (fieldsAutoHide). */}
        <MapFields
          ready={ready}
          fields={fields}
          hidden={fieldsAutoHide.hidden}
          onMouseEnter={fieldsAutoHide.onMouseEnter}
          onMouseLeave={fieldsAutoHide.onMouseLeave}
          activeFlyout={activeFlyout}
          setActiveFlyout={setActiveFlyout}
        />

        {/* Impostazioni, info, centra sulla mia posizione. A scomparsa (toolsAutoHide). */}
        <MapTools
          ready={ready}
          hidden={toolsAutoHide.hidden}
          onMouseEnter={toolsAutoHide.onMouseEnter}
          onMouseLeave={toolsAutoHide.onMouseLeave}
          activeFlyout={activeFlyout}
          setActiveFlyout={setActiveFlyout}
          onLocate={handleLocate}
          locating={locating}
          infoContent={infoContent}
        />
      </div>

      {/* Legenda, timeline radar e striscia giorni: un solo sistema di layout. */}
      <MapDock legend={legend} radar={radarProps} days={days} />

      {/* Anteprima itinerario/MTB — sovraimpressione grande al posto del
          vecchio popup Leaflet minuscolo (vedi selectedRoute). "Scheda
          itinerario" dentro RouteCard porta alla pagina piena, ora un
          pannello laterale come Itinerari/Pianifica, non una navigazione
          che smonta la mappa. */}
      {selectedRoute && (
        <div className="map-route-preview">
          <button
            type="button"
            className="map-route-preview-close"
            onClick={() => setSelectedRoute(null)}
            aria-label="Chiudi anteprima"
          >
            ×
          </button>
          {(selectedRoute.bulletin?.status === "in_vigore" ||
            selectedRoute.bulletin?.status === "non_verificabile" ||
            selectedRoute.forecast) && (
            <div className="map-route-preview-meteo">
              {selectedRoute.bulletin?.status === "in_vigore" && (
                <span
                  className="map-route-preview-danger tnum"
                  style={{
                    background: DANGER_COLORS[selectedRoute.bulletin.danger_level],
                    color: dangerInk(selectedRoute.bulletin.danger_level),
                  }}
                >
                  Valanghe {selectedRoute.bulletin.danger_level}/5
                </span>
              )}
              {selectedRoute.bulletin?.status === "non_verificabile" && (
                <span className="map-route-preview-warn">
                  <Icon.Warning size={13} /> Bollettino non verificabile
                </span>
              )}
              {selectedRoute.forecast && (
                <span className="map-route-preview-fc tnum">
                  0°C {selectedRoute.forecast.freezing_level_m} m · vento{" "}
                  {selectedRoute.forecast.wind_avg_kmh} km/h
                  {selectedRoute.forecast.source === "mock" ? " (demo)" : ""}
                </span>
              )}
            </div>
          )}
          <RouteCard route={selectedRoute} alwaysDetail />
        </div>
      )}

      {msg && <div className="mapmsg">{msg}</div>}
    </div>
  );
}
