"use client";
// Footer sito — normale su ogni pagina. Sulla mappa ("/") la pagina è
// fissa a tutto schermo, senza scroll (vedi globals.css), quindi il footer
// non è raggiungibile lì: il suo contenuto vive invece nel pulsante "Info"
// della mappa (MapChrome.js), che riusa FooterLinks per non duplicare testo.
import { usePathname } from "next/navigation";

export function FooterLinks() {
  return (
    <>
      Zerotermico · nome di lavoro · Bollettini: fonte ufficiale AINEVA / Meteomont ·{" "}
      <a href="/fonti" style={{ textDecoration: "underline" }}>Fonti e licenze</a> ·{" "}
      <a href="/privacy" style={{ textDecoration: "underline" }}>Privacy</a>
    </>
  );
}

export default function SiteFooter() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <footer className="wrap">
      <FooterLinks />
    </footer>
  );
}
