// Fonti, licenze e attribuzioni — obbligo legale (ODbL, CC BY-SA) e
// dichiarazione di trasparenza: da dove viene ogni dato dell'app.
export const metadata = {
  title: "Fonti e licenze | Zerotermico",
  description:
    "Da dove vengono i dati: bollettini ufficiali, OpenStreetMap, Camptocamp, Open-Meteo, stazioni meteo e mappe. Licenze e attribuzioni complete.",
};

const SOURCES = [
  {
    name: "Bollettini valanghe ufficiali",
    what: "Pericolo valanghe, problemi tipici, testo del bollettino.",
    who: "AINEVA / avalanche.report (Euregio) — formato aperto EAWS CAAML v6.",
    license: "Dato ufficiale, riportato testualmente e mai modificato.",
    url: "https://avalanche.report",
  },
  {
    name: "Sentieri CAI e falesie",
    what: "Tracciati della Rete Escursionistica Italiana e siti di arrampicata.",
    who: "© OpenStreetMap contributors (catasto REI ove disponibile).",
    license: "ODbL 1.0 — Open Database License",
    url: "https://www.openstreetmap.org/copyright",
  },
  {
    name: "Itinerari alpinistici",
    what: "Parte degli itinerari di scialpinismo e alta montagna.",
    who: "Camptocamp.org (comunità alpinistica).",
    license: "CC BY-SA 3.0 — attribuzione e condivisione allo stesso modo",
    url: "https://www.camptocamp.org",
  },
  {
    name: "Previsioni meteo e profili verticali",
    what: "Temperatura in quota, vento, nuvolosità, livelli di pressione, quote DEM.",
    who: "Open-Meteo.com (modelli ICON, ECMWF e altri).",
    license: "CC BY 4.0 — uso non commerciale in questa fase",
    url: "https://open-meteo.com",
  },
  {
    name: "Stazioni meteo in quota (validazione)",
    what: "Osservazioni reali usate per misurare l'accuratezza del nostro modello.",
    who: "Open Data Provincia Autonoma di Bolzano.",
    license: "Dati aperti provinciali",
    url: "https://daten.buergernetz.bz.it",
  },
  {
    name: "Modello del terreno (pendenze)",
    what: "Layer pendenze 30/35/40/45° calcolato in casa dal modello digitale del terreno.",
    who: "Copernicus DEM GLO-30 © ESA/Airbus — elaborazione Zerotermico (GDAL).",
    license: "Copernicus data — uso libero con attribuzione",
    url: "https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model",
  },
  {
    name: "Mappe di base",
    what: "Cartografia scura e rilievo terreno della mappa interattiva.",
    who: "© CARTO, © OpenTopoMap (dati © OpenStreetMap contributors).",
    license: "Attribuzione visibile sulla mappa",
    url: "https://carto.com/attributions",
  },
];

export default function Fonti() {
  return (
    <div>
      <span className="eyebrow">trasparenza</span>
      <h1>Fonti e <em>licenze</em>.</h1>
      <p className="sub">
        Regola della casa: l&apos;AI sceglie le parole, i dati strutturati decidono i
        fatti. Qui c&apos;è da dove viene ogni dato — e con quale licenza.
      </p>

      <div className="grid">
        {SOURCES.map((s) => (
          <a className="card" key={s.name} href={s.url} target="_blank" rel="noreferrer">
            <h3>{s.name}</h3>
            <p className="note">{s.what}</p>
            <div className="meta">
              <span>{s.who}</span>
            </div>
            <div className="meta">
              <span className="pill">{s.license}</span>
            </div>
          </a>
        ))}
      </div>

      <div className="panel">
        <strong>Cosa non facciamo mai</strong>
        <p className="note">
          Non inventiamo coordinate, quote, esposizioni o gradi di pericolo. Se un
          dato manca, l&apos;app dice «non disponibile». I bollettini valanghe sono
          riportati dalla fonte ufficiale senza riassunti che ne alterino il senso.
          Gli itinerari importati restano marcati «da verificare» finché un curatore
          non li conferma sul campo o su fonti primarie.
        </p>
      </div>

      <p className="disclaimer">
        Le informazioni fornite non sostituiscono la valutazione sul terreno, la
        preparazione tecnica né il bollettino ufficiale. La montagna comporta rischi:
        la decisione finale è sempre tua.
      </p>
    </div>
  );
}
