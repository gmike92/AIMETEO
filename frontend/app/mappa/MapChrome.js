"use client";
// Chrome della mappa — opzione 1b (evoluzione di 1a).
//
// Il problema che risolve 1a: oggi MapView ha sei contenitori
// position:absolute indipendenti. 1a li ordina in tre gruppi (rail, campi,
// dock), ciascuno UN solo elemento posizionato che dentro usa flex/grid
// (regola 1.6).
//
// 1b: rail (livelli/attività) e campi meteo erano sempre espansi — corretto
// per leggibilità, ma due pannelli sempre aperti prendono spazio e non sono
// esteticamente in linea con una navbar/CTA che ora si ritirano da sole.
// Diventano un trigger compatto (FlyoutGroup) che si apre al passaggio del
// mouse su desktop (CSS :hover, gated a `pointer:fine` così il touch non
// eredita hover fantasma) o al tocco/click ovunque — il click da solo resta
// aperto finché non si clicca altrove o di nuovo sul trigger, quindi fa già
// da "pin": niente spillo separato dentro il pannello, sarebbe ridondante.
// Il trigger porta comunque un contatore di quante voci sono accese, così lo
// stato resta leggibile a colpo d'occhio anche chiuso — la ragione originale
// di 1a (regola 1.7) per cui erano sempre espansi.
//
//   .maprail    trigger "Attività" + flyout con i livelli
//   .mapfields  trigger "Meteo" + flyout con i campi, e sfondo mappa sempre
//               visibile accanto (non è un "campo meteo", resta un tap)
//   .maptools   impostazioni, info (ex disclaimer/footer, non più
//               raggiungibili scorrendo: la pagina mappa non scrolla più) e
//               centra-sulla-mia-posizione — stessi trigger compatti, stessa
//               logica di comparsa/posizione di rail e campi
//   .mapdock    legenda + timeline radar + striscia giorni, un solo flex
//
// Tutti i controlli sono <button> reali con aria-pressed e focus ring
// visibile (regola 1.8), e ogni pezzo degrada da solo: senza legenda, senza
// frame radar o senza striscia giorni il dock semplicemente si accorcia, e
// se non resta niente non viene renderizzato affatto (regola 1.9).

import { useEffect, useRef } from "react";
import { Icon } from "@/app/components/WxIcon";
import { DANGER_COLORS, dangerInk } from "@/lib/wx";
import SettingsFields from "@/app/components/SettingsFields";

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ── trigger compatto + pannello a comparsa ─────────────────────────
   Un solo elemento posizionato (className, dal chiamante) che al suo
   interno apre/chiude un pannello: hover su desktop (CSS puro, media
   query pointer:fine), click/tocco ovunque (stato React, funziona anche
   da tastiera perché è un <button> vero) — resta aperto finché non si
   clicca altrove o di nuovo sul trigger.
   Esclusivo tra tutti i FlyoutGroup della mappa: activeFlyout/setActiveFlyout
   arrivano da MapView (un solo stato condiviso, non uno stato locale a
   testa) — className fa da id, sono già tutti diversi (maprail,
   mapfields-flyout, tool-settings, tool-info). Aprirne uno chiude
   automaticamente qualunque altro fosse fissato, invece di sovrapporsi. */
export function FlyoutGroup({
  className, trigger, children, ready = true, hidden = false, compact = false,
  onMouseEnter, onMouseLeave, ariaLabel, title,
  activeFlyout, setActiveFlyout,
}) {
  const open = activeFlyout === className;
  const rootRef = useRef(null);

  // Fuori dal gruppo chiude — su touch non esiste "mouseleave" che lo
  // segnali da solo.
  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) setActiveFlyout(null);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open, setActiveFlyout]);

  return (
    <div
      ref={rootRef}
      className={`flyout ${className} ${open ? "expanded" : ""} ${hidden ? "chrome-hidden" : ""}`}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <button
        type="button"
        className={`flyout-trigger ${compact ? "compact" : ""}`}
        onClick={() => setActiveFlyout(open ? null : className)}
        aria-expanded={open}
        aria-haspopup="true"
        disabled={!ready}
        title={title}
      >
        {trigger}
      </button>
      <div className="flyout-panel" role="group" aria-label={ariaLabel}>
        {children}
      </div>
    </div>
  );
}

/* ── livelli: cosa è disegnato sulla mappa ─────────────────────────── */
export function MapRail({
  layers = [], ready = true, hidden = false, onMouseEnter, onMouseLeave,
  activeFlyout, setActiveFlyout,
}) {
  if (!layers.length) return null;
  const activeCount = layers.filter((l) => l.on && !l.disabled).length;
  return (
    <FlyoutGroup
      className="maprail" ariaLabel="Livelli della mappa"
      ready={ready} hidden={hidden}
      activeFlyout={activeFlyout} setActiveFlyout={setActiveFlyout}
      onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
      trigger={
        <>
          <Icon.Peak size={18} />
          <span className="flyout-label">Attività</span>
          {activeCount > 0 && <em className="flyout-badge">{activeCount}</em>}
        </>
      }
    >
      <div className="flyout-rail">
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
    </FlyoutGroup>
  );
}

/* ── campi meteo + sfondo: come è disegnata la mappa ───────────────── */
export function MapFields({
  fields = [], bases = [], base, setBase, ready = true,
  hidden = false, onMouseEnter, onMouseLeave,
  activeFlyout, setActiveFlyout,
}) {
  if (!fields.length && !bases.length) return null;
  const activeCount = fields.filter((f) => f.on && !f.disabled).length;
  return (
    <div
      className={`mapfields ${hidden ? "chrome-hidden" : ""}`}
      onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
    >
      {/* Sfondo mappa PRIMA del trigger Meteo: il pannello Meteo si apre di
          lato (regola generale, vedi .flyout-panel) ma è più alto di questa
          singola riga, e la fila sfondo è più larga del trigger — se stesse
          sotto, il pannello la coprirebbe comunque nonostante si apra "di
          lato" (le due aree si intersecano lo stesso). Da ultima riga della
          colonna non ha più nulla sotto da coprire. */}
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
      {fields.length > 0 && (
        <FlyoutGroup
          className="mapfields-flyout" ariaLabel="Campi meteo"
          ready={ready}
          activeFlyout={activeFlyout} setActiveFlyout={setActiveFlyout}
          trigger={
            <>
              <Icon.Cloud size={18} />
              <span className="flyout-label">Meteo</span>
              {activeCount > 0 && <em className="flyout-badge">{activeCount}</em>}
            </>
          }
        >
          <div className="segmented segmented-flyout" role="group" aria-label="Campi meteo">
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
        </FlyoutGroup>
      )}
    </div>
  );
}

/* ── strumenti: impostazioni, info, centra sulla mia posizione ──────
   Stessa logica di movimento di rail e campi meteo (stesso useAutoHide,
   stesso :has() per salire/scendere con la navbar — vedi globals.css),
   ma pulsanti compatti solo-icona: sono controlli secondari, non hanno
   bisogno del peso visivo di un'etichetta come Attività/Meteo. */
export function MapTools({
  ready = true, hidden = false, onMouseEnter, onMouseLeave,
  onLocate, locating = false, infoContent,
  activeFlyout, setActiveFlyout,
}) {
  return (
    <div
      className={`maptools ${hidden ? "chrome-hidden" : ""}`}
      onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
    >
      {/* Pannello sovrapposto alla mappa, non un link a /impostazioni —
          quella pagina resta per chi ci arriva da altre pagine, ma sulla
          mappa una navigazione via pagina interromperebbe la vista. Stesso
          SettingsFields, stesso stato (SettingsProvider): nessun testo o
          logica duplicati tra le due. */}
      <FlyoutGroup
        className="tool-settings" ariaLabel="Impostazioni" compact
        ready={ready} title="Impostazioni"
        activeFlyout={activeFlyout} setActiveFlyout={setActiveFlyout}
        trigger={<Icon.Settings size={17} />}
      >
        <div className="tool-panel">
          <SettingsFields compact />
        </div>
      </FlyoutGroup>
      <FlyoutGroup
        className="tool-info" ariaLabel="Informazioni" compact
        ready={ready} title="Info"
        activeFlyout={activeFlyout} setActiveFlyout={setActiveFlyout}
        trigger={<Icon.Info size={17} />}
      >
        <div className="tool-panel tool-panel-info">{infoContent}</div>
      </FlyoutGroup>
      <button
        type="button"
        className="flyout-trigger compact"
        onClick={onLocate}
        disabled={!ready || locating}
        title="Centra sulla mia posizione"
        aria-label="Centra sulla mia posizione"
      >
        <Icon.Crosshair size={17} />
      </button>
    </div>
  );
}

/* ── legenda: le scale attualmente attive ──────────────────────────── */
function Legend({ rows = [], danger = false, note }) {
  if (!rows.length && !danger && !note) return null;
  return (
    <div className="dockpanel dock-legend">
      {rows.length > 0 && (
        <div className="legendgrid tnum">
          {rows.map((r) => (
            <div key={r.key} className="legendrow2">
              <span className="legendlabel">{r.label}</span>
              <span className="legendbar" style={{ background: r.gradient }} />
              <span className="legendends">
                <span>{r.min}</span>
                <span>{r.max}</span>
              </span>
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
      {daysEl}
      {legendEl}
      {timelineEl}
    </div>
  );
}

export default MapDock;
