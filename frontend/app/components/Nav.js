"use client";
// Client component: i link di navigazione seguono la lingua scelta nei
// Settings. Al primo render (server + prima idratazione) il contesto vale
// ancora DEFAULTS (italiano) — vedi SettingsProvider — quindi non c'è
// nessun mismatch, solo un eventuale cambio lingua dopo il mount per chi
// aveva scelto inglese in una visita precedente.
import Link from "next/link";
import { Icon } from "./WxIcon";
import T from "./T";

const GEAR_PATH =
  "M12 3.5l1 2.2 2.4-.4 1.3 2.1 2.3.7.1 2.4 2 1.4-1 2.2 1 2.2-2 1.4-.1 2.4-2.3.7" +
  "-1.3 2.1-2.4-.4-1 2.2-1-2.2-2.4.4-1.3-2.1-2.3-.7-.1-2.4-2-1.4 1-2.2-1-2.2 2-1.4" +
  ".1-2.4 2.3-.7 1.3-2.1 2.4.4z";

function Gear(p) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinejoin="round" aria-hidden="true" {...p}>
      <path d={GEAR_PATH} />
      <circle cx="12" cy="12" r="3.1" />
    </svg>
  );
}

export default function Nav() {
  return (
    <header className="navbar">
      <div className="wrap">
        <nav className="nav">
          <Link href="/" className="logo" aria-label="Zerotermico">
            <svg width="24" height="24" viewBox="0 0 32 32" aria-hidden>
              <ellipse cx="14" cy="17" rx="9" ry="12" fill="none"
                stroke="var(--accent)" strokeWidth="3.4" />
              <line x1="7.5" y1="17" x2="20.5" y2="17"
                stroke="var(--accent2)" strokeWidth="2.6" />
              <circle cx="27.5" cy="6" r="3" fill="none"
                stroke="var(--accent)" strokeWidth="2.4" />
            </svg>
            zero<span>°termico</span>
          </Link>
          <div>
            <Link href="/"><T k="nav.mappa" /></Link>
            <Link href="/localita"><T k="nav.cerca" /></Link>
            <Link href="/itinerari"><T k="nav.itinerari" /></Link>
            <Link href="/falesie"><T k="nav.falesie" /></Link>
            <Link href="/planner"><T k="nav.pianifica" /></Link>
            <Link href="/impostazioni" className="navgear" aria-label="Impostazioni"
              title="Impostazioni">
              <Gear />
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
