"use client";
// Planner a due colonne — opzione 1e.
//
// Qui non cambia una riga di logica: stato, execute, deep link e copyLink
// sono identici a prima. Cambia solo l'involucro — il form diventa sticky a
// sinistra, l'esito scorre a destra, e i due blocchi finali (safe_candidates
// ed blocked) passano da lista verticale a due colonne pari, così il filtro
// di sicurezza si legge come una scelta motivata e non come una sequenza
// di errori.
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Icon } from "../components/WxIcon";

const ACTIVITIES = [
  ["scialpinismo", "Scialpinismo"],
  ["alpinismo", "Alpinismo"],
  ["arrampicata", "Arrampicata"],
  ["via_ferrata", "Via ferrata"],
  ["escursionismo", "Escursionismo"],
  ["trail_running", "Trail running"],
  ["mtb_alpino", "MTB alpino"],
  ["volo_libero", "Volo libero"],
];

export default function Planner() {
  const [intent, setIntent] = useState(
    "Vorrei una gita scialpinistica in Dolomiti questo weekend, livello BSA, mezza giornata."
  );
  const [activity, setActivity] = useState("scialpinismo");
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const execute = async (intentText, act) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setCopied(false);
    try {
      setResult(await api.plan({ intent_text: intentText, activity: act }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const run = (e) => {
    e.preventDefault();
    execute(intent, activity);
  };

  // Link condiviso: /planner?i=<richiesta>&a=<attività> → precompila ed
  // esegue subito il piano (ricalcolato ORA, con bollettino e meteo attuali —
  // mai un piano "congelato" potenzialmente scaduto).
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const i = sp.get("i");
    if (i) {
      const a = sp.get("a") || "scialpinismo";
      setIntent(i);
      setActivity(a);
      execute(i, a);
    }
  }, []);

  const copyLink = async () => {
    const url =
      `${window.location.origin}/planner?i=${encodeURIComponent(intent)}` +
      `&a=${encodeURIComponent(activity)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      window.prompt("Copia il link:", url);
    }
  };

  const plan = result?.plan;

  return (
    <div>
      <div className="plan2">
        <div className="ask">
          <span className="eyebrow">Pro · pianificatore AI</span>
          <h1>Pianifica una <em>gita</em></h1>
          <p className="sub">
            Descrivi cosa vorresti fare. I filtri di sicurezza girano{" "}
            <strong>prima</strong> che l'AI scriva: gli itinerari non sicuri non le
            vengono mai mostrati.
          </p>

          <form onSubmit={run}>
            <label htmlFor="intent">Cosa vorresti fare?</label>
            <textarea
              id="intent"
              rows={3}
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
            />

            {/* Il <select> diventa una fila di chip: risolve anche il popup
                nativo bianco che andava corretto con select option{…}. */}
            <label id="act-label">Attività</label>
            <div className="chips" role="group" aria-labelledby="act-label">
              {ACTIVITIES.map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  className={`chip ${activity === val ? "on" : ""}`}
                  aria-pressed={activity === val}
                  onClick={() => setActivity(val)}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 9 }}>
              <button className="btn" type="submit" disabled={loading}>
                {loading ? "Elaboro…" : "Pianifica"}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={copyLink}
                style={{ padding: "10px 16px", fontSize: 13 }}
              >
                {copied ? "Link copiato" : "Condividi col compagno di gita"}
              </button>
            </div>
          </form>

          <p className="note" style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            Chi apre il link vede il piano <strong>ricalcolato adesso</strong>, con
            bollettino e meteo aggiornati — mai una copia vecchia.
          </p>
        </div>

        <div className="out">
          {error && <p className="err">Errore: {error}</p>}
          {!result && !error && !loading && (
            <p className="note">L'esito del piano compare qui.</p>
          )}
          {loading && <p className="loading">Elaboro il piano…</p>}

          {result && (
            <div className="plan-filterbar">
              <Icon.Check size={15} />
              {result.safe_candidates.length} itinerari passano i filtri
              <em>{result.blocked.length} esclusi · l'AI non li vede</em>
            </div>
          )}

          {result?.forecast_notice && (
            <p className="err" role="status">{result.forecast_notice}</p>
          )}

          {plan && (
            <div className="panel" style={{ marginTop: 0 }}>
              {plan.titolo && <h3>{plan.titolo}</h3>}

              {plan.allerta_sicurezza && (
                <div className="bulletin blocked">
                  <strong style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <Icon.Warning size={15} /> Allerta sicurezza
                  </strong>
                  <div className="why">{plan.allerta_sicurezza}</div>
                </div>
              )}

              {plan.bollettino_valanghe && (
                <div className="bulletin">
                  <div className="lvl tnum">
                    Bollettino {plan.bollettino_valanghe.fonte}
                    {plan.bollettino_valanghe.grado_ufficiale != null &&
                      ` · pericolo ${plan.bollettino_valanghe.grado_ufficiale}`}
                  </div>
                  {plan.bollettino_valanghe.sintesi && (
                    <p className="note">{plan.bollettino_valanghe.sintesi}</p>
                  )}
                  {plan.bollettino_valanghe.link && (
                    <a className="note" href={plan.bollettino_valanghe.link}
                      target="_blank" rel="noopener">
                      Fonte ufficiale →
                    </a>
                  )}
                </div>
              )}

              {plan.itinerario && <p style={{ marginTop: 14 }}>{plan.itinerario}</p>}

              {plan.timing && (
                <div className="stats tnum">
                  {plan.timing.alba && (
                    <div className="stat"><div className="k">Alba</div><div className="v">{plan.timing.alba}</div></div>
                  )}
                  {plan.timing.partenza_consigliata && (
                    <div className="stat"><div className="k">Partenza</div><div className="v" style={{ color: "var(--accent)" }}>{plan.timing.partenza_consigliata}</div></div>
                  )}
                  {plan.timing.vetta_entro && (
                    <div className="stat"><div className="k">Vetta entro</div><div className="v">{plan.timing.vetta_entro}</div></div>
                  )}
                  {plan.timing.rientro_stimato && (
                    <div className="stat"><div className="k">Rientro</div><div className="v">{plan.timing.rientro_stimato}</div></div>
                  )}
                </div>
              )}

              {plan.condizioni && (
                <p className="note"><strong>Condizioni:</strong> {plan.condizioni}</p>
              )}

              {(plan.punti_decisionali || []).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="dockhead" style={{ marginBottom: 9 }}>Punti decisionali</div>
                  <div className="declist">
                    {plan.punti_decisionali.map((p, i) => (
                      <div className="decrow" key={i}>
                        <span className="n tnum">{i + 1}</span>
                        <span className="t">{p}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {(plan.equipaggiamento_consigliato || []).length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="dockhead" style={{ marginBottom: 9 }}>Equipaggiamento</div>
                  <div className="meta">
                    {plan.equipaggiamento_consigliato.map((item, i) => (
                      <span className="pill" key={i}>{item}</span>
                    ))}
                  </div>
                </div>
              )}

              {plan.piano_b && (
                <p className="note" style={{ marginTop: 16 }}>
                  <strong>Piano B:</strong> {plan.piano_b}
                </p>
              )}
            </div>
          )}

          {result && !plan && result.plan_text && (
            <div className="panel" style={{ marginTop: 0 }}><p>{result.plan_text}</p></div>
          )}

          {result?.plan_model && <p className="note">generato da {result.plan_model}</p>}

          {result && (result.safe_candidates.length > 0 || result.blocked.length > 0) && (
            <div className="plan-cols">
              <div className="plan-col">
                <div className="dockhead">Sicuri · {result.safe_candidates.length}</div>
                {result.safe_candidates.length === 0 && (
                  <p className="note" style={{ margin: 0 }}>Nessuno per questa richiesta.</p>
                )}
                {result.safe_candidates.map((c) => (
                  <div className="plan-row" key={c.route_id}>
                    <a className="nm" href={`/routes/${c.route_id}`}>{c.name}</a>
                  </div>
                ))}
              </div>

              <div className="plan-col no">
                <div className="dockhead">Esclusi dai filtri · {result.blocked.length}</div>
                {result.blocked.length === 0 && (
                  <p className="note" style={{ margin: 0 }}>Nessuno escluso.</p>
                )}
                {result.blocked.map((c) => (
                  <div className="plan-row" key={c.route_id} style={{ display: "block" }}>
                    <span className="nm">{c.name}</span>
                    {c.block_reasons.map((r, i) => (
                      <div className="why" key={i}>{r}</div>
                    ))}
                  </div>
                ))}
                <p className="note" style={{ marginTop: 10 }}>
                  L'AI non vede mai questi itinerari, quindi non può proporli.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="disclaimer">
        Supporto alla decisione, non raccomandazione. Responsabilità finale al capogita;
        il bollettino ufficiale AINEVA/Meteomont prevale sempre.
      </p>
    </div>
  );
}
