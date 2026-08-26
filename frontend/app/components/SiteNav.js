"use client";
// Navbar — sticky and always visible on every normal page. On the map
// landing page ("/", fullscreen weather view) it switches to a floating
// auto-hide overlay instead, so the map gets the full viewport height.
// Reveal trigger is edge-only (useTopEdgeAutoHide), deliberately separate
// from the general useAutoHide used by the map's own weather/layer bars:
// those wake on any interaction anywhere, but the navbar popping up every
// time the user touches the map (even lower down) is what made it cover
// the search bar / Itinerari / Pianifica gita while people were using them.
// It now only wakes when the pointer/touch is actually near the top edge.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTopEdgeAutoHide } from "@/lib/useAutoHide";

export default function SiteNav() {
  const pathname = usePathname();
  const immersive = pathname === "/";
  const { hidden, onMouseEnter, onMouseLeave, onFocus, onBlur } = useTopEdgeAutoHide(immersive);

  return (
    <header
      className={`navbar ${immersive ? "navbar-immersive" : ""} ${hidden ? "chrome-hidden" : ""}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
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
            <Link href="/">Mappa</Link>
            <Link href="/localita">Cerca</Link>
            <Link href="/itinerari">Itinerari</Link>
            <Link href="/falesie">Falesie</Link>
            <Link href="/planner">Pianifica</Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
