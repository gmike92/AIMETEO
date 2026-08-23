// Colori e scale meteo condivisi.
//
// L'icona meteo NON vive più qui: le emoji sono state sostituite da glifi
// SVG (regola 1.2 del design system) — vedi app/components/WxIcon.js, che
// applica le stesse identiche soglie che applicava wxIcon.

export function scoreColor(p) {
  if (p >= 80) return "var(--accent2)";
  if (p >= 55) return "var(--warn)";
  return "var(--danger)";
}

// Scala di pericolo valanghe EAWS 1–5.
// Unica eccezione alla regola "solo token" del design system: sono i cinque
// colori dello standard ufficiale europeo, non una scelta cromatica nostra,
// quindi restano hex fissi e non vanno ritinti. Prima erano copiati in
// MapView.js e ConditionsBoard.js: due copie della stessa costante
// ufficiale sono due occasioni di farle divergere.
export const DANGER_COLORS = {
  1: "#9BC53D", 2: "#F5D547", 3: "#F49D37", 4: "#DA4167", 5: "#8B1E3F",
};

export const DANGER_LABELS = {
  1: "Debole", 2: "Moderato", 3: "Marcato", 4: "Forte", 5: "Molto forte",
};

/** Testo su chip EAWS: i due gradi più alti sono scuri, servono testo chiaro. */
export function dangerInk(level) {
  return level >= 4 ? "#fff" : "#0b1722";
}
