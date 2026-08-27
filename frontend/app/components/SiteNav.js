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
import { usePathname, useRouter } from "next/navigation";
import { useTopEdgeAutoHide } from "@/lib/useAutoHide";
import { Icon } from "./WxIcon";

// Le pagine che ora vivono sopra alla mappa persistente (vedi
// app/(map)/layout.js): la navbar ci si comporta come sulla mappa pura
// (overlay flottante a scomparsa), non come una pagina normale col proprio
// scroll — il contenuto qui è un pannello, la mappa resta sempre sotto.
const MAP_SHELL_PATHS = new Set(["/", "/itinerari", "/falesie", "/planner"]);

export default function SiteNav() {
  const pathname = usePathname();
  const router = useRouter();
  const immersive = MAP_SHELL_PATHS.has(pathname);
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
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {/* Sostituisce il link testuale "Mappa": la mappa non è più una
                destinazione a parte, è sempre lì sotto — qui serve solo un
                modo per lasciare il pannello aperto e tornare a vederla. */}
            {pathname !== "/" && (
              <button
                type="button"
                className="navback"
                onClick={() => router.push("/")}
                aria-label="Torna alla mappa"
                title="Torna alla mappa"
              >
                <Icon.ArrowLeft size={18} />
              </button>
            )}
            <Link href="/" className="logo" aria-label="Zerotermico">
              <img src="/logo.png" width="30" height="30" alt="" aria-hidden="true" />
              zero<span>°termico</span>
            </Link>
          </div>
          <div>
            <Link href="/localita">Cerca</Link>
            {/* Itinerari/Falesie/Pianifica sono pannelli, non pagine a sé —
                nascosti di default, un click li apre (naviga alla rotta),
                un secondo click li richiude (torna a "/") invece di restare
                lì fermi: stesso href che cambia bersaglio a seconda che il
                pannello sia già quello aperto o no. */}
            {[
              ["/itinerari", "Itinerari"],
              ["/falesie", "Falesie"],
              ["/planner", "Pianifica"],
            ].map(([href, label]) => {
              const active = pathname === href;
              return (
                <Link key={href} href={active ? "/" : href}
                  className={active ? "navactive" : ""} aria-pressed={active}>
                  {label}
                </Link>
              );
            })}
            {/* Sulla mappa ("/") le impostazioni si aprono dal pulsante
                ingranaggio di MapChrome (MapTools) — qui serve solo per le
                altre pagine, dove quel chrome non esiste. */}
            <Link href="/impostazioni" className="navgear" aria-label="Impostazioni"
              title="Impostazioni">
              <Icon.Settings size={18} />
            </Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
