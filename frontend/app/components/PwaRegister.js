"use client";
// Registers the service worker (PWA install + offline best-effort).
import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Dev-only footgun: sw.js caches JS chunks stale-while-revalidate, and
    // `next dev` chunk URLs aren't content-hashed like a production build —
    // so the SW keeps serving yesterday's bundle forever, surviving even a
    // hard refresh. Real offline support only matters for the shipped app.
    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    } else {
      // Se questo stesso host ha già servito una build di produzione in
      // passato (es. `npm start` locale), il SW resta registrato e continua
      // a intercettare anche le visite in dev successive — lo ripuliamo qui
      // così lo sviluppo locale non resta mai bloccato su codice vecchio.
      navigator.serviceWorker.getRegistrations()
        .then((regs) => regs.forEach((r) => r.unregister()))
        .catch(() => {});
    }
  }, []);
  return null;
}
