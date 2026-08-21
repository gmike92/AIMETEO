// PWA manifest (Next.js app-router convention → served at /manifest.webmanifest).
// Makes Zerotermico installable as a STANDALONE app: own window/Dock icon, no
// browser chrome. Works from localhost and from any HTTPS deploy.
export default function manifest() {
  return {
    name: "Zerotermico — Il meteo alla tua quota",
    short_name: "Zerotermico",
    description:
      "Meteo alla quota reale, bollettini valanghe ufficiali, itinerari verificati e falesie sole/ombra per la montagna italiana.",
    start_url: "/",
    display: "standalone",
    background_color: "#0a1420",
    theme_color: "#0a1420",
    lang: "it",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
