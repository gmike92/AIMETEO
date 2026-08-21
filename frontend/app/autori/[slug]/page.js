// Profilo curatore — la collezione firmata. Server component, SEO-ready:
// ogni curatore è una landing condivisibile sui suoi social.
import { notFound } from "next/navigation";
import { serverFetch } from "@/lib/api";

export const revalidate = 600;

async function getAutore(slug) {
  try {
    return await serverFetch(`/autori/${encodeURIComponent(slug)}`, { revalidate: 600 });
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

export async function generateMetadata({ params }) {
  const a = await getAutore(params.slug);
  if (!a) return { title: "Autore non trovato | Zerotermico" };
  return {
    title: `${a.name} — ${a.collezione?.titolo || "collezione"} | Zerotermico`,
    description: a.bio || `Le gite proposte da ${a.name} su Zerotermico.`,
  };
}

export default async function Autore({ params }) {
  const a = await getAutore(params.slug);
  if (!a) notFound();
  const routes = a.collezione?.routes || [];

  return (
    <div>
      <span className="eyebrow">curatore</span>
      <h1>{a.name}</h1>
      <div className="meta" style={{ marginTop: 4 }}>
        {a.ruolo && <span>{a.ruolo}</span>}
        {a.curatore_verificato && (
          <span className="pill" title="Badge assegnato da Zerotermico dopo verifica — mai autoproclamato">
            ✓ curatore verificato
          </span>
        )}
      </div>
      {a.bio && <p className="sub" style={{ marginTop: 14 }}>{a.bio}</p>}

      {a.collezione?.titolo && (
        <>
          <h2>{a.collezione.titolo}</h2>
          {a.collezione.descrizione && <p className="note">{a.collezione.descrizione}</p>}
        </>
      )}

      <div className="grid">
        {routes.map((r) => (
          <a className="card" key={r.slug} href={`/routes/${r.slug}`}>
            <h3>{r.name}</h3>
            <div className="meta">
              <span className="pill">{r.activity?.replace("_", " ")}</span>
              {r.diff_grade && <span>diff. {r.diff_grade}</span>}
            </div>
            <div className="meta" style={{ fontVariantNumeric: "tabular-nums" }}>
              <span>↗ {r.vertical_gain_m} m</span>
              <span>▲ {r.max_altitude_m} m</span>
              <span style={{ color: r.verified_at ? "var(--accent2)" : "var(--faint)" }}>
                {r.verified_at ? "✓ verificato" : "da verificare"}
              </span>
            </div>
          </a>
        ))}
      </div>
      {routes.length === 0 && <p className="note">Collezione in preparazione.</p>}

      <p className="disclaimer">
        Le collezioni sono proposte firmate dal curatore. La verifica dei singoli
        itinerari è un processo separato e sempre dichiarato; i filtri di sicurezza
        valgono per tutti, curatori inclusi.
      </p>
    </div>
  );
}
