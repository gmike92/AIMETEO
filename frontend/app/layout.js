import "leaflet/dist/leaflet.css";
import "leaflet-velocity/dist/leaflet-velocity.min.css";
import "./globals.css";

export const metadata = {
  title: "AIMETEO — Meteo per la montagna, fatto bene",
  description:
    "Previsioni iperlocali, bollettini valanghe ufficiali e pianificazione gite con l'AI. Per chi va in montagna sul serio.",
};

function Nav() {
  return (
    <header className="navbar">
      <div className="wrap">
        <nav className="nav">
          <a href="/" className="logo">Zero<span>termico</span></a>
          <div>
            <a href="/">Mappa</a>
            <a href="/itinerari">Itinerari</a>
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
        <Nav />
        <main className="wrap">{children}</main>
        <footer className="wrap">
          Zerotermico · nome di lavoro · Bollettini: fonte ufficiale AINEVA / Meteomont.
        </footer>
      </body>
    </html>
  );
}
