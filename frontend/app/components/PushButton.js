"use client";
// Attivazione notifiche push (client). Fail-safe e onesto:
// - backend senza chiavi VAPID → il bottone spiega che il servizio arriva col deploy;
// - browser senza supporto push → il bottone non appare.
import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";

function b64ToU8(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export default function PushButton() {
  const [state, setState] = useState("idle"); // idle|busy|on|unsupported|unavailable
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setState("unsupported");
      return;
    }
    navigator.serviceWorker.ready.then((reg) =>
      reg.pushManager.getSubscription().then((s) => s && setState("on"))
    );
  }, []);

  if (state === "unsupported") return null;

  const enable = async () => {
    setState("busy");
    setMsg(null);
    try {
      const r = await fetch(`${API_BASE}/push/vapid-public-key`);
      if (!r.ok) {
        setState("unavailable");
        setMsg("Le notifiche arrivano con la versione online dell'app.");
        return;
      }
      const { key } = await r.json();
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState("idle");
        setMsg("Permesso negato dal browser.");
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: b64ToU8(key),
      });
      const res = await fetch(`${API_BASE}/push/subscribe`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error(`API ${res.status}`);
      setState("on");
      setMsg("Notifiche attive su questo dispositivo.");
    } catch (e) {
      setState("idle");
      setMsg(`Attivazione non riuscita: ${e.message}`);
    }
  };

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        className="btn ghost"
        onClick={enable}
        disabled={state === "busy" || state === "on"}
        style={{ padding: "7px 16px", fontSize: 13 }}
      >
        {state === "on" ? "🔔 Notifiche attive" :
         state === "busy" ? "Attivo…" : "🔔 Avvisami (meteo e condizioni)"}
      </button>
      {msg && <span className="note">{msg}</span>}
    </span>
  );
}
