"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

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

  return (
    <div>
      <span className="eyebrow">Pro · pianificatore AI</span>
      <h1>Pianifica una <em>gita</em></h1>
      <p className="sub">
        Descrivi cosa vorresti fare. Il backend filtra gli itinerari, incrocia meteo e
        bollettino e applica i filtri di sicurezza <strong>prima</strong> che l'AI scriva.
        Gli itinerari non sicuri non vengono mai proposti.
      </p>

      <form onSubmit={run} className="panel">
        <label>Cosa vorresti fare?</label>
        <textarea rows={3} value={intent} onChange={(e) => setIntent(e.target.value)} />
        <label>Attività</label>
        <select value={activity} onChange={(e) => setActivity(e.target.value)}>
          <option value="scialpinismo">Scialpinismo</option>
          <option value="alpinismo">Alpinismo</option>
          <option value="arrampicata">Arrampicata</option>
          <option value="via_ferrata">Via ferrata</option>
          <option value="escursionismo">Escursionismo</option>
          <option value="trail_running">Trail running</option>
          <option value="mtb_alpino">MTB alpino</option>
          <option value="volo_libero">Volo libero (parapendio)</option>
        </select>
        <div style={{ marginTop: 16 }}>
          <button className="btn" type="submit" disabled={loading}>
            {loading ? "Elaboro…" : "Pianifica"}
          </button>
        </div>
      </form>

      {error && <p className="err">Errore: {error}</p>}

      {result && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <h2 style={{ margin: "30px 0 12px" }}>Esito</h2>
            <button type="button" className="btn ghost" onClick={copyLink}
              style={{ padding: "7px 16px", fontSize: 13 }}>
              {copied ? "Link copiato ✓" : "Condividi col compagno di gita"}
            </button>
          </div>
          <p className="note" style={{ marginTop: -6 }}>
            Chi apre il link vede il piano <strong>ricalcolato adesso</strong>, con
            bollettino e meteo aggiornati — mai una copia vecchia.
          </p>
          {result.forecast_notice && (
            <p className="err" role="status">{result.forecast_notice}</p>
          )}

          {result.plan && (
            <div className="panel">
              {result.plan.titolo && <h3>{result.plan.titolo}</h3>}

              {result.plan.allerta_sicurezza && (
                <div className="bulletin blocked">
                  <strong>⚠️ Allerta sicurezza</strong>
                  <div className="why">{result.plan.allerta_sicurezza}</div>
                </div>
              )}

              {result.plan.bollettino_valanghe && (
                <div className="bulletin">
                  <div className="lvl">
                    Bollettino {result.plan.bollettino_valanghe.fonte}
                    {result.plan.bollettino_valanghe.grado_ufficiale != null &&
                      ` · pericolo ${result.plan.bollettino_valanghe.grado_ufficiale}`}
                  </div>
                  {result.plan.bollettino_valanghe.sintesi && (
                    <p className="note">{result.plan.bollettino_valanghe.sintesi}</p>
                  )}
                  {result.plan.bollettino_valanghe.link && (
                    <a
                      className="note"
                      href={result.plan.bollettino_valanghe.link}
                      target="_blank"
                      rel="noopener"
                    >
                      Fonte ufficiale →
                    </a>
                  )}
                </div>
              )}

              {result.plan.itinerario && (
                <p style={{ marginTop: 14 }}>{result.plan.itinerario}</p>
              )}

              {result.plan.timing && (
                <div className="stats">
                  {result.plan.timing.alba && (
                    <div className="stat"><div className="k">Alba</div><div className="v">{result.plan.timing.alba}</div></div>
                  )}
                  {result.plan.timing.partenza_consigliata && (
                    <div className="stat"><div className="k">Partenza</div><div className="v">{result.plan.timing.partenza_consigliata}</div></div>
                  )}
                  {result.plan.timing.vetta_entro && (
                    <div className="stat"><div className="k">Vetta entro</div><div className="v">{result.plan.timing.vetta_entro}</div></div>
                  )}
                  {result.plan.timing.rientro_stimato && (
                    <div className="stat"><div className="k">Rientro</div><div className="v">{result.plan.timing.rientro_stimato}</div></div>
                  )}
                </div>
              )}

              {result.plan.condizioni && (
                <p className="note"><strong>Condizioni:</strong> {result.plan.condizioni}</p>
              )}

              {(result.plan.equipaggiamento_consigliato || []).length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <strong>Equipaggiamento consigliato</strong>
                  <div className="meta">
                    {result.plan.equipaggiamento_consigliato.map((item, i) => (
                      <span className="pill" key={i}>{item}</span>
                    ))}
                  </div>
                </div>
              )}

              {(result.plan.punti_decisionali || []).length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <strong>Punti decisionali</strong>
                  {result.plan.punti_decisionali.map((p, i) => (
                    <p className="note" key={i}>🧭 {p}</p>
                  ))}
                </div>
              )}

              {result.plan.piano_b && (
                <p className="note"><strong>Piano B:</strong> {result.plan.piano_b}</p>
              )}
            </div>
          )}

          {!result.plan && result.plan_text && (
            <div className="panel">
              <p>{result.plan_text}</p>
            </div>
          )}

          {result.plan_model && (
            <p className="note">generato da {result.plan_model}</p>
          )}

          {result.safe_candidates.length > 0 && (
            <div className="panel">
              <strong className="safe">Itinerari sicuri ({result.safe_candidates.length})</strong>
              <div className="grid">
                {result.safe_candidates.map((c) => (
                  <a className="card" key={c.route_id} href={`/routes/${c.route_id}`}>
                    <h3>{c.name}</h3>
                    <div className="meta"><span className="pill">passa i filtri</span></div>
                  </a>
                ))}
              </div>
            </div>
          )}

          {result.blocked.length > 0 && (
            <div className="panel">
              <strong>Esclusi dai filtri di sicurezza ({result.blocked.length})</strong>
              {result.blocked.map((c) => (
                <div className="bulletin blocked" key={c.route_id}>
                  <strong>{c.name}</strong>
                  {c.block_reasons.map((r, i) => (
                    <div className="why" key={i}>⛔ {r}</div>
                  ))}
                </div>
              ))}
              <p className="note">
                L'AI non vede mai questi itinerari, quindi non può proporli.
              </p>
            </div>
          )}
        </>
      )}

      <p className="disclaimer">
        Supporto alla decisione, non raccomandazione. Responsabilità finale al capogita;
        il bollettino ufficiale AINEVA/Meteomont prevale sempre.
      </p>
    </div>
  );
}
