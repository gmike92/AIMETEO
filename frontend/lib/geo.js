// Distanze e ricerca per nome, condivise da itinerari e falesie.

const R_KM = 6371;
const rad = (d) => (d * Math.PI) / 180;

export function haversineKm(lat1, lon1, lat2, lon2) {
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_KM * Math.asin(Math.sqrt(h));
}

/** Distanza dal punto al riquadro [sud, ovest, nord, est]: 0 se ci sta
 *  dentro, altrimenti fino al bordo più vicino. Per un itinerario senza
 *  traccia è l'unica misura onesta: sappiamo che sta nel riquadro dell'area,
 *  non dove. Il centro del riquadro sbaglierebbe di più chi è già in zona. */
export function distanceToBoxKm(lat, lon, bbox) {
  const [s, w, n, e] = bbox;
  const cLat = Math.min(Math.max(lat, s), n);
  const cLon = Math.min(Math.max(lon, w), e);
  return haversineKm(lat, lon, cLat, cLon);
}

/** Minuscolo e senza accenti: "Rifugio Vittorio Emanuele" si trova anche
 *  scrivendo "emanuele", "Chamonix" anche scrivendo "chamonìx". */
export function normalize(text) {
  return (text || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Tutte le parole cercate devono comparire, in qualunque ordine: "paradiso
 *  normale" trova "Gran Paradiso — via normale". */
export function matchesQuery(query, ...fields) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = normalize(fields.filter(Boolean).join(" "));
  return words.every((w) => hay.includes(w));
}
