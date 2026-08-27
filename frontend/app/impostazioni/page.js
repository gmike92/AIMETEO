"use client";
// Impostazioni — preferenze del browser (localStorage), non dell'account:
// unità di misura, tema, lingua dell'interfaccia, densità degli elenchi.
// Il corpo (SettingsFields) è condiviso col pannello a comparsa sulla
// mappa (MapChrome.js) — qui c'è solo il chrome di pagina attorno.
import { useT } from "@/lib/i18n";
import SettingsFields from "../components/SettingsFields";

export default function Impostazioni() {
  const t = useT();

  return (
    <div>
      <span className="eyebrow">{t("nav.impostazioni")}</span>
      <h1>{t("settings.title")}</h1>
      <p className="sub">{t("settings.sub")}</p>

      <div style={{ marginTop: 18 }}>
        <SettingsFields />
      </div>
    </div>
  );
}
