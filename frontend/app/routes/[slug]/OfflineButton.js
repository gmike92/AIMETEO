"use client";
// "Salva per offline" — precache di tutto ciò che serve in rifugio senza rete:
// dati rotta, meteo per punto, GPX, condizioni e le tiles mappa del riquadro
// della traccia (zoom 11-13). Parla col service worker via postMessage.
import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";

function lon2tile(lon, z) { return Math.floor(((lon + 180) / 360) * 2 ** z); }
function lat2tile(lat, z) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

function tileUrls(points, zooms = [11, 12, 13], cap = 350) {
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  const [laMin, laMax] = [Math.min(...lats), Math.max(...lats)];
  const [loMin, loMax] = [Math.min(...lons), Math.max(...lons)];
  const urls = [];
  for (const z of zooms) {
    const x0 = lon2tile(loMin, z), x1 = lon2tile(loMax, z);
    const y0 = lat2tile(laMax, z), y1 = lat2tile(laMin, z); // y cresce verso sud
    for (let x = x0; x <= x1; x++)
      for (let y = y0; y <= y1; y++)
        urls.push(`https://a.basemaps.cartocdn.com/rastertiles/voyager/${z}/${x}/${y}.png`);
  }
  return urls.slice(0, cap);
}

export default function OfflineButton({ slug, trackPoints }) {
  const [state, setState] = useState("idle"); // idle | saving | done | err | unsupported
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) setState("unsupported");
    const onMsg = (e) => {
      if (e.data?.type === "CACHE_DONE" && e.data.bucket === slug) {
        setProgress(`${e.data.ok}/${e.data.total}`);
        setState(e.data.ok > 0 ? "done" : "err");
      }
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => navigator.serviceWorker?.removeEventListener("message", onMsg);
  }, [slug]);

  const save = async () => {
    try {
      setState("saving");
      const reg = await navigator.serviceWorker.ready;
      const api = (p) => `${API_BASE}${p}`;
      const urls = [
        api(`/routes/${encodeURIComponent(slug)}`),
        api(`/routes/${encodeURIComponent(slug)}/weather`),
        api(`/routes/${encodeURIComponent(slug)}/gpx`),
        api(`/conditions`),
        window.location.href,
        ...(trackPoints?.length ? tileUrls(trackPoints) : []),
      ];
      reg.active.postMessage({ type: "CACHE_URLS", urls, bucket: slug });
    } catch {
      setState("err");
    }
  };

  if (state === "unsupported") return null;
  return (
    <span style={{ marginLeft: 16 }}>
      <a
        onClick={state === "saving" ? undefined : save}
        className="note"
        style={{ color: "var(--accent2)", cursor: "pointer" }}
        role="button"
      >
        {state === "idle" && "Salva per offline ◎"}
        {state === "saving" && "Salvo per offline…"}
        {state === "done" && `Salvata offline ✓${progress ? ` (${progress})` : ""}`}
        {state === "err" && "Offline non riuscito — riprova"}
      </a>
    </span>
  );
}
