// "La finestra migliore della settimana" — server component.
// Punteggio 0-100 per giorno alla quota della vetta + finestra oraria
// consigliata. Fail-safe: endpoint giù → la card semplicemente non appare.
import { serverFetch } from "@/lib/api";
import { scoreColor } from "@/lib/wx";
import { WxIcon } from "@/app/components/WxIcon";

function dayLabel(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("it-IT", {
    weekday: "short", day: "numeric", month: "short",
  });
}

export default async function BestWindowCard({ slug }) {
  let fw = null;
  try {
    fw = await serverFetch(`/routes/${encodeURIComponent(slug)}/finestra`, {
      revalidate: 900,
    });
  } catch {
    return null; // niente dati → niente finestra inventata
  }
  if (!fw) return null;
  const demo = fw.source === "mock";

  return (
    <div className="panel">
      <span className="eyebrow">finestra migliore della settimana</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginTop: 10, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 22, letterSpacing: "-.4px" }}>
          {dayLabel(fw.giorno)} · {fw.dalle}–{fw.alle}
        </strong>
        <span className="pill" style={{ color: scoreColor(fw.punteggio), borderColor: "currentColor" }}>
          {fw.punteggio}/100
        </span>
      </div>
      <p className="note">{fw.motivi.join(" · ")}</p>

      <div className="stats tnum" style={{ marginBottom: 0 }}>
        {fw.giorni.map((g) => {
          const best = g.data === fw.giorno;
          return (
            <div className="stat" key={g.data}
              style={best ? { outline: "1px solid var(--accent)", outlineOffset: -1 } : undefined}>
              <div className="k">{dayLabel(g.data)}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "var(--muted)" }}>
                  <WxIcon precip_mm={g.precip_mm} nuvole_pct={g.nuvole_pct}
                    neve={g.zero_termico_sotto_vetta} size={20} />
                </span>
                <span className="v" style={{ color: scoreColor(g.punteggio) }}>
                  {g.punteggio}
                </span>
              </div>
              <div className="k" style={{ textTransform: "none", letterSpacing: 0 }}>
                {Math.round(g.temp_min_c)}°/{Math.round(g.temp_max_c)}° ·{" "}
                {g.precip_mm > 0 ? `${g.precip_mm} mm` : "asciutto"} · {g.vento_max_kmh} km/h
              </div>
            </div>
          );
        })}
      </div>
      <p className="note" style={{ opacity: 0.75 }}>
        Punteggio 0–100 a quota {fw.quota_riferimento_m} m: precipitazioni, vento,
        nuvole, freddo e zero termico. Fonte: {fw.source}
        {demo ? " (dati dimostrativi)" : ""}.
      </p>
    </div>
  );
}
