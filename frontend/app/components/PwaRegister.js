"use client";
// Registers the service worker (PWA install + offline best-effort).
import { useEffect } from "react";

export default function PwaRegister() {
  useEffect(() => {
    // Dev-only footgun: sw.js caches JS chunks stale-while-revalidate, and
    // `next dev` chunk URLs aren't content-hashed like a production build —
    // so the SW keeps serving yesterday's bundle forever, surviving even a
    // hard refresh. Real offline support only matters for the shipped app.
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
