# Guida di redesign frontend — Zerotermico

> Documento di lavoro da seguire per migliorare il frontend. Scritto leggendo il
> codice reale (`frontend/app/globals.css`, componenti, `branding/BRAND_ZEROTERMICO.md`),
> non da screenshot — vedi §0 prima di iniziare.

## 0. Prima di applicare qualunque modifica

Questo documento nasce da un'analisi del **codice**, non da una revisione visiva
in browser. Il progetto ha già un design system maturo con regole esplicite
codificate nei commenti (`regola 1.2`, `1.3`, `1.4`, ... sparse in
`globals.css` e nei componenti — niente emoji, colore del grado su
bordo/testo mai come riempimento, hairline invece di box annidati, quattro
stati per elemento interattivo, ecc.). **Non violare queste regole per
"migliorare" qualcosa** — sono decisioni già prese e motivate, spesso dopo
un problema reale (vedi i commenti che le accompagnano). Se un punto qui
sotto sembra in conflitto con una regola esistente, la regola vince: rileggi
il commento nel file citato prima di procedere.

Prima di partire su un punto: aprire l'app (`npm run dev` in `frontend/`),
verificarlo a schermo nei 4 temi (`dark`, `light`, `bosco`, `mare`) e almeno
in viewport mobile — molti dei punti sotto sono verificabili nel codice ma
il giudizio finale ("è davvero un problema?") va confermato a video.

## 1. Sintesi — priorità

1. **Il profilo altimetrico non usa il gradiente di quota descritto nel brand.**
   `branding/BRAND_ZEROTERMICO.md` §4 definisce il "gradiente di quota"
   (ambra bassa quota → ciano → ghiaccio) come *il* tratto visivo distintivo,
   da applicare a "sparkline card, profilo rotta, barra del punteggio giorni,
   sfondo hero". Nel codice reale, sia `RouteCard.js` (`Profile`, righe
   99–137) sia `ConditionsTable.js` (`MiniProfile`, righe 59–77) disegnano il
   profilo con un singolo colore fisso (`var(--accent)`). È il gap più grande
   tra intenzione di brand e implementazione — e il più ad alto impatto
   visivo, perché compare su ogni card itinerario.
2. **Checklist di brand non completata.** `BRAND_ZEROTERMICO.md` §7 elenca
   passi non ancora fatti: monogramma SVG `0°` (sostituisce il logo
   triangolare attuale in `SiteNav.js:56`, `<img src="/logo.png">`), wordmark
   con `°` al posto del trattino, favicon `0°`. Verificare `public/logo.png`,
   `public/favicon.ico`, `public/icon-*.png` contro questa lista.
3. **Coerenza dei pattern di selezione.** Il repo ha *tre* pattern diversi
   per "scegli un'opzione tra poche": `chip` (bottoni pillola, es.
   `ChipGroup` in `SettingsFields.js`), `settings-tab` (segmented control,
   introdotto di recente — vedi commit `b0f1842`), e i link di navigazione
   in `SiteNav.js` (sottolineatura/`navactive`). Sono scelte consapevoli
   (il commento a `TabBar` in `SettingsFields.js:62-66` spiega perché il
   segmented control non è un chip: "le categorie non sono un'altra opzione
   da impostare, sono una navigazione tra gruppi") — ma vale la pena
   verificare che ogni nuova UI scelga il pattern giusto in base a questa
   stessa distinzione, non per abitudine.
4. **`ConditionsTable` è una tabella larga (7 colonne) in un'app mobile-first.**
   Ha già uno scroll orizzontale dedicato (`.ctable-scroll`), quindi il
   problema non è mancante — ma è il candidato più a rischio per densità
   informativa su schermi piccoli: verificare a video se le colonne meno
   critiche (`c-prof`, `c-frz`) restano leggibili sotto ~380px o se serve un
   sottoinsieme di colonne per mobile.
5. **Stato "verificato/da verificare"** (`rcard-foot .ok`/`.todo` in
   `RouteCard.js:200-203`, `verified_at == null` in `CragList.js:72-74`) è
   un tratto di fiducia importante per l'app (vedi la voce del brand
   sull'onestà del dato, §5: "il dubbio sempre esplicito"). Controllare che
   sia visivamente coerente ovunque compaia (card griglia, riga elenco,
   dettaglio) e mai meno visibile della card stessa.

## 2. Per componente/pagina

### `frontend/app/components/RouteCard.js` — `Profile` (righe 54–137)
- Sostituire il singolo `stroke="var(--accent)"` / gradiente fisso
  (`linearGradient` righe 107-111) con il gradiente di quota per-punto
  (colore che varia lungo la linea in base alla quota `e`, non un solo
  colore per tutta la traccia). Serve una piccola scala colore
  quota→tinta (bassa quota ambra, media ciano, alta ghiaccio) — se non
  esiste già, va definita come nuovo set di token (vedi §3) prima di
  toccare questo file.
- La riga tratteggiata dello zero termico (`--accent2`, riga 125) resta
  com'è: è un dato diverso (linea di riferimento, non il profilo) e deve
  restare visivamente distinta dal gradiente, non assorbita da esso.

### `frontend/app/components/ConditionsTable.js` — `MiniProfile` (righe 59–77)
- Stessa applicazione del gradiente di quota, versione ridotta (96×26px).
  A quella scala il gradiente potrebbe non leggersi — verificare a video se
  vale la pena o se lì conviene lasciare il colore fisso per leggibilità;
  non applicare per coerenza automatica se peggiora la lettura a dimensione
  ridotta.

### `frontend/app/components/SiteNav.js`
- Logo: quando la §7 del brand doc viene eseguita (monogramma SVG), questo
  file (riga 56) è l'unico punto che referenzia `/logo.png` nella navbar —
  aggiornare qui e verificare `manifest.js` / icone PWA in `public/`
  separatamente (non derivano dallo stesso file).
- Wordmark riga 57: `zero<span>°termico</span>` — già bicolore come da
  brand doc §1 ("Zero|termico bicolore funziona già"); il brand doc
  suggerisce l'evoluzione al `°` come carattere condiviso — bassa priorità,
  puramente tipografica.

### `frontend/app/components/SettingsFields.js`
- Pattern già solido (tab per categoria, matrice a doppia colonna per le
  attività, color picker con selezione + swatch). Nessuna modifica
  strutturale suggerita qui — usare questo file come riferimento di
  pattern quando si disegna altra UI a scelte multiple nel resto dell'app,
  non il contrario.

### `frontend/app/components/CragList.js`
- Corretto rispetto alle regole esistenti (niente emoji bandiera, chip
  ISO2 monospace deterministico — righe 8-10). Unico punto da verificare a
  video: la riga `finestre_sole` (multi-intervallo orario, righe 59-68) su
  falesie con più finestre di sole in un giorno può diventare una riga di
  testo lunga nella card griglia — controllare wrapping su mobile.

## 3. Nuovi token da valutare (in `frontend/app/globals.css`)

**Non aggiungere questi senza conferma**: cambiano il linguaggio visivo,
non sono una correzione, sono una decisione di prodotto che il brand doc
lascia aperta.

- Scala colore "gradiente di quota" (3+ stop: bassa quota, media, alta) —
  necessaria per il punto §1.1. Deve avere una variante per ciascuno dei 4
  temi (`dark`/`light`/`bosco`/`mare`), come già fanno `--marker-*` — stessa
  struttura, sezione dedicata vicino a `--marker-home` ecc. (righe 41-44).
- Se il monogramma `0°` diventa un asset SVG inline (non un PNG), valutare
  se serve un token colore dedicato o se riusa `--accent`/`--ink` esistenti
  — probabilmente riusa, da confermare quando l'SVG esiste.

## 4. Sequenza consigliata

1. Verificare a video (4 temi × mobile/desktop) i punti in §1 prima di
   scrivere codice — questo documento è un punto di partenza, non un
   verdetto finale.
2. Gradiente di quota (§1.1, §2 RouteCard) — impatto visivo più alto,
   tocca un solo file di logica (`Profile` in `RouteCard.js`) + i nuovi
   token in `globals.css`.
3. Checklist brand (§1.2) — logo/favicon, indipendente dal resto, si può
   fare in parallelo.
4. Estendere il gradiente a `ConditionsTable` (§2) — solo dopo aver visto
   il risultato su `RouteCard` a schermo, per decidere se scala bene.
5. Revisione coerenza pattern (§1.3) e densità `ConditionsTable` su mobile
   (§1.4) — richiedono più giudizio visivo, meglio farle a mente fresca
   dopo i punti sopra, non in fretta insieme ad essi.
