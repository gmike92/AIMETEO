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
import { useT } from "@/lib/i18n";

const ACTIVITIES = [
  ["scialpinismo", "act.scialpinismo"],
  ["alpinismo", "act.alpinismo"],
  ["arrampicata", "act.arrampicata"],
  ["via_ferrata", "act.via_ferrata"],
  ["escursionismo", "act.escursionismo"],
  ["trail_running", "act.trail_running"],
  ["mtb_alpino", "act.mtb_alpino"],
  ["volo_libero", "act.volo_libero"],
];

export default function Planner() {
  const t = useT();
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
          <span className="eyebrow">{t("planner.eyebrow")}</span>
          <h1>{t("planner.h1_a")} <em>{t("planner.h1_em")}</em></h1>
          <p className="sub">{t("planner.sub")}</p>

          <form onSubmit={run}>
            <label htmlFor="intent">{t("planner.label_intent")}</label>
            <textarea
              id="intent"
              rows={3}
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
            />

            {/* Il <select> diventa una fila di chip: risolve anche il popup
                nativo bianco che andava corretto con select option{…}. */}
            <label id="act-label">{t("planner.label_activity")}</label>
            <div className="chips" role="group" aria-labelledby="act-label">
              {ACTIVITIES.map(([val, key]) => (
                <button
                  key={val}
                  type="button"
                  className={`chip ${activity === val ? "on" : ""}`}
                  aria-pressed={activity === val}
                  onClick={() => setActivity(val)}
                >
                  {t(key)}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 9 }}>
              <button className="btn" type="submit" disabled={loading}>
                {loading ? t("planner.submitting") : t("planner.submit")}
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={copyLink}
                style={{ padding: "10px 16px", fontSize: 13 }}
              >
                {copied ? t("planner.shared") : t("planner.share")}
              </button>
            </div>
          </form>

          <p className="note" style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
            {t("planner.share_note")}
          </p>
        </div>

        <div className="out">
          {error && <p className="err">{t("common.error_prefix")}: {error}</p>}
          {!result && !error && !loading && (
            <p className="note">{t("planner.placeholder")}</p>
          )}
          {loading && <p className="loading">{t("planner.submitting")}</p>}

          {result && (
            <div className="plan-filterbar">
              <Icon.Check size={15} />
              {result.safe_candidates.length} · {t("planner.safe_col").toLowerCase()}
              <em>{result.blocked.length} · {t("planner.blocked_col").toLowerCase()}</em>
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
                    <Icon.Warning size={15} /> {t("planner.safety_alert")}
                  </strong>
                  <div className="why">{plan.allerta_sicurezza}</div>
                </div>
              )}

              {plan.bollettino_valanghe && (
                <div className="bulletin">
                  <div className="lvl tnum">
                    Bollettino {plan.bollettino_valanghe.fonte}
                    {plan.bollettino_valanghe.grado_ufficiale != null &&
                      ` · ${plan.bollettino_valanghe.grado_ufficiale}`}
                  </div>
                  {plan.bollettino_valanghe.sintesi && (
                    <p className="note">{plan.bollettino_valanghe.sintesi}</p>
                  )}
                  {plan.bollettino_valanghe.link && (
                    <a className="note" href={plan.bollettino_valanghe.link}
                      target="_blank" rel="noopener">
                      {t("planner.official_source")}
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
                    <div className="stat"><div className="k">Partenza</div><div className="v" style={{ color: "var(--accent-text)" }}>{plan.timing.partenza_consigliata}</div></div>
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
                  <div className="dockhead" style={{ marginBottom: 9 }}>{t("planner.decision_points")}</div>
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
                  <div className="dockhead" style={{ marginBottom: 9 }}>{t("planner.gear")}</div>
                  <div className="meta">
                    {plan.equipaggiamento_consigliato.map((item, i) => (
                      <span className="pill" key={i}>{item}</span>
                    ))}
                  </div>
                </div>
              )}

              {plan.piano_b && (
                <p className="note" style={{ marginTop: 16 }}>
                  <strong>{t("planner.plan_b")}</strong> {plan.piano_b}
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
                <div className="dockhead">{t("planner.safe_col")} · {result.safe_candidates.length}</div>
                {result.safe_candidates.length === 0 && (
                  <p className="note" style={{ margin: 0 }}>{t("planner.safe_empty")}</p>
                )}
                {result.safe_candidates.map((c) => (
                  <div className="plan-row" key={c.route_id}>
                    <a className="nm" href={`/routes/${c.route_id}`}>{c.name}</a>
                  </div>
                ))}
              </div>

              <div className="plan-col no">
                <div className="dockhead">{t("planner.blocked_col")} · {result.blocked.length}</div>
                {result.blocked.length === 0 && (
                  <p className="note" style={{ margin: 0 }}>{t("planner.blocked_empty")}</p>
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
                  {t("planner.blocked_note")}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <p className="disclaimer">{t("planner.disclaimer")}</p>
    </div>
  );
}
