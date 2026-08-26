"use client";
// Cerca una località → meteo della settimana + escursioni e falesie vicine.
// L'idea: "dove abiti (o dove vai) → cosa puoi fare e quando".
import { useEffect, useState } from "react";
import { API_BASE } from "@/lib/api";
import { scoreColor } from "@/lib/wx";
import { WxIcon } from "../components/WxIcon";
import { useT } from "@/lib/i18n";
import { useUnits } from "@/lib/units";
import { useSettings } from "../components/SettingsProvider";

function dayLabel(iso, lang) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(lang === "en" ? "en-US" : "it-IT", {
    weekday: "short", day: "numeric",
  });
}

export default function Localita() {
  const t = useT();
  const units = useUnits();
  const { settings } = useSettings();
  const [q, setQ] = useState("");
  const [places, setPlaces] = useState(null);
  const [sel, setSel] = useState(null);
  const [week, setWeek] = useState(null);
  const [near, setNear] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const search = async (e) => {
    e?.preventDefault();
    if (q.trim().length < 2) return;
    setBusy(true); setError(null); setPlaces(null); setSel(null);
    setWeek(null); setNear(null);
    try {
      const r = await fetch(`${API_BASE}/localita/search?q=${encodeURIComponent(q.trim())}`);
      if (!r.ok) throw new Error((await r.json()).detail || r.status);
      const list = await r.json();
      setPlaces(list);
      if (list.length === 1) pick(list[0]);
    } catch (err) { setError(String(err.message || err)); }
    finally { setBusy(false); }
  };

  const pick = async (p) => {
    setSel(p); setWeek(null); setNear(null); setError(null);
    try {
      const ele = p.elevation_m ?? 0;
      const [w, n] = await Promise.all([
        fetch(`${API_BASE}/localita/settimana?lat=${p.lat}&lon=${p.lon}&ele=${ele}`),
        fetch(`${API_BASE}/localita/vicino?lat=${p.lat}&lon=${p.lon}`),
      ]);
      if (w.ok) setWeek(await w.json());
      if (n.ok) setNear(await n.json());
      if (!w.ok && !n.ok) setError(t("localita.not_available"));
    } catch (err) { setError(String(err.message || err)); }
  };

  // link condivisibile: /localita?q=vezza+d'oglio → cerca subito
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const qs = sp.get("q");
    if (qs) { setQ(qs); setTimeout(() => document.getElementById("loc-form")?.requestSubmit(), 0); }
  }, []);

  return (
    <div>
      <span className="eyebrow">{t("localita.eyebrow")}</span>
      <h1>{t("localita.h1_a")} <em>{t("localita.h1_em")}</em>.</h1>
      <p className="sub">{t("localita.sub")}</p>

      <form id="loc-form" onSubmit={search} className="panel"
        style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input
          placeholder="es. Vezza d'Oglio, Ponte di Legno, Cortina…"
          value={q} onChange={(e) => setQ(e.target.value)}
          style={{ margin: 0 }}
        />
        <button className="btn" type="submit" disabled={busy}>
          {busy ? t("localita.searching") : t("localita.search")}
        </button>
      </form>

      {error && <p className="err">{error}</p>}

      {places && places.length === 0 && (
        <p className="note">{t("localita.no_results", { q })}</p>
      )}
      {places && places.length > 1 && !sel && (
        <div className="grid">
          {places.map((p, i) => (
            <button key={i} className="card" onClick={() => pick(p)}
              style={{ textAlign: "left", cursor: "pointer", font: "inherit", color: "inherit" }}>
              <h3>{p.name}</h3>
              <div className="meta tnum">
                {p.admin && <span>{p.admin}</span>}
                {p.elevation_m != null && <span>{units.elevation(p.elevation_m)}</span>}
              </div>
            </button>
          ))}
        </div>
      )}

      {sel && (
        <>
          <h2 className="tnum">{sel.name}{sel.elevation_m != null ? ` · ${units.elevation(sel.elevation_m)}` : ""}</h2>

          {week && (
            <div className="panel">
              <span className="eyebrow">{t("localita.week")}</span>
              <div className="stats tnum" style={{ marginBottom: 0 }}>
                {week.giorni.map((g) => (
                  <div className="stat" key={g.data}>
                    <div className="k">{dayLabel(g.data, settings.lang)}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: "var(--muted)" }}>
                        <WxIcon precip_mm={g.precip_mm} nuvole_pct={g.nuvole_pct} size={20} />
                      </span>
                      <span className="v" style={{ color: scoreColor(g.punteggio) }}>
                        {g.punteggio}
                      </span>
                    </div>
                    <div className="k" style={{ textTransform: "none", letterSpacing: 0 }}>
                      {units.temp(g.temp_min_c)}/{units.temp(g.temp_max_c)} ·{" "}
                      {g.precip_mm > 0 ? `${g.precip_mm} mm` : t("localita.dry")}
                    </div>
                  </div>
                ))}
              </div>
              <p className="note" style={{ opacity: 0.75 }}>
                {t("localita.score_note")} {week.source}
                {week.source === "mock" && <> {t("route.demo_data")}</>}.
              </p>
            </div>
          )}

          <h2>{t("localita.nearby")}</h2>
          {near === null && <p className="loading">{t("localita.nearby_loading")}</p>}
          {near && near.length === 0 && (
            <p className="note">{t("localita.nearby_empty")}</p>
          )}
          {near && near.length > 0 && (
            <div className="grid">
              {near.map((x) => (
                <a className="card" key={`${x.kind}-${x.slug}`}
                  href={x.kind === "itinerario" ? `/routes/${x.slug}` : "/falesie"}>
                  <h3>{x.name}</h3>
                  <div className="meta tnum">
                    <span className="pill">{x.kind}</span>
                    <span>{units.distance(x.distance_km)}</span>
                    {x.ele_m != null && <span>{units.elevation(x.ele_m)}</span>}
                    {x.diff_grade && <span>{t("localita.grade")} {x.diff_grade}</span>}
                    {x.aspect && <span>{t("localita.wall")} {x.aspect}</span>}
                  </div>
                </a>
              ))}
            </div>
          )}
        </>
      )}

      <p className="disclaimer">{t("localita.disclaimer")}</p>
    </div>
  );
}
