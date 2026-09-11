// Posizione di riferimento della mappa, condivisa tra la mappa e i pannelli
// (itinerari, falesie) che cercano "vicino a".
//
// Perché un modulo e non solo l'evento "zt-map-center": gli eventi non si
// ripetono. Un pannello aperto DOPO che l'utente ha messo il segnaposto non
// l'avrebbe mai saputo — qui l'ultima posizione resta leggibile.
//
// Conta solo ciò che l'utente ha scelto: il segnaposto ("pin", un click
// sulla mappa) o la sua posizione ("home", geolocalizzazione). La mappa
// emette "zt-map-center" anche quando mette a fuoco un itinerario o una
// falesia aperti da una lista ("route", "crag"): quelli NON diventano il
// riferimento, altrimenti "vicino a" salterebbe sull'ultimo elemento visto.

export const MAP_CENTER_EVENT = "zt-map-center";
export const NEAR_REF_EVENT = "zt-near-ref";
export const LOCATE_REQUEST_EVENT = "zt-locate-request";
export const LOCATE_FAILED_EVENT = "zt-locate-failed";

let nearRef = null; // { lat, lng, source: "pin" | "home", name? }
let lastHome = null;

function emit(type, detail) {
  window.dispatchEvent(new CustomEvent(type, { detail }));
}

/** Unico punto da cui la mappa annuncia una posizione. */
export function publishMapLocation(detail) {
  if (detail.source === "pin" || detail.source === "home") {
    if (detail.source === "home") lastHome = detail;
    nearRef = detail;
    emit(NEAR_REF_EVENT, nearRef);
  }
  emit(MAP_CENTER_EVENT, detail);
}

/** Il segnaposto è stato tolto (Esc): il riferimento torna alla posizione
 *  dell'utente se nota, altrimenti non c'è più. */
export function clearMapPin() {
  if (nearRef?.source !== "pin") return;
  nearRef = lastHome;
  emit(NEAR_REF_EVENT, nearRef);
}

export function getNearReference() {
  return nearRef;
}

/** Chiede alla mappa di geolocalizzare (stesso flusso del Mirino: vola sulla
 *  posizione, mette la casina, poi pubblica "home"). Esito negativo →
 *  LOCATE_FAILED_EVENT con il motivo. */
export function requestLocate() {
  emit(LOCATE_REQUEST_EVENT, null);
}
