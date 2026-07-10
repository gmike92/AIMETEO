// Route browser + conditions board (moved here when the map became the
// landing page). Server component, ISR 5 min, SEO metadata.
import { serverFetch } from "@/lib/api";
import WaitlistSignup from "../components/WaitlistSignup";
import ConditionsBoard from "../components/ConditionsBoard";

export const revalidate = 300;

export const metadata = {
  title: "Itinerari e condizioni — AIMETEO",
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

  let routes = [];
  let error = null;
  try {
    routes = await serverFetch(
      `/routes${activity ? `?activity=${encodeURIComponent(activity)}` : ""}`,
      { revalidate: 300 }
    );
  } catch (e) {
    error = e.message;
  }

  return (
    <div>
      <span className="eyebrow">Italia-first · per la montagna</span>
      <h1>Itinerari e <em>condizioni</em>.</h1>
      <p className="sub">
        Sfoglia gli itinerari, controlla le condizioni sul percorso e genera una relazione
        di gita. Il bollettino valanghe ufficiale è sempre in evidenza.
      </p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
        {ACTIVITIES.map(([val, label]) => (
          <a
            key={val}
            className={`btn ${activity === val ? "" : "ghost"}`}
            href={val ? `/itinerari?activity=${encodeURIComponent(val)}` : "/itinerari"}
          >
            {label}
          </a>
        ))}
      </div>

      {error && <p className="err">Backend non raggiungibile: {error}</p>}

      <ConditionsBoard />

      <h2 style={{ marginTop: 28 }}>Itinerari</h2>
      <div className="grid">
        {routes.map((r) => {
          // With a real GPX track → open the map on the track; otherwise → scheda.
          const hasTrack = r.start_lat != null && r.start_lon != null;
          return (
            <a
              className="card"
              key={r.slug}
              href={hasTrack ? `/?route=${encodeURIComponent(r.slug)}` : `/routes/${r.slug}`}
            >
              <h3>{r.name}</h3>
              <div className="meta">
                <span className="pill">{r.activity}</span>
                <span>{r.area_name}</span>
              </div>
              <div className="meta">
                <span>{r.diff_grade}</span>
                <span>↑ {r.vertical_gain_m} m</span>
                <span>max {r.max_altitude_m} m</span>
              </div>
              <div className="meta" style={{ color: "var(--accent)" }}>
                {hasTrack ? "Traccia sulla mappa →" : "Scheda itinerario →"}
              </div>
            </a>
          );
        })}
      </div>
      {!error && routes.length === 0 && (
        <p className="note">Nessun itinerario per questo filtro.</p>
      )}

      <WaitlistSignup source="frontend" />
    </div>
  );
}
