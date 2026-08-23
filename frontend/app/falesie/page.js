// Falesie — sole/ombra per parete dal modello solare (server component).
// La domanda a cui risponde: "dove si scala al sole (o all'ombra) oggi?"
import { serverFetch } from "@/lib/api";
import { Icon } from "../components/WxIcon";

export const revalidate = 900;

export const metadata = {
  title: "Falesie: sole e ombra oggi | Zerotermico",
  description:
    "Quale falesia è al sole adesso? Calcolo fisico di sole e ombra per parete, dall'esposizione reale, ora per ora.",
};

function fmt(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("it-IT", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome",
  });
}

export default async function Falesie() {
  let crags = [];
  let error = null;
  try {
    crags = await serverFetch("/falesie", { revalidate: 900 });
  } catch (e) {
    error = e.message;
  }

  const known = crags.filter((c) => c.aspect);
  const unknown = crags.filter((c) => !c.aspect);

  return (
    <div>
      <span className="eyebrow">arrampicata</span>
      <h1>Falesie: <em>sole e ombra</em> oggi.</h1>
      <p className="sub">
        Calcolato dalla fisica — posizione del sole ed esposizione reale della parete,
        al quarto d'ora. Orari in ora italiana.
      </p>

      {error && <p className="err">Backend non raggiungibile: {error}</p>}

      {!error && crags.length === 0 && (
        <div className="panel">
          <strong>Nessuna falesia ancora censita.</strong>
          <p className="note">
            Importa le prime da OpenStreetMap:{" "}
            <code>python3 scripts/import_osm_crags.py</code> nel backend — poi
            un curatore conferma nome, quota ed esposizione della parete.
          </p>
        </div>
      )}

      <div className="grid">
        {known.map((c) => (
          <div className="card" key={c.slug} style={{ cursor: "default" }}>
            <h3>{c.name}</h3>
            <div className="meta">
              <span className="pill">parete {c.aspect}</span>
              {c.ele_m != null && <span>{c.ele_m} m</span>}
              {c.in_sole_adesso != null && (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6,
                  color: c.in_sole_adesso ? "var(--warn)" : "var(--accent)" }}>
                  {c.in_sole_adesso ? <Icon.Sun size={14} /> : <Icon.Moon size={14} />}
                  {c.in_sole_adesso ? "al sole adesso" : "in ombra adesso"}
                </span>
              )}
            </div>
            {c.finestre_sole?.length > 0 ? (
              <p className="note">
                Sole oggi:{" "}
                {c.finestre_sole.map((w, i) => (
                  <span key={i}>
                    {i > 0 && " · "}
                    {fmt(w.dalle)}–{fmt(w.alle)}
                  </span>
                ))}
              </p>
            ) : (
              <p className="note">Oggi la parete resta in ombra.</p>
            )}
            {c.verified_at == null && (
              <p className="note" style={{ opacity: 0.7 }}>da verificare · {c.source}</p>
            )}
          </div>
        ))}
      </div>

      {unknown.length > 0 && (
        <>
          <h2>Esposizione da censire</h2>
          <p className="note">
            Per queste manca l'esposizione della parete su OSM: senza, niente calcolo
            (mai inventato). Un curatore può aggiungerla.
          </p>
          <div className="grid">
            {unknown.map((c) => (
              <div className="card" key={c.slug} style={{ cursor: "default", opacity: 0.75 }}>
                <h3>{c.name}</h3>
                <div className="meta">
                  {c.ele_m != null && <span>{c.ele_m} m</span>}
                  <span>esposizione n.d.</span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <p className="disclaimer">
        Sole/ombra calcolati geometricamente (senza ombreggiamento del terreno
        circostante, v1). Dati falesie © OpenStreetMap contributors (ODbL).
      </p>
    </div>
  );
}
