import "leaflet/dist/leaflet.css";
import "leaflet-velocity/dist/leaflet-velocity.min.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./globals.css";
import PwaRegister from "./components/PwaRegister";
import SiteNav from "./components/SiteNav";

export const metadata = {
  title: "Zerotermico — Il meteo alla tua quota.",
  description:
    "Previsioni iperlocali, bollettini valanghe ufficiali e pianificazione gite con l'AI. Per chi va in montagna sul serio.",
  appleWebApp: { capable: true, title: "Zerotermico", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport = { themeColor: "#0a1420" };

export default function RootLayout({ children }) {
  return (
    <html lang="it">
      <body>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap"
          rel="stylesheet"
        />
        <PwaRegister />
        <SiteNav />
        <main className="wrap">{children}</main>
        <footer className="wrap">
          Zerotermico · nome di lavoro · Bollettini: fonte ufficiale AINEVA / Meteomont ·{" "}
          <a href="/fonti" style={{ textDecoration: "underline" }}>Fonti e licenze</a> ·{" "}
          <a href="/privacy" style={{ textDecoration: "underline" }}>Privacy</a>
        </footer>
      </body>
    </html>
  );
}
