// Formattazione numerica condivisa — regola 1.3 del design system:
// ogni cifra che sta in colonna o si aggiorna nel tempo va in tabular-nums
// (lo fa il CSS, classe .tnum) e le migliaia si separano con uno SPAZIO
// SOTTILE U+2009, non con un punto o una virgola: "2 350 m".
//
// Il separatore è scritto come fromCharCode e non come letterale: U+2009 è
// invisibile nel sorgente, e un carattere invisibile che qualcuno cancella
// per sbaglio è un bug che non si vede in code review.
//
// Raggruppamento fatto a mano invece che con toLocaleString: il separatore
// dipenderebbe dal locale del runtime (server vs browser), e una quota che
// cambia forma tra render server e idratazione client è un mismatch di
// idratazione, non una scelta tipografica.

const THIN = String.fromCharCode(0x2009);

/** 2350 → "2 350". null/NaN → null, così il chiamante può omettere la riga. */
export function fmtNum(n) {
  const v = Number(n);
  if (n == null || n === "" || !Number.isFinite(v)) return null;
  const sign = v < 0 ? "-" : "";
  return sign + String(Math.abs(Math.round(v))).replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
}

/** 2350 → "2 350 m" (niente unità se il valore manca). */
export function fmtM(n) {
  const s = fmtNum(n);
  return s == null ? null : `${s}${THIN}m`;
}

/** 260 → "4h20"; 45 → "45min"; null → null. */
export function fmtMin(min) {
  if (min == null || min === "" || !Number.isFinite(Number(min))) return null;
  const t = Math.round(Number(min));
  const h = Math.floor(t / 60);
  const m = t % 60;
  if (!h) return `${m}min`;
  return `${h}h${m ? String(m).padStart(2, "0") : ""}`;
}
