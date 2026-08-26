// Falesie — sole/ombra per parete dal modello solare (server component).
// La domanda a cui risponde: "dove si scala al sole (o all'ombra) oggi?"
//
// L'elenco vero e proprio (filtro paese, densità griglia/elenco, unità e
// lingua) vive in CragList (client): qui restano solo il fetch server-side
// e l'ISR a 15 minuti.
import { serverFetch } from "@/lib/api";
import CragList from "../components/CragList";
import T from "../components/T";

export const revalidate = 900;

export const metadata = {
  title: "Falesie: sole e ombra oggi | Zerotermico",
  description:
    "Quale falesia è al sole adesso? Calcolo fisico di sole e ombra per parete, dall'esposizione reale, ora per ora.",
};

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
      <span className="eyebrow"><T k="falesie.eyebrow" /></span>
      <h1><T k="falesie.h1_a" /> <em><T k="falesie.h1_em" /></em> <T k="falesie.h1_b" /></h1>
      <p className="sub"><T k="falesie.sub" /></p>

      {error && <p className="err"><T k="common.backend_down" />: {error}</p>}

      {!error && crags.length === 0 && (
        <div className="panel">
          <strong><T k="falesie.empty_heading" /></strong>
          <p className="note">
            Importa le prime da OpenStreetMap:{" "}
            <code>python3 scripts/import_osm_crags.py</code> nel backend — poi
            un curatore conferma nome, quota ed esposizione della parete.
          </p>
        </div>
      )}

      <CragList known={known} unknown={unknown} />

      <p className="disclaimer"><T k="falesie.disclaimer" /></p>
    </div>
  );
}
