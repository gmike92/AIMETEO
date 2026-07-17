# Ascolto del mercato — luglio 2026

Cosa chiede la gente e di cosa si lamenta nelle app concorrenti.
Fonti: stampa outdoor, forum (Avventurosamente, AlpineZone, community Windy),
recensioni 2026. Aggiorna COMPETITOR_ANALYSIS_2026-07.md.

## 1. Komoot / Bending Spoons — rabbia da abbonamento
- Da feb 2025 i nuovi utenti DEVONO abbonarsi a Premium (€59,99/anno; €4,99/sett
  su mobile) anche solo per sincronizzare le rotte ai dispositivi; i "region
  pack" comprati una volta per sempre non esistono più.
- Pattern Bending Spoons documentato (FTM): acquisizione → licenziamenti →
  rincari. Fiducia della community ai minimi; cercano alternative (HiiKER ecc.).
- **Per noi**: la fiducia è il vuoto da riempire. Prezzi onesti e stabili,
  MAI paywall su funzioni di sicurezza (bollettino, offline, allerte).

## 2. AllTrails — il crowd-sourcing senza filtro fa male
- Dati inaccurati, sentieri chiusi segnati aperti, NESSUNA distinzione tra
  sentiero ufficiale e traccia di bushwhacking; zone diventate hotspot di
  chiamate al soccorso alpino per gitanti mandati fuori dal loro livello.
- **Per noi**: è la conferma del moat. "Verificato da un curatore" vs "5 stelle
  da sconosciuti". Il nostro "da verificare" dichiarato è un pregio, non un
  difetto — comunicarlo così.

## 3. Meteo in montagna — le lamentele specifiche
- I modelli a griglia larga "vedono" il fondovalle a quota sbagliata → temperature
  sistematicamente errate (community Windy). Il nostro downscaling `&elevation=`
  + validazione con stazioni reali risponde ESATTAMENTE a questo.
- Forum italiani (Avventurosamente): il VENTO è l'elemento più toppato e più
  critico in quota; sfiducia in meteo.it/ilmeteo.it; la gente incrocia 3-4 fonti
  (ARPA + meteoblue + Windy + Nimbus).
- Manca il limite pioggia/neve nelle app automatiche (Fatti di Montagna) — noi
  lo abbiamo (zero termico dal profilo): dargli visibilità con quel NOME.
- **Azioni**: (a) aggiungere il VENTO al validate_model (MAE vento vs stazioni);
  (b) etichettare lo zero termico anche come "limite pioggia/neve ~" nelle UI;
  (c) pagina "quanto sbagliamo" pubblica dal VALIDATION_LOG — nessuno la ha.

## 4. Orfani di FATMAP — il lutto continua (2 anni dopo)
- Strava ha chiuso FATMAP (ott 2024) senza migrarne le funzioni; scialpinisti
  ancora arrabbiati. Sostituti frammentati: OUTMAP, OnX (solo Nord America),
  Whympr, PeakVisor. In Italia nessun vincitore chiaro.
- Cosa piangono: 3D invernale, pendenze/esposizioni a colpo d'occhio, layer
  sicurezza. **Per noi**: il layer pendenze >30° in roadmap ha un pubblico già
  pronto e tradito una volta — quando arriva, parlare a loro.

## 5. Wishlist ricorrente 2026 (test di gruppo TGO/OutdoorsMagic/The Trek)
- Offline senza paywall (quasi ovunque è premium) — noi ce l'abbiamo gratis.
- Slope shading + bollettino valanghe DENTRO l'app di navigazione.
- Condizioni reali del sentiero (chiuso? neve residua?) — community + report.
- Semplicità: le app "pro" respingono i principianti; due modalità mentali.
- Batteria: navigazione parca di energia.

## Sintesi per il posizionamento beta
Tre frasi che il mercato sta già chiedendo a gran voce:
1. "Meteo alla TUA quota, e ti diciamo quanto sbagliamo" (nessuno lo fa).
2. "Sentieri verificati da chi li conosce, non votati da chi passava di lì."
3. "Le funzioni di sicurezza non saranno mai a pagamento."

Fonti principali: ftm.eu (Bending Spoons), localsinsider.com (prezzi Komoot),
adamthompsonphoto.com (AllTrails), fattidimontagna.it, avventurosamente.it,
community.windy.com, powder.com + alpinezone.com (FATMAP), thegreatoutdoorsmag.com.
