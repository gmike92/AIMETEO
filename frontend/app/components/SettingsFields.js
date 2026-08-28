"use client";
// Corpo delle impostazioni (unità, tema, lingua, densità) — condiviso tra
// la pagina /impostazioni (altre pagine, chrome pieno) e il pannello a
// comparsa sulla mappa (MapChrome.js): stesso stato (SettingsProvider),
// stesso markup, un solo posto dove può disallinearsi.
import { useState } from "react";
import { useSettings } from "./SettingsProvider";
import { useT } from "@/lib/i18n";
import { DEFAULTS, writeSettings, ACTIVITY_KEYS, FIELD_KEYS } from "@/lib/settings";

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

// Attività: due preferenze indipendenti per la stessa lista di 5 voci
// (quali offrire nel pannello, quali partono già accese) — invece di due
// ToggleChipGroup separati che ripeterebbero le 5 etichette due volte, UNA
// sola riga per voce con due toggle compatti (stesso principio di una
// tabella a doppia colonna). "All'avvio" è disabilitato quando la voce non
// è visibile: un'attività nascosta accesa di default sarebbe attiva sulla
// mappa senza modo di spegnerla dal pannello — vedi anche il filtro
// equivalente in lib/settings.js (readSettings).
function ActivityMatrix({ visible, defaults, onToggleVisible, onToggleDefault, options, colVisible, colDefault }) {
  return (
    <div className="actmatrix" role="group">
      <div className="actmatrix-row actmatrix-head">
        <span />
        <span className="actmatrix-collabel">{colVisible}</span>
        <span className="actmatrix-collabel">{colDefault}</span>
      </div>
      {options.map(([key, label]) => {
        const isVisible = visible.includes(key);
        const isDefault = defaults.includes(key);
        return (
          <div key={key} className="actmatrix-row">
            <span className="actmatrix-label">{label}</span>
            <button
              type="button"
              className={`tglswitch ${isVisible ? "on" : ""}`}
              aria-pressed={isVisible}
              aria-label={`${colVisible}: ${label}`}
              onClick={() => onToggleVisible(key)}
            />
            <button
              type="button"
              className={`tglswitch ${isDefault ? "on" : ""}`}
              aria-pressed={isDefault}
              disabled={!isVisible}
              aria-label={`${colDefault}: ${label}`}
              onClick={() => onToggleDefault(key)}
            />
          </div>
        );
      })}
    </div>
  );
}

// compact: variante per il pannello a comparsa sulla mappa (meno spaziatura,
// niente "panel" con bordo — vive già dentro il vetro del flyout).
// Tre gruppi per attinenza invece di una sola lista lunga (era 7 sezioni
// una sotto l'altra): "generali" (lingua, unità — le prime due che un
// utente cerca), "aspetto" (tema, sfondo mappa — puramente visivo),
// "preferenze" (densità elenchi, default meteo/attività — cosa parte
// acceso). Il reset resta fuori dai tab: è globale, non di una sezione sola.
const TAB_KEYS = ["generali", "aspetto", "preferenze"];

export default function SettingsFields({ compact = false }) {
  const { settings, setSetting } = useSettings();
  const t = useT();
  const [tab, setTab] = useState(TAB_KEYS[0]);

  const reset = () => {
    writeSettings(DEFAULTS);
    for (const key of Object.keys(DEFAULTS)) setSetting(key, DEFAULTS[key]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: compact ? 12 : 14 }}>
      <div className="settings-tabbar">
        <ChipGroup
          value={tab}
          onChange={setTab}
          options={[
            ["generali", t("settings.tab_general")],
            ["aspetto", t("settings.tab_appearance")],
            ["preferenze", t("settings.tab_preferences")],
          ]}
        />
      </div>

      {tab === "generali" && (
        <>
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
        </>
      )}

      {tab === "aspetto" && (
        <>
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

          <Section title={t("settings.map_base")} compact={compact}>
            <ChipGroup
              value={settings.mapBase}
              onChange={(v) => setSetting("mapBase", v)}
              options={[
                ["chiaro", t("map.base_chiaro")],
                ["terreno", t("map.base_terreno")],
                ["scuro", t("map.base_scuro")],
              ]}
            />
          </Section>
        </>
      )}

      {tab === "preferenze" && (
        <>
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

          <Section title={t("settings.default_fields")} sub={compact ? null : t("settings.default_fields_note")} compact={compact}>
            <ToggleChipGroup
              values={settings.defaultFields}
              onToggle={(key) => {
                const next = settings.defaultFields.includes(key)
                  ? settings.defaultFields.filter((k) => k !== key)
                  : [...settings.defaultFields, key];
                setSetting("defaultFields", next);
              }}
              options={FIELD_KEYS.map((k) => [k, t(`field.${k}`)])}
            />
          </Section>

          <Section title={t("settings.map_layers")} sub={compact ? null : t("settings.map_layers_note")} compact={compact}>
            <ActivityMatrix
              visible={settings.visibleActivities}
              defaults={settings.defaultActivities}
              colVisible={t("settings.col_visible")}
              colDefault={t("settings.col_default")}
              onToggleVisible={(key) => {
                const nowVisible = !settings.visibleActivities.includes(key);
                const nextVisible = nowVisible
                  ? [...settings.visibleActivities, key]
                  : settings.visibleActivities.filter((k) => k !== key);
                setSetting("visibleActivities", nextVisible);
                // Nascondere una voce accesa di default la spegne anche lì —
                // niente attività "fantasma" accesa senza modo di spegnerla.
                if (!nowVisible && settings.defaultActivities.includes(key)) {
                  setSetting("defaultActivities", settings.defaultActivities.filter((k) => k !== key));
                }
              }}
              onToggleDefault={(key) => {
                const next = settings.defaultActivities.includes(key)
                  ? settings.defaultActivities.filter((k) => k !== key)
                  : [...settings.defaultActivities, key];
                setSetting("defaultActivities", next);
              }}
              options={ACTIVITY_KEYS.map((k) => [k, t(`layer.${k}`)])}
            />
          </Section>
        </>
      )}

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
