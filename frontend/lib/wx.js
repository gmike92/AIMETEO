// Icone e colori meteo condivisi (giorni della settimana, finestra migliore).
// Regole semplici e dichiarate: precipitazioni > nuvole > sereno.

export function wxIcon({ precip_mm = 0, nuvole_pct = 0, neve = false }) {
  if (precip_mm > 0.2) {
    if (neve) return "🌨";
    return precip_mm >= 8 ? "⛈" : "🌧";
  }
  if (nuvole_pct >= 75) return "☁";
  if (nuvole_pct >= 35) return "⛅";
  return "☀";
}

export function scoreColor(p) {
  if (p >= 80) return "var(--accent2)";
  if (p >= 55) return "var(--warn)";
  return "var(--danger)";
}
