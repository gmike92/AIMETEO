"use client";
// Chrome della mappa — opzione 1a.
//
// Il problema che risolve: oggi MapView ha sei contenitori position:absolute
// indipendenti (.mapctl, .mapctl-left, .mapsubmenu, .maptimeline, .maplegend,
// .daystrip). Non condividono nessun sistema di layout, quindi sotto i ~900px
// si sovrappongono, e i menu a comparsa nascondono la mappa proprio mentre la
// stai leggendo.
//
// 1a tiene la disposizione spaziale attuale ma la ordina in tre gruppi, e
// ciascun gruppo è UN solo elemento posizionato che dentro usa flex/grid
// (regola 1.6: l'absolute è per un elemento appuntato al viewport, mai per
// una fila di elementi):
//
//   .maprail    livelli — rail verticale sempre visibile, niente flyout
//   .mapfields  campi meteo + sfondo — segmented in alto a destra
//   .mapdock    legenda + timeline radar + striscia giorni, un solo flex
//
// Conseguenza diretta della regola 1.7 (i controlli restano visibili):
// useFlyoutMenu, meteoOpen e layersOpen non servono più — sono cancellati,
// non ristilizzati.
//
// Tutti i controlli sono <button> reali con aria-pressed e focus ring
// visibile (regola 1.8), e ogni pezzo degrada da solo: senza legenda, senza
// frame radar o senza striscia giorni il dock semplicemente si accorcia, e
// se non resta niente non viene renderizzato affatto (regola 1.9).

import { Icon } from "@/app/components/WxIcon";
import { DANGER_COLORS, dangerInk } from "@/lib/wx";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ── livelli: cosa è disegnato sulla mappa ─────────────────────────── */
export function MapRail({
  layers = [], ready = true, hidden = false, onMouseEnter, onMouseLeave,
}) {
  if (!layers.length) return null;
  return (
    <div
      className={`maprail ${hidden ? "chrome-hidden" : ""}`}
      role="group" aria-label="Livelli della mappa"
      onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
    >
      {layers.map((l) => {
        const Ico = l.icon || Icon.Layers;
        return (
          <div key={l.key} className="railitem">
            {l.sep && <span className="railsep" aria-hidden />}
            <button
              type="button"
              className={`railbtn ${l.on ? "on" : ""}`}
              onClick={l.toggle}
              aria-pressed={!!l.on}
              disabled={!ready || l.disabled}
              title={l.title}
            >
              <Ico size={19} />
              <span className="rl">{l.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

/* ── campi meteo + sfondo: come è disegnata la mappa ───────────────── */
export function MapFields({
  fields = [], bases = [], base, setBase, ready = true,
  hidden = false, onMouseEnter, onMouseLeave,
}) {
  if (!fields.length && !bases.length) return null;
  return (
    <div
      className={`mapfields ${hidden ? "chrome-hidden" : ""}`}
      onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
    >
      {fields.length > 0 && (
        <div className="segmented" role="group" aria-label="Campi meteo">
          {fields.map((f) => (
            <button
              key={f.key}
              type="button"
              className={`segbtn ${f.on ? `on ${f.variant ? `v-${f.variant}` : ""}` : ""}`}
              onClick={f.toggle}
              aria-pressed={!!f.on}
              disabled={!ready || f.disabled}
              title={f.title}
            >
              {f.label}
              {f.tag && <em className="segtag">{f.tag}</em>}
            </button>
          ))}
        </div>
      )}
      {bases.length > 0 && (
        <div className="segmented" role="group" aria-label="Sfondo della mappa">
          {bases.map((b) => (
            <button
              key={b}
              type="button"
              className={`segbtn ${b === base ? "on light" : ""}`}
              onClick={() => setBase(b)}
              aria-pressed={b === base}
              disabled={!ready}
            >
              {cap(b)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── legenda: le scale attualmente attive ──────────────────────────── */
function Legend({ rows = [], danger = false, note }) {
  if (!rows.length && !danger && !note) return null;
  return (
    <div className="dockpanel dock-legend">
      <div className="dockhead">Scala</div>
      {rows.length > 0 && (
        <div className="legendgrid tnum">
          {rows.map((r) => (
            <div key={r.key} className="legendrow2">
              <span className="legendlabel">{r.label}</span>
              <div>
                <span className="legendbar" style={{ background: r.gradient }} />
                <span className="legendends">
                  <span>{r.min}</span>
                  <span>{r.max}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
      {danger && (
        <>
          <div className="dockhead" style={{ marginTop: 10 }}>Valanghe · EAWS</div>
          <div className="eawsrow tnum">
            {[1, 2, 3, 4, 5].map((d) => (
              <span
                key={d}
                className="eawschip"
                style={{ background: DANGER_COLORS[d], color: dangerInk(d) }}
              >
                {d}
              </span>
            ))}
          </div>
        </>
      )}
      {note && <p className="docknote">{note}</p>}
    </div>
  );
}

/* ── timeline radar: play · scrubber · orario, una sola riga ───────── */
function Timeline({
  frames = [], frameIdx = 0, setFrameIdx, playing, setPlaying,
  frameTime, isForecast, intensity = null,
}) {
  // Senza frame la timeline non esiste: mai una barra vuota disabilitata.
  if (!frames.length) return null;
  // RainViewer non espone un valore di intensità per frame; l'istogramma
  // compare solo se qualcuno lo calcola e lo passa, altrimenti la riga
  // semplicemente non c'è.
  const bars = Array.isArray(intensity) && intensity.length === frames.length ? intensity : null;
  const maxBar = bars ? Math.max(1e-6, ...bars) : 1;

  return (
    <div className="dockpanel dock-timeline">
      <button
        type="button"
        className="dockplay"
        onClick={() => setPlaying(!playing)}
        aria-label={playing ? "Pausa animazione radar" : "Avvia animazione radar"}
      >
        {playing ? <Icon.Pause size={13} /> : <Icon.Play size={13} />}
      </button>
      <div className="scrub">
        {bars && (
          <div className="scrubhist" aria-hidden>
            {bars.map((v, i) => (
              <span
                key={i}
                style={{
                  height: `${Math.max(6, (v / maxBar) * 100)}%`,
                  opacity: i === frameIdx ? 1 : 0.45,
                }}
              />
            ))}
          </div>
        )}
        <input
          type="range"
          min={0}
          max={frames.length - 1}
          value={frameIdx}
          onChange={(e) => setFrameIdx(Number(e.target.value))}
          aria-label="Timeline radar"
        />
      </div>
      {/* Larghezza fissa + tabular-nums: l'orario che scorre non deve mai
          rimpicciolire lo scrubber a ogni cifra che cambia (regola 1.3). */}
      <span className="stamp tnum">
        {frameTime}
        {isForecast ? " · previsto" : ""}
      </span>
    </div>
  );
}

/* ── il dock: i tre pannelli bassi in un solo sistema di layout ────── */
export function MapDock({ legend = null, radar = null, days = null }) {
  const legendEl = legend ? <Legend {...legend} /> : null;
  const timelineEl = radar ? <Timeline {...radar} /> : null;
  const daysEl = days ? <div className="dockpanel dock-days">{days}</div> : null;
  if (!legendEl && !timelineEl && !daysEl) return null;
  return (
    <div className="mapdock">
      {legendEl}
      {timelineEl}
      {daysEl}
    </div>
  );
}

export default MapDock;
