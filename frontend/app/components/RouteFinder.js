"use client";
// Pagina itinerari: ricerca per nome + "vicino a" sopra la lista.
//
// Mentre si cerca, il contenuto di navigazione (tabella condizioni e titolo,
// passati come children dal Server Component) si nasconde: i risultati
// salgono subito sotto la barra invece di finire in fondo alla pagina.
//
// Posizione di un itinerario per "vicino a":
// - con traccia: la partenza reale → distanza esatta;
// - senza traccia (la maggior parte, da Camptocamp): il riquadro reale
//   dell'area da cui è stato importato → distanza al riquadro, dichiarata
//   approssimata ("in zona" / "~15 km, zona"). Senza questo, vicino a
//   Cervinia comparirebbero solo i pochi itinerari con traccia su decine
//   che sono davvero in zona.
import { useMemo, useState } from "react";
import { RouteGrid } from "./RouteCard";
import { ListFinder, useNearSearch } from "./ListFinder";
import { useT } from "@/lib/i18n";
import { haversineKm, distanceToBoxKm, matchesQuery } from "@/lib/geo";

function nearInfo(route, ref, areaBoxes) {
  if (route.start_lat != null && route.start_lon != null) {
    return { km: haversineKm(ref.lat, ref.lng, route.start_lat, route.start_lon), approx: false };
  }
  const box = areaBoxes[route.area_id];
  if (box) return { km: distanceToBoxKm(ref.lat, ref.lng, box), approx: true };
  return null; // nessuna posizione nota: resta in fondo, senza distanza
}

export default function RouteFinder({ routes = [], freezingLevelByArea = {}, areaBoxes = {}, children }) {
  const t = useT();
  const [query, setQuery] = useState("");
  const near = useNearSearch();

  const { result, nearBySlug } = useMemo(() => {
    const found = routes.filter((r) => matchesQuery(query, r.name, r.area_name, r.country));
    if (!near.active || !near.ref) return { result: found, nearBySlug: null };
    const bySlug = {};
    for (const r of found) bySlug[r.slug] = nearInfo(r, near.ref, areaBoxes);
    const sorted = [...found].sort((a, b) => {
      const na = bySlug[a.slug];
      const nb = bySlug[b.slug];
      if (!na || !nb) return (na ? 0 : 1) - (nb ? 0 : 1);
      // a pari distanza (es. tutti "in zona") prima chi ha la posizione esatta
      return na.km - nb.km || Number(na.approx) - Number(nb.approx) || a.name.localeCompare(b.name);
    });
    return { result: sorted, nearBySlug: bySlug };
  }, [routes, query, near.active, near.ref, areaBoxes]);

  const busy = query.trim().length > 0 || Boolean(near.active && near.ref);

  return (
    <>
      <ListFinder
        query={query}
        onQuery={setQuery}
        near={near}
        placeholder={t("finder.search_routes")}
        resultCount={result.length}
      />
      {!busy && children}
      <RouteGrid routes={result} freezingLevelByArea={freezingLevelByArea} nearBySlug={nearBySlug} />
      {busy && result.length === 0 && (
        <p className="note">{t("finder.no_results_routes")}</p>
      )}
    </>
  );
}
