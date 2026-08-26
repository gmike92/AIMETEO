"use client";
// Impostazioni — preferenze del browser (localStorage), non dell'account:
// unità di misura, tema, lingua dell'interfaccia, densità degli elenchi.
// Nessuna chiamata al backend: SettingsProvider fa tutto il lavoro.
import { useSettings } from "../components/SettingsProvider";
import { useT } from "@/lib/i18n";
import { DEFAULTS, writeSettings } from "@/lib/settings";

function Section({ title, sub, children }) {
  return (
    <div className="panel">
      <h2 style={{ marginTop: 0, fontSize: 17 }}>{title}</h2>
      {sub && <p className="note" style={{ marginTop: 4, marginBottom: 14 }}>{sub}</p>}
      {children}
    </div>
  );
}

function ChipGroup({ value, options, onChange, labelledBy }) {
  return (
    <div className="chips" role="group" aria-labelledby={labelledBy}>
      {options.map(([val, label]) => (
        <button
          key={val}
          type="button"
          className={`chip ${value === val ? "on" : ""}`}
          aria-pressed={value === val}
          onClick={() => onChange(val)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export default function Impostazioni() {
  const { settings, setSetting } = useSettings();
  const t = useT();

  const reset = () => {
    writeSettings(DEFAULTS);
    for (const key of Object.keys(DEFAULTS)) setSetting(key, DEFAULTS[key]);
  };

  return (
    <div>
      <span className="eyebrow">{t("nav.impostazioni")}</span>
      <h1>{t("settings.title")}</h1>
      <p className="sub">{t("settings.sub")}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
        <Section title={t("settings.units")} sub={null}>
          <ChipGroup
            labelledBy="units-h"
            value={settings.units}
            onChange={(v) => setSetting("units", v)}
            options={[
              ["metric", t("settings.units_metric")],
              ["imperial", t("settings.units_imperial")],
            ]}
          />
        </Section>

        <Section title={t("settings.theme")}>
          <ChipGroup
            value={settings.theme}
            onChange={(v) => setSetting("theme", v)}
            options={[
              ["dark", t("settings.theme_dark")],
              ["light", t("settings.theme_light")],
              ["system", t("settings.theme_system")],
            ]}
          />
        </Section>

        <Section title={t("settings.lang")} sub={t("settings.lang_note")}>
          <ChipGroup
            value={settings.lang}
            onChange={(v) => setSetting("lang", v)}
            options={[
              ["it", "Italiano"],
              ["en", "English"],
            ]}
          />
        </Section>

        <Section title={t("settings.density")}>
          <ChipGroup
            value={settings.density}
            onChange={(v) => setSetting("density", v)}
            options={[
              ["grid", t("settings.density_grid")],
              ["list", t("settings.density_list")],
            ]}
          />
        </Section>
      </div>

      <button type="button" className="btn ghost" onClick={reset}
        style={{ marginTop: 18, padding: "10px 18px", fontSize: 13 }}>
        {t("settings.reset")}
      </button>
    </div>
  );
}
