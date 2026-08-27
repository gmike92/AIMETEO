// Glifi dell'interfaccia — regola 1.2 del design system: niente emoji.
//
// Le emoji le disegna il sistema operativo, quindi cambiano forma, peso,
// baseline e colore su ogni macchina. Qui ogni glifo è un SVG inline a
// tratto 1.85 che eredita `currentColor` dal contenitore: cambia colore con
// il testo che lo accompagna, si allinea sempre allo stesso modo e non
// dipende da quale font emoji ha installato l'utente.
//
// Nessun "use client": sono componenti puramente presentazionali, quindi
// funzionano sia nei server component (itinerari, falesie, tabella
// condizioni) sia nei client component (mappa, planner).
//
// Le emoji restano ammesse nei dati `data-*` che arrivano dal backend —
// mai nel markup che scriviamo noi.

const VB = "0 0 24 24";

function Glyph({ size = 16, label, fill = false, children, className, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={VB}
      fill={fill ? "currentColor" : "none"}
      stroke={fill ? "none" : "currentColor"}
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      // Un'icona che accompagna del testo è decorativa (aria-hidden); una che
      // sta da sola porta il suo nome accessibile.
      role={label ? "img" : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
      focusable="false"
      style={{ flex: "none", display: "block", ...style }}
    >
      {children}
    </svg>
  );
}

// ── meteo ──────────────────────────────────────────────────────────
const RAYS =
  "M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6L17 7M7 17l-1.4 1.4";
const CLOUD = "M6.5 16a4 4 0 010-8 5.5 5.5 0 0110.4-1.3A3.6 3.6 0 1117.5 16z";
const CLOUD_HI = "M6.5 14a4 4 0 010-8 5.5 5.5 0 0110.4-1.3A3.6 3.6 0 1117.5 14z";

const Sun = (p) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="4.4" />
    <path d={RAYS} />
  </Glyph>
);

const PartlyCloudy = (p) => (
  <Glyph {...p}>
    <circle cx="9" cy="8" r="3.1" />
    <path d="M9 2.2v1.3M3.6 8H2.3M4.9 3.9l-.9-.9M13.2 4.6l.9-.9" />
    <path d="M9.5 19.5a3.7 3.7 0 010-7.4 5.1 5.1 0 019.6-1.2 3.3 3.3 0 11.4 8.6z" />
  </Glyph>
);

const Cloud = (p) => (
  <Glyph {...p}>
    <path d={CLOUD} />
  </Glyph>
);

const Rain = (p) => (
  <Glyph {...p}>
    <path d={CLOUD_HI} />
    <path d="M9 17.5l-1 3.5M13 17.5l-1 3.5M17 17.5l-1 3.5" />
  </Glyph>
);

const Storm = (p) => (
  <Glyph {...p}>
    <path d={CLOUD_HI} />
    <path d="M13.5 15.5L10 20h3.6L12.4 23.5" />
  </Glyph>
);

const Snow = (p) => (
  <Glyph {...p}>
    <path d={CLOUD_HI} />
    <path d="M8.6 17.6v3M7.3 18.3l2.6 1.6M9.9 18.3l-2.6 1.6" />
    <path d="M15.4 17.6v3M14.1 18.3l2.6 1.6M16.7 18.3l-2.6 1.6" />
  </Glyph>
);

// Zero termico / gelo — il fiocco pieno, non la nuvola.
const Freezing = (p) => (
  <Glyph {...p}>
    <path d="M12 2.5v19M3.8 7.2l16.4 9.6M20.2 7.2L3.8 16.8" />
    <path d="M9.6 4.6L12 6.6l2.4-2M9.6 19.4l2.4-2 2.4 2" />
  </Glyph>
);

const Wind = (p) => (
  <Glyph {...p}>
    <path d="M3 8.5h8.5a2.8 2.8 0 10-2.8-2.8" />
    <path d="M3 12.5h12a3 3 0 11-3 3" />
    <path d="M3 16.5h5.5" />
  </Glyph>
);

const Drop = (p) => (
  <Glyph {...p}>
    <path d="M12 3.2c0 0 6 6.6 6 10.4a6 6 0 11-12 0c0-3.8 6-10.4 6-10.4z" />
  </Glyph>
);

const Moon = (p) => (
  <Glyph {...p}>
    <path d="M20.2 14.8A8.6 8.6 0 019.4 4a8.6 8.6 0 1010.8 10.8z" />
  </Glyph>
);

const Bolt = (p) => (
  <Glyph {...p} fill>
    <path d="M13.2 2L5.5 13.2H11l-1 8.8 7.7-11.4H12z" />
  </Glyph>
);

// ── stato / azioni ─────────────────────────────────────────────────
const Check = (p) => (
  <Glyph {...p}>
    <path d="M4 12.5l5 5L20 6.5" />
  </Glyph>
);

const Warning = (p) => (
  <Glyph {...p}>
    <path d="M12 3.6l9.2 16.4H2.8z" />
    <path d="M12 9.8v4.4M12 17.4v.01" />
  </Glyph>
);

const Blocked = (p) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M6 18L18 6" />
  </Glyph>
);

const Compass = (p) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z" />
  </Glyph>
);

const Bell = (p) => (
  <Glyph {...p}>
    <path d="M18 15.6V10a6 6 0 10-12 0v5.6L4.4 18h15.2z" />
    <path d="M10 21h4" />
  </Glyph>
);

const Search = (p) => (
  <Glyph {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4.3-4.3" />
  </Glyph>
);

const Download = (p) => (
  <Glyph {...p}>
    <path d="M12 3.5v12.5M7 11.5l5 5 5-5" />
    <path d="M4 20.5h16" />
  </Glyph>
);

const Play = (p) => (
  <Glyph {...p} fill>
    <path d="M6 3.5l14 8.5-14 8.5z" />
  </Glyph>
);

const Pause = (p) => (
  <Glyph {...p} fill>
    <rect x="6" y="4" width="4" height="16" rx="1.2" />
    <rect x="14" y="4" width="4" height="16" rx="1.2" />
  </Glyph>
);

const Cycle = (p) => (
  <Glyph {...p}>
    <path d="M20.5 12a8.5 8.5 0 11-2.6-6.1" />
    <path d="M20.5 3.5V9h-5.5" />
  </Glyph>
);

// ── livelli mappa / attività ───────────────────────────────────────
const Route = (p) => (
  <Glyph {...p}>
    <path d="M3 18l5-8 4 5 3-4 6 7z" />
    <circle cx="7" cy="6" r="2" />
  </Glyph>
);

const Crag = (p) => (
  <Glyph {...p}>
    <path d="M12 3l9 16H3z" />
    <path d="M8.5 13h7" />
  </Glyph>
);

const Slope = (p) => (
  <Glyph {...p}>
    <path d="M4 20l6-16 4 9 2-4 4 11z" />
  </Glyph>
);

const Ski = (p) => (
  <Glyph {...p}>
    <path d="M5 19l6-14 3 7" />
    <path d="M13 19h6" />
  </Glyph>
);

const Peak = (p) => (
  <Glyph {...p}>
    <path d="M2.8 19.2l6.2-11.4 4.1 6.2 2.6-3.6 6.1 8.8z" />
  </Glyph>
);

// MTB — due ruote + telaio a diamante, sagoma astratta come le altre icone
// attività (Crag, Slope) piuttosto che una bici realistica.
const Bike = (p) => (
  <Glyph {...p}>
    <circle cx="5.5" cy="17" r="3.2" />
    <circle cx="18.5" cy="17" r="3.2" />
    <path d="M5.5 17L9 9l4 8H5.5M9 9h3.5M13 17l3-8.5M13 17h5.5" />
  </Glyph>
);

// Sci di fondo — sci paralleli (a differenza di Ski, incrociati: quella è
// la discesa) più un accenno di racchetta, per distinguerle a colpo d'occhio.
const CrossCountrySki = (p) => (
  <Glyph {...p}>
    <path d="M3 20l7-15M8 20l7-15" />
    <path d="M13 7.5l4-2.2M15.5 10l3.5 7" />
  </Glyph>
);

const Layers = (p) => (
  <Glyph {...p}>
    <path d="M12 3l9 5-9 5-9-5z" />
    <path d="M3.4 12.6L12 17.4l8.6-4.8" />
  </Glyph>
);

// ── strumenti mappa (settings / info / geolocalizzazione) ──────────
// Ingranaggio vero (non lo slider/equalizzatore di prima) — otto denti
// arrotondati attorno a un foro centrale, la sagoma standard "settings".
const Settings = (p) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82A1.65 1.65 0 003.09 14H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
  </Glyph>
);

const Info = (p) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 11v6M12 7.5v.01" />
  </Glyph>
);

// Mirino "centra sulla mia posizione" — stessa sagoma del "locate me"
// di Google Maps/Leaflet, così è riconoscibile a colpo d'occhio.
const Crosshair = (p) => (
  <Glyph {...p}>
    <circle cx="12" cy="12" r="7.2" />
    <path d="M12 1.5v3.2M12 19.3v3.2M1.5 12h3.2M19.3 12h3.2" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </Glyph>
);

// Casa — posizione di riferimento per il riepilogo meteo (badge striscia
// giorni), tetto a falda + base, stessa sagoma semplice delle altre icone.
const Home = (p) => (
  <Glyph {...p}>
    <path d="M4 11.5L12 4l8 7.5" />
    <path d="M6 10v9h5v-5h2v5h5v-9" />
  </Glyph>
);

// Spillo — punto scelto con un click sulla mappa (badge striscia giorni,
// stessa sagoma del marker che compare sulla mappa in MapView.js).
const Pin = (p) => (
  <Glyph {...p}>
    <path d="M12 21s7-7.58 7-12A7 7 0 105 9c0 4.42 7 12 7 12z" />
    <circle cx="12" cy="9" r="2.3" />
  </Glyph>
);

// Freccia indietro — "torna alla mappa" nella navbar.
const ArrowLeft = (p) => (
  <Glyph {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Glyph>
);

export const Icon = {
  Sun, PartlyCloudy, Cloud, Rain, Storm, Snow,
  Freezing, Wind, Drop, Moon, Bolt,
  Settings, Info, Crosshair,
  Check, Warning, Blocked, Compass, Bell, Search, Download,
  Play, Pause, Cycle,
  Route, Crag, Slope, Ski, Peak, Layers, Bike, CrossCountrySki,
  Home, Pin, ArrowLeft,
};

// Stesse identiche regole di lib/wx.js (precipitazioni > nuvole > sereno),
// ma disegnate invece che pescate dal font di sistema.
export function WxIcon({ precip_mm = 0, nuvole_pct = 0, neve = false, size = 17, label }) {
  const p = { size, label };
  if (precip_mm > 0.2) {
    if (neve) return <Snow {...p} />;
    return precip_mm >= 8 ? <Storm {...p} /> : <Rain {...p} />;
  }
  if (nuvole_pct >= 75) return <Cloud {...p} />;
  if (nuvole_pct >= 35) return <PartlyCloudy {...p} />;
  return <Sun {...p} />;
}

export default WxIcon;
