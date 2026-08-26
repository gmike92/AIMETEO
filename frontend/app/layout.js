import "leaflet/dist/leaflet.css";
import "leaflet-velocity/dist/leaflet-velocity.min.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./globals.css";
import { SettingsProvider } from "./components/SettingsProvider";
import Nav from "./components/Nav";
import PwaRegister from "./components/PwaRegister";
import T from "./components/T";
import { STORAGE_KEY, DEFAULTS } from "@/lib/settings";

export const metadata = {
  title: "Zerotermico — Il meteo alla tua quota.",
  description:
    "Previsioni iperlocali, bollettini valanghe ufficiali e pianificazione gite con l'AI. Per chi va in montagna sul serio.",
  appleWebApp: { capable: true, title: "Zerotermico", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport = { themeColor: "#0a1420" };

// Applica il tema salvato PRIMA che React idrati: il tema è un attributo del
// DOM (data-theme), non testo React, quindi cambiarlo qui non causa nessun
// hydration mismatch — evita solo il lampo del tema di default per chi ha
// già scelto "chiaro" o "sistema" in una visita precedente. Stringa
// letterale (non un file esterno): deve eseguire prima di qualunque altro
// script, incluso next/script.
const THEME_INIT = `(function(){try{
  var raw = localStorage.getItem(${JSON.stringify(STORAGE_KEY)});
  var theme = (raw && JSON.parse(raw).theme) || ${JSON.stringify(DEFAULTS.theme)};
  if (theme === "system") {
    theme = matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  document.documentElement.dataset.theme = theme;
} catch (e) {}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
        <SettingsProvider>
          <PwaRegister />
          <Nav />
          <main className="wrap">{children}</main>
          <footer className="wrap">
            <T k="footer.credit" /> ·{" "}
            <a href="/fonti" style={{ textDecoration: "underline" }}><T k="footer.fonti" /></a> ·{" "}
            <a href="/privacy" style={{ textDecoration: "underline" }}><T k="footer.privacy" /></a>
          </footer>
        </SettingsProvider>
      </body>
    </html>
  );
}
