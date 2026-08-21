import "leaflet/dist/leaflet.css";
import "leaflet-velocity/dist/leaflet-velocity.min.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "./globals.css";
import PwaRegister from "./components/PwaRegister";

export const metadata = {
  title: "Zerotermico — Il meteo alla tua quota.",
  description:
    "Previsioni iperlocali, bollettini valanghe ufficiali e pianificazione gite con l'AI. Per chi va in montagna sul serio.",
  appleWebApp: { capable: true, title: "Zerotermico", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport = { themeColor: "#0a1420" };

function Nav() {
  return (
    <header className="navbar">
      <div className="wrap">
        <nav className="nav">
          <a href="/" className="logo" aria-label="Zerotermico">
            <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden>
              <ellipse cx="14" cy="17" rx="9" ry="12" fill="none"
                stroke="var(--accent)" strokeWidth="3.4" />
              <line x1="7.5" y1="17" x2="20.5" y2="17"
                stroke="var(--accent2)" strokeWidth="2.6" />
              <circle cx="27.5" cy="6" r="3" fill="none"
                stroke="var(--accent)" strokeWidth="2.4" />
            </svg>
            zero<span>°termico</span>
          </a>
          <div>
            <a href="/">Mappa</a>
            <a href="/localita">Cerca</a>
            <a href="/itinerari">Itinerari</a>
            <a href="/falesie">Falesie</a>
            <a href="/planner">Pianifica</a>
          </div>
        </nav>
      </div>
    </header>
  );
}

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
        <Nav />
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
