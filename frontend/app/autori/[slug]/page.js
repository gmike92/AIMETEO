// Profilo curatore — la collezione firmata. Server component, SEO-ready:
// ogni curatore è una landing condivisibile sui suoi social.
import { notFound } from "next/navigation";
import { serverFetch } from "@/lib/api";
import { Icon } from "../../components/WxIcon";
import T from "../../components/T";
import Measurement from "../../components/Measurement";

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
      <span className="eyebrow"><T k="autori.eyebrow" /></span>
      <h1>{a.name}</h1>
      <div className="meta" style={{ marginTop: 4 }}>
        {a.ruolo && <span>{a.ruolo}</span>}
        {a.curatore_verificato && (
          <span className="pill" style={{ gap: 6 }}
            title="Badge assegnato da Zerotermico dopo verifica — mai autoproclamato">
            <Icon.Check size={12} /> <T k="autori.verified_badge" />
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
              {r.diff_grade && <span>{r.diff_grade}</span>}
            </div>
            <div className="meta tnum">
              <span><Measurement kind="elevation" value={r.vertical_gain_m} /> <T k="autori.gain" /></span>
              <span><Measurement kind="elevation" value={r.max_altitude_m} /> <T k="autori.max" /></span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6,
                color: r.verified_at ? "var(--accent2-text)" : "var(--faint)" }}>
                {r.verified_at && <Icon.Check size={12} />}
                {r.verified_at ? <T k="rcard.verified" /> : <T k="rcard.unverified" />}
              </span>
            </div>
          </a>
        ))}
      </div>
      {routes.length === 0 && <p className="note"><T k="autori.empty" /></p>}

      <p className="disclaimer"><T k="autori.disclaimer" /></p>
    </div>
  );
}
