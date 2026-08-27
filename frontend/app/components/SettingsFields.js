"use client";
// Corpo delle impostazioni (unità, tema, lingua, densità) — condiviso tra
// la pagina /impostazioni (altre pagine, chrome pieno) e il pannello a
// comparsa sulla mappa (MapChrome.js): stesso stato (SettingsProvider),
// stesso markup, un solo posto dove può disallinearsi.
import { useSettings } from "./SettingsProvider";
import { useT } from "@/lib/i18n";
import { DEFAULTS, writeSettings, ACTIVITY_KEYS } from "@/lib/settings";

export function Section({ title, sub, children, compact = false }) {
  return (
    <div className={compact ? "" : "panel"}>
      {compact
        ? <div className="dockhead" style={{ marginBottom: 8 }}>{title}</div>
        : <h2 style={{ marginTop: 0, fontSize: 17 }}>{title}</h2>}
      {sub && <p className="note" style={{ marginTop: 4, marginBottom: compact ? 8 : 14 }}>{sub}</p>}
      {children}
    </div>
  );
}

export function ChipGroup({ value, options, onChange, labelledBy }) {
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

// Come ChipGroup ma multi-selezione (un array di chiavi attive, non un solo
// valore) — serve per "quali attività mostrare", dove più di una può essere
// selezionata insieme.
function ToggleChipGroup({ values, options, onToggle, labelledBy }) {
  return (
    <div className="chips" role="group" aria-labelledby={labelledBy}>
      {options.map(([val, label]) => (
        <button
          key={val}
          type="button"
          className={`chip ${values.includes(val) ? "on" : ""}`}
          aria-pressed={values.includes(val)}
          onClick={() => onToggle(val)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// compact: variante per il pannello a comparsa sulla mappa (meno spaziatura,
// niente "panel" con bordo — vive già dentro il vetro del flyout).
export default function SettingsFields({ compact = false }) {
  const { settings, setSetting } = useSettings();
  const t = useT();

  const reset = () => {
    writeSettings(DEFAULTS);
    for (const key of Object.keys(DEFAULTS)) setSetting(key, DEFAULTS[key]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 12 : 14 }}>
      <Section title={t("settings.units")} compact={compact}>
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

      <Section title={t("settings.theme")} compact={compact}>
        <ChipGroup
          value={settings.theme}
          onChange={(v) => setSetting("theme", v)}
          options={[
            ["dark", t("settings.theme_dark")],
            ["light", t("settings.theme_light")],
            ["bosco", t("settings.theme_bosco")],
            ["mare", t("settings.theme_mare")],
            ["system", t("settings.theme_system")],
          ]}
        />
      </Section>

      <Section title={t("settings.lang")} sub={compact ? null : t("settings.lang_note")} compact={compact}>
        <ChipGroup
          value={settings.lang}
          onChange={(v) => setSetting("lang", v)}
          options={[
            ["it", "Italiano"],
            ["en", "English"],
          ]}
        />
      </Section>

      <Section title={t("settings.density")} compact={compact}>
        <ChipGroup
          value={settings.density}
          onChange={(v) => setSetting("density", v)}
          options={[
            ["grid", t("settings.density_grid")],
            ["list", t("settings.density_list")],
          ]}
        />
      </Section>

      <Section title={t("settings.map_layers")} sub={compact ? null : t("settings.map_layers_note")} compact={compact}>
        <ToggleChipGroup
          values={settings.visibleActivities}
          onToggle={(key) => {
            const next = settings.visibleActivities.includes(key)
              ? settings.visibleActivities.filter((k) => k !== key)
              : [...settings.visibleActivities, key];
            setSetting("visibleActivities", next);
          }}
          options={ACTIVITY_KEYS.map((k) => [k, t(`layer.${k}`)])}
        />
      </Section>

      <button
        type="button"
        className="btn ghost"
        onClick={reset}
        style={{ padding: "10px 18px", fontSize: 13, alignSelf: "flex-start" }}
      >
        {t("settings.reset")}
      </button>
    </div>
  );
}
