import "leaflet/dist/leaflet.css";
import "leaflet-velocity/dist/leaflet-velocity.min.css";
import "./globals.css";
import PwaRegister from "./components/PwaRegister";

export const metadata = {
  title: "AIMETEO — Meteo per la montagna, fatto bene",
  description:
    "Previsioni iperlocali, bollettini valanghe ufficiali e pianificazione gite con l'AI. Per chi va in montagna sul serio.",
  appleWebApp: { capable: true, title: "AIMETEO", statusBarStyle: "black-translucent" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport = { themeColor: "#0a1420" };

function Nav() {
  return (
    <header className="navbar">
      <div className="wrap">
        <nav className="nav">
          <a href="/" className="logo">Zero<span>termico</span></a>
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
