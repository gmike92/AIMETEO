"use client";
// Contesto React per le preferenze utente. Vedi lib/settings.js per il
// perché il valore iniziale è sempre DEFAULTS (mai localStorage) al primo
// render: solo dopo il mount si legge il valore vero salvato, per non
// rompere l'idratazione.
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULTS, readSettings, writeSettings, resolveTheme, systemPrefersDark } from "@/lib/settings";

const SettingsContext = createContext({
  settings: DEFAULTS,
  setSetting: () => {},
  ready: false,
});

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);
  const [ready, setReady] = useState(false); // true dopo la prima lettura client

  useEffect(() => {
    setSettings(readSettings());
    setReady(true);
  }, []);

  // Applica tema e lingua al <html> ogni volta che cambiano — il CSS
  // (globals.css, blocchi [data-theme]) e l'attributo lang seguono da soli.
  useEffect(() => {
    const root = document.documentElement;
    const resolved = resolveTheme(settings.theme);
    root.dataset.theme = resolved;
    root.lang = settings.lang;
  }, [settings.theme, settings.lang]);

  // theme:"system" deve seguire il sistema operativo anche se l'utente lo
  // cambia SENZA riaprire la pagina (l'evento del media query, non un poll).
  useEffect(() => {
    if (settings.theme !== "system" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      document.documentElement.dataset.theme = systemPrefersDark() ? "dark" : "light";
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [settings.theme]);

  const setSetting = (key, value) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: value };
      writeSettings(next);
      return next;
    });
  };

  const value = useMemo(() => ({ settings, setSetting, ready }), [settings, ready]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  return useContext(SettingsContext);
}
