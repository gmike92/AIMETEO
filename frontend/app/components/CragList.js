"use client";
// Elenco falesie — filtro per paese e densità griglia/elenco (Impostazioni).
// Isolato in un componente client separato dalla pagina falesie (che resta
// server per l'ISR a 15 minuti): qui vivono SOLO interattività di
// visualizzazione (nessuna chiamata al backend, i dati arrivano già pronti
// dal server).
//
// Il codice paese NON è una bandiera emoji (regola 1.2: niente emoji nel
// markup) — è il codice ISO2 in un chip monospace, deterministico su ogni
// sistema operativo.
import { useMemo, useState } from "react";
import { Icon } from "./WxIcon";
import { useT } from "@/lib/i18n";
import { useUnits } from "@/lib/units";
import { useSettings } from "./SettingsProvider";

function fmt(iso, lang) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString(lang === "en" ? "en-GB" : "it-IT", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome",
  });
}

function CountryChip({ country }) {
  if (!country) return null;
  return <span className="ctrychip">{country}</span>;
}

function CragCard({ c, lang }) {
  const t = useT();
  const units = useUnits();
  return (
    <div className="card" style={{ cursor: "default" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
        <h3 style={{ marginBottom: 2 }}>{c.name}</h3>
        <CountryChip country={c.country} />
      </div>
      <div className="meta">
        <span className="pill">{c.aspect} · {c.region || c.country}</span>
        {c.ele_m != null && <span className="tnum">{units.elevation(c.ele_m)}</span>}
        {c.in_sole_adesso != null && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6,
            color: c.in_sole_adesso ? "var(--warn-text)" : "var(--accent-text)" }}>
            {c.in_sole_adesso ? <Icon.Sun size={14} /> : <Icon.Moon size={14} />}
            {c.in_sole_adesso ? t("falesie.sun_now") : t("falesie.shade_now")}
          </span>
        )}
      </div>
      {c.finestre_sole?.length > 0 ? (
        <p className="note">
          {t("falesie.sun_today")}{" "}
          {c.finestre_sole.map((w, i) => (
            <span key={i}>
              {i > 0 && " · "}
              {fmt(w.dalle, lang)}–{fmt(w.alle, lang)}
            </span>
          ))}
        </p>
      ) : (
        <p className="note">{t("falesie.shade_today")}</p>
      )}
      {c.verified_at == null && (
        <p className="note" style={{ opacity: 0.7 }}>{t("falesie.to_verify")} · {c.source}</p>
      )}
    </div>
  );
}

function CragRow({ c, lang }) {
  const t = useT();
  const units = useUnits();
  return (
    <div className="crow">
      <CountryChip country={c.country} />
      <span className="crow-name">
        <strong>{c.name}</strong>
        <span className="crow-sub">{c.aspect || t("falesie.unknown_aspect")} · {c.region || c.country}</span>
      </span>
      <span className="crow-ele tnum">{c.ele_m != null ? units.elevation(c.ele_m) : "—"}</span>
      <span className={`crow-sun ${c.in_sole_adesso ? "on" : ""}`}>
        {c.in_sole_adesso != null && (c.in_sole_adesso ? <Icon.Sun size={13} /> : <Icon.Moon size={13} />)}
      </span>
    </div>
  );
}

function UnknownCard({ c }) {
  const t = useT();
  const units = useUnits();
  return (
    <div className="card" style={{ cursor: "default", opacity: 0.75 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <h3>{c.name}</h3>
        <CountryChip country={c.country} />
      </div>
      <div className="meta">
        {c.ele_m != null && <span className="tnum">{units.elevation(c.ele_m)}</span>}
        <span>{t("falesie.unknown_aspect")}</span>
      </div>
    </div>
  );
}

export default function CragList({ known = [], unknown = [] }) {
  const t = useT();
  const { settings } = useSettings();
  const [country, setCountry] = useState("");

  const countries = useMemo(() => {
    const s = new Set([...known, ...unknown].map((c) => c.country).filter(Boolean));
    return [...s].sort();
  }, [known, unknown]);

  const filteredKnown = country ? known.filter((c) => c.country === country) : known;
  const filteredUnknown = country ? unknown.filter((c) => c.country === country) : unknown;
  const isList = settings.density === "list";

  return (
    <div>
      {countries.length > 1 && (
        <div className="chips" role="group" aria-label={t("falesie.country_all")} style={{ margin: "18px 0 0" }}>
          <button type="button" className={`chip ${!country ? "on" : ""}`}
            aria-pressed={!country} onClick={() => setCountry("")}>
            {t("falesie.country_all")}
          </button>
          {countries.map((c) => (
            <button key={c} type="button" className={`chip ${country === c ? "on" : ""}`}
              aria-pressed={country === c} onClick={() => setCountry(c)}>
              {c}
            </button>
          ))}
        </div>
      )}

      {isList ? (
        <div className="rlist" style={{ marginTop: 22 }}>
          {filteredKnown.map((c) => <CragRow key={c.slug} c={c} lang={settings.lang} />)}
        </div>
      ) : (
        <div className="grid">
          {filteredKnown.map((c) => <CragCard key={c.slug} c={c} lang={settings.lang} />)}
        </div>
      )}

      {filteredUnknown.length > 0 && (
        <>
          <h2>{t("falesie.unknown_heading")}</h2>
          <p className="note">{t("falesie.unknown_note")}</p>
          <div className="grid">
            {filteredUnknown.map((c) => <UnknownCard key={c.slug} c={c} />)}
          </div>
        </>
      )}
    </div>
  );
}
