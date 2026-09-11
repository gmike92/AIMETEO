"use client";
// Ricerca per nome + "vicino a" — la stessa barra per itinerari e falesie.
//
// "Vicino a" usa il riferimento che l'utente ha scelto sulla mappa (vedi
// lib/mapLocation.js): il segnaposto, se ne ha messo uno, altrimenti la sua
// posizione. Se non c'è né l'uno né l'altra si chiede la geolocalizzazione
// alla MAPPA, non al browser da qui: stesso flusso del Mirino (vola sulla
// posizione e ci lascia la casina), così si vede anche dove si è, e resta
// una sola logica di geolocalizzazione nell'app. Mentre è attivo segue il
// riferimento: un nuovo click sulla mappa riordina la lista attorno a quel
// punto.
import { useEffect, useRef, useState } from "react";
import { Icon } from "./WxIcon";
import { useT } from "@/lib/i18n";
import { useUnits } from "@/lib/units";
import {
  NEAR_REF_EVENT, LOCATE_FAILED_EVENT, getNearReference, requestLocate,
} from "@/lib/mapLocation";

// Se la mappa non risponde (non ancora pronta) il pulsante non deve
// restare in "cerco la tua posizione…" per sempre.
const LOCATE_TIMEOUT_MS = 15000;

export function useNearSearch() {
  const [active, setActive] = useState(false);
  const [ref, setRef] = useState(null);
  const [status, setStatus] = useState("idle"); // idle | locating | error
  const [error, setError] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    if (!active) return;
    const onRef = (e) => {
      const next = e.detail;
      if (!next) {
        // segnaposto tolto e nessuna posizione nota: non si inventa un centro
        setRef(null);
        return;
      }
      clearTimeout(timer.current);
      setRef(next);
      setStatus("idle");
      setError(null);
    };
    const onFailed = (e) => {
      clearTimeout(timer.current);
      setStatus("error");
      setError(e.detail?.message || null);
    };
    window.addEventListener(NEAR_REF_EVENT, onRef);
    window.addEventListener(LOCATE_FAILED_EVENT, onFailed);
    return () => {
      window.removeEventListener(NEAR_REF_EVENT, onRef);
      window.removeEventListener(LOCATE_FAILED_EVENT, onFailed);
    };
  }, [active]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const locate = () => {
    setStatus("locating");
    setError(null);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setStatus("error");
      setError(null);
    }, LOCATE_TIMEOUT_MS);
    requestLocate();
  };

  const activate = () => {
    setActive(true);
    const current = getNearReference();
    if (current) {
      setRef(current);
      setStatus("idle");
    } else {
      setRef(null);
      locate();
    }
  };

  const clear = () => {
    clearTimeout(timer.current);
    setActive(false);
    setRef(null);
    setStatus("idle");
    setError(null);
  };

  return { active, ref, status, error, activate, clear, locateMe: locate };
}

export function ListFinder({ query, onQuery, near, placeholder, resultCount }) {
  const t = useT();
  const searching = query.trim().length > 0;

  const refLabel = near.ref
    ? near.ref.source === "home"
      ? t("finder.ref_home")
      : near.ref.name || t("finder.ref_pin")
    : null;

  return (
    <div className="finder">
      <div className="finder-bar">
        <label className="finder-search">
          <Icon.Search size={15} />
          <input
            type="search"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder={placeholder}
            aria-label={placeholder}
          />
          {searching && (
            <button type="button" className="finder-x" onClick={() => onQuery("")}
              aria-label={t("finder.clear_search")}>×</button>
          )}
        </label>
        <button
          type="button"
          className={`finder-near ${near.active ? "on" : ""}`}
          onClick={near.active ? near.clear : near.activate}
          aria-pressed={near.active}
          aria-label={t("finder.near")}
          title={t("finder.near_title")}
        >
          <Icon.Crosshair size={17} />
          <span>{t("finder.near")}</span>
        </button>
      </div>

      {near.active && (
        <div className="finder-ref" role="status">
          {near.status === "locating" ? (
            <span>{t("finder.locating")}</span>
          ) : near.status === "error" ? (
            <span className="err">{near.error || t("finder.locate_failed")}</span>
          ) : near.ref ? (
            <span>
              {t("finder.near_to")} <strong>{refLabel}</strong>
              {near.ref.source === "pin" ? (
                <button type="button" className="linkbtn" onClick={near.locateMe}>
                  {t("finder.use_my_position")}
                </button>
              ) : (
                <span className="finder-hint"> · {t("finder.pin_hint")}</span>
              )}
            </span>
          ) : (
            <span>{t("finder.no_ref")}</span>
          )}
          <button type="button" className="finder-x" onClick={near.clear}
            aria-label={t("finder.close_near")}>×</button>
        </div>
      )}

      {(searching || (near.active && near.ref)) && resultCount != null && (
        <p className="finder-count">{t("finder.results", { n: resultCount })}</p>
      )}
    </div>
  );
}

/** Distanza sulla card: esatta ("12 km", dalla partenza o dalla falesia) o
 *  dichiaratamente approssimata ("in zona" / "~15 km, zona") quando si sa
 *  solo il riquadro dell'area — mai un numero secco che sembri preciso. */
export function NearBadge({ near }) {
  const t = useT();
  const units = useUnits();
  if (!near) return null;
  if (!near.approx) {
    return <span className="dist-badge tnum">{units.distance(near.km)}</span>;
  }
  return (
    <span className="dist-badge approx tnum" title={t("finder.approx_title")}>
      {near.km < 0.5 ? t("finder.in_area") : `~${units.distance(near.km)} · ${t("finder.area")}`}
    </span>
  );
}
