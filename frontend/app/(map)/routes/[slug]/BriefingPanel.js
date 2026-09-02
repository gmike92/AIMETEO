"use client";
import { useState } from "react";
import { api } from "@/lib/api";

// Interactive part of the route detail page: the "genera relazione" button
// stays a client component while the rest of the page is server-rendered.
export default function BriefingPanel({ slug }) {
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const genBriefing = async () => {
    setLoading(true);
    setError(null);
    try {
      setBriefing(await api.briefing(slug));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2>Relazione AI</h2>
      <button className="btn" onClick={genBriefing} disabled={loading}>
        {loading ? "Genero…" : "Genera relazione di gita"}
      </button>
      {error && <p className="err">{error}</p>}

      {briefing && (
        <div className="panel">
          <p>{briefing.text}</p>
          {briefing.bulletin ? (
            <div className="bulletin">
              <div className="lvl">
                Bollettino {briefing.bulletin.avalanche_service}: pericolo {briefing.bulletin.danger_level}/5
              </div>
              <p className="note">{briefing.bulletin.raw_text}</p>
              <a className="note" href={briefing.bulletin.source_url} target="_blank" rel="noopener">
                Fonte ufficiale →
              </a>
            </div>
          ) : null}
          <p className="note">Generato da {briefing.model}</p>
        </div>
      )}
    </div>
  );
}
