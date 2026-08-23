// Route browser + tabella condizioni (spostati qui quando la mappa è
// diventata la landing page). Server component, ISR 5 min, metadata SEO.
import { serverFetch } from "@/lib/api";
import WaitlistSignup from "../components/WaitlistSignup";
import ConditionsTable from "../components/ConditionsTable";
import RouteCard, { ActivityTabs } from "../components/RouteCard";

export const revalidate = 300;

export const metadata = {
  title: "Itinerari e condizioni — Zerotermico",
  description:
    "Itinerari di scialpinismo, alpinismo, ferrate ed escursionismo con bollettino valanghe ufficiale, meteo sul percorso e relazione di gita AI.",
};

const ACTIVITIES = [
  ["", "Tutti"],
  ["scialpinismo", "Scialpinismo"],
  ["alpinismo", "Alpinismo"],
  ["via_ferrata", "Via ferrata"],
  ["escursionismo", "Escursionismo"],
];

export default async function Itinerari({ searchParams }) {
  const activity = searchParams?.activity || "";
  const sort = searchParams?.sort || "nome";

  // Una sola chiamata NON filtrata: i conteggi delle tab devono contare
  // tutti gli itinerari, non solo quelli del filtro attivo (con /routes
  // ?activity=… le altre tab mostrerebbero sempre 0). Il filtro si applica
  // qui, e la tabella condizioni riusa la stessa lista.
  let all = [];
  let areas = [];
  let error = null;
  try {
    all = await serverFetch("/routes", { revalidate: 300 });
  } catch (e) {
    error = e.message;
  }
  try {
    areas = await serverFetch("/conditions", { revalidate: 300 });
  } catch {
    areas = []; // backend parziale: la pagina sopravvive, la tabella si accorcia
  }

  const counts = all.reduce(
    (acc, r) => {
      acc[r.activity] = (acc[r.activity] || 0) + 1;
      acc.__total__ += 1;
      return acc;
    },
    { __total__: 0 }
  );

  const routes = activity ? all.filter((r) => r.activity === activity) : all;

  // Zero termico per area, da /conditions: la card lo disegna sul profilo
  // solo se cade nella fascia di quota dell'itinerario. Se manca, la card
  // degrada senza errori.
  const frzByArea = Object.fromEntries(
    areas
      .filter((a) => a.forecast?.freezing_level_m != null)
      .map((a) => [a.area_id, a.forecast.freezing_level_m])
  );

  return (
    <div>
      <span className="eyebrow">Italia-first · per la montagna</span>
      <h1>Itinerari e <em>condizioni</em>.</h1>
      <p className="sub">
        Sfoglia gli itinerari, controlla le condizioni sul percorso e genera una relazione
        di gita. Il bollettino valanghe ufficiale è sempre in evidenza.
      </p>

      {/* Tab come link veri: il filtro sopravvive al reload ed è condivisibile. */}
      <ActivityTabs activities={ACTIVITIES} current={activity} counts={counts} />

      {error && <p className="err">Backend non raggiungibile: {error}</p>}

      <ConditionsTable areas={areas} routes={routes} sort={sort} activity={activity} />

      <h2 style={{ marginTop: 34 }}>Itinerari</h2>
      <div className="grid">
        {routes.map((r) => (
          <RouteCard key={r.slug} route={r} freezingLevel={frzByArea[r.area_id]} />
        ))}
      </div>
      {!error && routes.length === 0 && (
        <p className="note">Nessun itinerario per questo filtro.</p>
      )}

      <WaitlistSignup source="frontend" />
    </div>
  );
}
