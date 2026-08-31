
## Run 2026-07-11 14:47 UTC
Stazioni: 8 (Alto Adige, open data provincia BZ). MAE modello: **2.24 °C** · MAE baseline om-2m: **1.18 °C**

| stazione | quota | osservata | modello | err | om-2m | err |
|---|---|---|---|---|---|---|
| Anticima Cima Libera | 3399 m | 7.1° | 5.3° | -1.8° | 7.2° | +0.1° |
| Solda Cima Beltovo | 3328 m | 8.2° | 7.8° | -0.4° | 10.7° | +2.5° |
| Ultimo Cima di Fontana Bianca | 3253 m | 11.7° | 8.4° | -3.3° | 11.7° | +0.0° |
| Senales Croda d. Cornacchie | 3220 m | 9.9° | 8.7° | -1.2° | 12.3° | +2.4° |
| Predoi Pizzo Lungo | 3105 m | 10.3° | 7.2° | -3.1° | 11.6° | +1.3° |
| Senales Teufelsegg | 3035 m | 11.3° | 8.7° | -2.6° | 11.6° | +0.3° |
| Badia Cima Pisciadù | 2985 m | 12.0° | 9.0° | -3.0° | 13.1° | +1.1° |
| Curon Cima Undici | 2926 m | 12.2° | 9.7° | -2.5° | 13.9° | +1.7° |

## Analisi run 2026-07-11 (~14:00 locale, estate, cielo variabile)

**MAE: modello-profilo 2.24 °C · baseline om-2m 1.18 °C → baseline vince.**
Struttura dell'errore: il profilo è freddo su TUTTE e 8 le stazioni (bias
−0.4…−3.3°). Interpretazione fisica: a mezzogiorno d'estate le stazioni di
vetta leggono lo strato superficiale surriscaldato dalla roccia al sole
(disaccoppiato dall'atmosfera libera); il profilo puro lo ignora per
costruzione, il 2m del modello lo cattura con la sua fisica di superficie.

**Decisione (Modello v0.1):** T puntuale → om-2m downscalata alla quota reale
(`&elevation=`); il profilo resta autorità per zero termico, inversioni e
struttura verticale; il solare per il warming per versante. Il profilo va
ri-testato di notte e in inverno (inversioni): atteso il quadro opposto —
continuare ad accumulare run a ore diverse prima di verdetti stagionali.

## Run 2026-07-13 05:46 UTC
Stazioni: 6 (Alto Adige, open data provincia BZ). MAE modello: **1.18 °C** · MAE baseline om-2m: **1.22 °C**

| stazione | quota | osservata | modello | err | om-2m | err |
|---|---|---|---|---|---|---|
| Anticima Cima Libera | 3399 m | 5.9° | 6.7° | +0.8° | 5.8° | -0.1° |
| Solda Cima Beltovo | 3328 m | 4.9° | 6.3° | +1.4° | 6.6° | +1.7° |
| Ultimo Cima di Fontana Bianca | 3253 m | 6.4° | 6.9° | +0.5° | 7.4° | +1.0° |
| Senales Croda d. Cornacchie | 3220 m | 7.3° | 7.3° | -0.0° | 8.6° | +1.3° |
| Predoi Pizzo Lungo | 3105 m | 4.8° | 7.4° | +2.6° | 6.7° | +1.9° |
| Senales Teufelsegg | 3035 m | 6.8° | 8.6° | +1.8° | 8.1° | +1.3° |

## Run 2026-07-16 12:20 UTC
Stazioni: 6 (Alto Adige, open data provincia BZ). MAE modello: **1.50 °C** · MAE baseline om-2m: **2.05 °C**

| stazione | quota | osservata | modello | err | om-2m | err |
|---|---|---|---|---|---|---|
| Anticima Cima Libera | 3399 m | 7.1° | 6.8° | -0.3° | 9.2° | +2.1° |
| Solda Cima Beltovo | 3328 m | 8.0° | 7.6° | -0.4° | 10.7° | +2.7° |
| Ultimo Cima di Fontana Bianca | 3253 m | 10.6° | 8.5° | -2.1° | 12.3° | +1.7° |
| Senales Croda d. Cornacchie | 3220 m | 10.3° | 8.1° | -2.2° | 12.4° | +2.1° |
| Predoi Pizzo Lungo | 3105 m | 8.9° | 7.4° | -1.5° | 11.9° | +3.0° |
| Senales Teufelsegg | 3035 m | 11.0° | 8.5° | -2.5° | 11.7° | +0.7° |

## Run 2026-07-17 02:15 UTC
Stazioni: 8 (Alto Adige, open data provincia BZ). MAE modello: **0.42 °C** · MAE baseline om-2m: **0.53 °C** · MAE vento: **7.4 km/h** (7 staz.)

| stazione | quota | osservata | modello | err | om-2m | err | vento oss | vento om | err |
|---|---|---|---|---|---|---|---|---|---|
| Anticima Cima Libera | 3399 m | 4.6° | 6.0° | +1.4° | 5.1° | +0.5° | 21 km/h | 8 km/h | -12 |
| Solda Cima Beltovo | 3328 m | 6.0° | 6.1° | +0.1° | 6.3° | +0.3° | 19 km/h | 14 km/h | -6 |
| Ultimo Cima di Fontana Bianca | 3253 m | 7.3° | 7.3° | +0.0° | 6.8° | -0.5° | 14 km/h | 8 km/h | -6 |
| Senales Croda d. Cornacchie | 3220 m | 6.6° | 6.3° | -0.3° | 7.1° | +0.5° | 3 km/h | 10 km/h | +7 |
| Predoi Pizzo Lungo | 3105 m | 5.4° | 6.5° | +1.1° | 6.9° | +1.5° | 24 km/h | 8 km/h | -16 |
| Senales Teufelsegg | 3035 m | 7.3° | 7.2° | -0.1° | 7.2° | -0.1° | n.d. | 12 km/h | n.d. |
| Badia Cima Pisciadù | 2985 m | 8.7° | 8.3° | -0.4° | 9.2° | +0.5° | 14 km/h | 10 km/h | -4 |
| Curon Cima Undici | 2926 m | 8.0° | 8.0° | -0.0° | 7.7° | -0.3° | 6 km/h | 8 km/h | +1 |

## Analisi run 2026-07-17 (~04:15 locale, notte, estate)

**T: profilo 0.42 °C batte baseline 0.53 °C — quadro OPPOSTO al mezzogiorno**
(run 2026-07-11: 2.24 vs 1.18). Conferma sperimentale della fisica alla base
della ripartizione v0.1: di notte lo strato superficiale si riaccoppia
all'atmosfera libera e il profilo verticale è l'autorità; di giorno vince il
2m con la sua fisica di superficie. Due run, due regimi, entrambi coerenti
con l'ipotesi → la ripartizione giorno/notte per la T puntuale è un candidato
upgrade v0.2 (oggi usiamo sempre om-2m per la T puntuale live).

**Vento: MAE 7.4 km/h con struttura chiara — sottostima sulle cime ventose**
(Cima Libera oss 21 → om 8, err −12; Pizzo Lungo oss 24 → om 8, err −16;
quasi tutti gli errori negativi). È la conferma quantitativa della lamentela
più diffusa nei forum ("il vento è l'elemento più toppato"). Ipotesi: il grid
non vede l'esposizione delle creste. Direzione futura: fattore di correzione
per esposizione/prominenza del punto (mai spacciare il vento grid per vento
di cresta senza dirlo). Continuare ad accumulare: servono run ventose vere.

## Run 2026-07-20 05:48 UTC
Stazioni: 5 (Alto Adige, open data provincia BZ). MAE modello: **0.84 °C** · MAE baseline om-2m: **0.88 °C**

| stazione | quota | osservata | modello | err | om-2m | err |
|---|---|---|---|---|---|---|
| Ultimo Cima di Fontana Bianca | 3253 m | 2.9° | 2.6° | -0.3° | 3.5° | +0.6° |
| Senales Croda d. Cornacchie | 3220 m | 2.8° | 1.6° | -1.2° | 3.4° | +0.6° |
| Predoi Pizzo Lungo | 3105 m | 2.4° | 1.6° | -0.8° | 2.7° | +0.3° |
| Senales Teufelsegg | 3035 m | 3.8° | 2.1° | -1.7° | 2.4° | -1.4° |
| Badia Cima Pisciadù | 2985 m | 4.2° | 4.0° | -0.2° | 5.7° | +1.5° |

## Run 2026-07-23 12:23 UTC
Stazioni: 6 (Alto Adige, open data provincia BZ). MAE modello: **1.18 °C** · MAE baseline om-2m: **2.47 °C**

| stazione | quota | osservata | modello | err | om-2m | err |
|---|---|---|---|---|---|---|
| Anticima Cima Libera | 3399 m | 1.6° | 0.2° | -1.4° | 2.8° | +1.2° |
| Solda Cima Beltovo | 3328 m | 1.8° | 1.8° | -0.0° | 5.1° | +3.3° |
| Ultimo Cima di Fontana Bianca | 3253 m | 4.4° | 2.7° | -1.7° | 7.1° | +2.7° |
| Senales Croda d. Cornacchie | 3220 m | 2.4° | 2.2° | -0.2° | 6.4° | +4.0° |
| Predoi Pizzo Lungo | 3105 m | 2.2° | 0.6° | -1.6° | 5.2° | +3.0° |
| Senales Teufelsegg | 3035 m | 4.7° | 2.5° | -2.2° | 5.3° | +0.6° |

## Run 2026-07-27 05:58 UTC
Stazioni: 6 (Alto Adige, open data provincia BZ). MAE modello: **0.58 °C** · MAE baseline om-2m: **0.95 °C** · MAE vento: **5.4 km/h** (5 staz.)

| stazione | quota | osservata | modello | err | om-2m | err | vento oss | vento om | err |
|---|---|---|---|---|---|---|---|---|---|
| Anticima Cima Libera | 3399 m | 0.2° | 0.9° | +0.7° | 1.0° | +0.8° | 22 km/h | 22 km/h | +0 |
| Solda Cima Beltovo | 3328 m | 0.4° | 1.2° | +0.8° | 1.5° | +1.1° | 28 km/h | 19 km/h | -9 |
| Ultimo Cima di Fontana Bianca | 3253 m | 2.0° | 2.1° | +0.1° | 2.9° | +0.9° | 13 km/h | 22 km/h | +9 |
| Senales Croda d. Cornacchie | 3220 m | 2.4° | 1.9° | -0.5° | 2.9° | +0.5° | 22 km/h | 14 km/h | -8 |
| Predoi Pizzo Lungo | 3105 m | 1.8° | 1.8° | +0.0° | 3.1° | +1.3° | 15 km/h | 14 km/h | -1 |
| Senales Teufelsegg | 3035 m | 3.6° | 2.2° | -1.4° | 2.5° | -1.1° | n.d. | 24 km/h | n.d. |

## Run 2026-07-30 12:28 UTC
Stazioni: 5 (Alto Adige, open data provincia BZ). MAE modello: **2.74 °C** · MAE baseline om-2m: **1.14 °C** · MAE vento: **7.8 km/h** (5 staz.)

| stazione | quota | osservata | modello | err | om-2m | err | vento oss | vento om | err |
|---|---|---|---|---|---|---|---|---|---|
| Anticima Cima Libera | 3399 m | 9.3° | 7.9° | -1.4° | 10.5° | +1.2° | 9 km/h | 18 km/h | +10 |
| Solda Cima Beltovo | 3328 m | 12.1° | 9.7° | -2.4° | 12.7° | +0.6° | 8 km/h | 10 km/h | +2 |
| Ultimo Cima di Fontana Bianca | 3253 m | 12.1° | 9.4° | -2.7° | 13.1° | +1.0° | 5 km/h | 3 km/h | -3 |
| Senales Croda d. Cornacchie | 3220 m | 13.4° | 9.6° | -3.8° | 14.4° | +1.0° | 3 km/h | 16 km/h | +14 |
| Predoi Pizzo Lungo | 3105 m | 13.4° | 10.0° | -3.4° | 15.3° | +1.9° | 6 km/h | 17 km/h | +10 |

## Run 2026-08-03 05:51 UTC
Stazioni: 5 (Alto Adige, open data provincia BZ). MAE modello: **0.60 °C** · MAE baseline om-2m: **0.84 °C** · MAE vento: **9.8 km/h** (5 staz.)

| stazione | quota | osservata | modello | err | om-2m | err | vento oss | vento om | err |
|---|---|---|---|---|---|---|---|---|---|
| Anticima Cima Libera | 3399 m | 6.3° | 7.3° | +1.0° | 6.7° | +0.4° | 14 km/h | 5 km/h | -9 |
| Solda Cima Beltovo | 3328 m | 6.2° | 6.9° | +0.7° | 6.8° | +0.6° | 12 km/h | 4 km/h | -8 |
| Ultimo Cima di Fontana Bianca | 3253 m | 7.3° | 7.4° | +0.1° | 8.0° | +0.7° | 7 km/h | 3 km/h | -4 |
| Senales Croda d. Cornacchie | 3220 m | 7.2° | 7.7° | +0.5° | 8.6° | +1.4° | 17 km/h | 3 km/h | -14 |
| Predoi Pizzo Lungo | 3105 m | 7.0° | 7.7° | +0.7° | 8.1° | +1.1° | 18 km/h | 4 km/h | -14 |

## Run 2026-08-06 12:55 UTC
Stazioni: 5 (Alto Adige, open data provincia BZ). MAE modello: **2.12 °C** · MAE baseline om-2m: **1.06 °C** · MAE vento: **7.4 km/h** (5 staz.)

| stazione | quota | osservata | modello | err | om-2m | err | vento oss | vento om | err |
|---|---|---|---|---|---|---|---|---|---|
| Anticima Cima Libera | 3399 m | 7.9° | 6.9° | -1.0° | 7.8° | -0.1° | 12 km/h | 12 km/h | +0 |
| Solda Cima Beltovo | 3328 m | 10.3° | 8.7° | -1.6° | 11.2° | +0.9° | 9 km/h | 22 km/h | +13 |
| Ultimo Cima di Fontana Bianca | 3253 m | 9.5° | 8.4° | -1.1° | 10.9° | +1.4° | 10 km/h | 16 km/h | +5 |
| Senales Croda d. Cornacchie | 3220 m | 10.7° | 7.9° | -2.8° | 12.3° | +1.6° | 9 km/h | 16 km/h | +7 |
| Predoi Pizzo Lungo | 3105 m | 13.3° | 9.2° | -4.1° | 14.6° | +1.3° | 4 km/h | 17 km/h | +12 |

## Run 2026-08-10 04:03 UTC
Stazioni: 6 (Alto Adige, open data provincia BZ). MAE modello: **0.87 °C** · MAE baseline om-2m: **0.58 °C** · MAE vento: **6.3 km/h** (6 staz.)

| stazione | quota | osservata | modello | err | om-2m | err | vento oss | vento om | err |
|---|---|---|---|---|---|---|---|---|---|
| Anticima Cima Libera | 3399 m | 4.3° | 5.4° | +1.1° | 4.5° | +0.2° | 21 km/h | 7 km/h | -14 |
| Solda Cima Beltovo | 3328 m | 4.7° | 6.3° | +1.6° | 6.1° | +1.4° | 17 km/h | 7 km/h | -11 |
| Ultimo Cima di Fontana Bianca | 3253 m | 6.3° | 6.8° | +0.5° | 6.2° | -0.1° | 6 km/h | 5 km/h | -2 |
| Senales Croda d. Cornacchie | 3220 m | 6.3° | 7.0° | +0.7° | 6.8° | +0.5° | 9 km/h | 8 km/h | -1 |
| Predoi Pizzo Lungo | 3105 m | 6.6° | 7.3° | +0.7° | 6.7° | +0.1° | 14 km/h | 6 km/h | -8 |
| Curon Cima Undici | 2926 m | 7.9° | 8.5° | +0.6° | 6.7° | -1.2° | 8 km/h | 6 km/h | -2 |

## Run 2026-08-13 11:43 UTC
Stazioni: 7 (Alto Adige, open data provincia BZ). MAE modello: **2.40 °C** · MAE baseline om-2m: **2.24 °C** · MAE vento: **7.7 km/h** (6 staz.)

| stazione | quota | osservata | modello | err | om-2m | err | vento oss | vento om | err |
|---|---|---|---|---|---|---|---|---|---|
| Anticima Cima Libera | 3399 m | 11.2° | 7.0° | -4.2° | 9.7° | -1.5° | 3 km/h | 11 km/h | +9 |
| Solda Cima Beltovo | 3328 m | 8.9° | 8.7° | -0.2° | 12.3° | +3.4° | 10 km/h | 15 km/h | +5 |
| Ultimo Cima di Fontana Bianca | 3253 m | 12.5° | 9.2° | -3.3° | 13.8° | +1.3° | 2 km/h | 14 km/h | +12 |
| Senales Croda d. Cornacchie | 3220 m | 10.9° | 10.3° | -0.6° | 15.4° | +4.5° | 12 km/h | 7 km/h | -4 |
| Predoi Pizzo Lungo | 3105 m | 10.0° | 8.4° | -1.6° | 13.8° | +3.8° | 9 km/h | 18 km/h | +10 |
| Senales Teufelsegg | 3035 m | 12.7° | 10.0° | -2.7° | 13.4° | +0.7° | n.d. | 11 km/h | n.d. |
| Badia Cima Pisciadù | 2985 m | 13.4° | 9.2° | -4.2° | 13.9° | +0.5° | 3 km/h | 9 km/h | +6 |

## Run 2026-08-17 03:08 UTC
Stazioni: 4 (Alto Adige, open data provincia BZ). MAE modello: **0.85 °C** · MAE baseline om-2m: **1.05 °C** · MAE vento: **7.5 km/h** (4 staz.)

| stazione | quota | osservata | modello | err | om-2m | err | vento oss | vento om | err |
|---|---|---|---|---|---|---|---|---|---|
| Anticima Cima Libera | 3399 m | 2.3° | 3.4° | +1.1° | 3.4° | +1.1° | 11 km/h | 9 km/h | -2 |
| Solda Cima Beltovo | 3328 m | 2.6° | 3.8° | +1.2° | 4.0° | +1.4° | 21 km/h | 5 km/h | -15 |
| Ultimo Cima di Fontana Bianca | 3253 m | 3.8° | 4.6° | +0.8° | 4.5° | +0.7° | 18 km/h | 6 km/h | -11 |
| Senales Croda d. Cornacchie | 3220 m | 4.5° | 4.8° | +0.3° | 5.5° | +1.0° | 11 km/h | 8 km/h | -2 |

## Run 2026-08-20 11:24 UTC
Stazioni: 5 (Alto Adige, open data provincia BZ). MAE modello: **1.74 °C** · MAE baseline om-2m: **3.02 °C** · MAE vento: **7.6 km/h** (5 staz.)

| stazione | quota | osservata | modello | err | om-2m | err | vento oss | vento om | err |
|---|---|---|---|---|---|---|---|---|---|
| Anticima Cima Libera | 3399 m | 0.5° | 3.4° | +2.9° | 4.2° | +3.7° | 35 km/h | 17 km/h | -18 |
| Solda Cima Beltovo | 3328 m | 2.6° | 3.3° | +0.7° | 4.4° | +1.8° | 15 km/h | 21 km/h | +6 |
| Ultimo Cima di Fontana Bianca | 3253 m | 2.2° | 4.3° | +2.1° | 5.5° | +3.3° | 31 km/h | 26 km/h | -5 |
| Senales Croda d. Cornacchie | 3220 m | 2.6° | 4.8° | +2.2° | 6.6° | +4.0° | 16 km/h | 10 km/h | -6 |
| Predoi Pizzo Lungo | 3105 m | 4.9° | 5.7° | +0.8° | 7.2° | +2.3° | 5 km/h | 8 km/h | +3 |

## Run 2026-08-24 03:11 UTC
Stazioni: 4 (Alto Adige, open data provincia BZ). MAE modello: **0.60 °C** · MAE baseline om-2m: **0.70 °C** · MAE vento: **10.2 km/h** (4 staz.)

| stazione | quota | osservata | modello | err | om-2m | err | vento oss | vento om | err |
|---|---|---|---|---|---|---|---|---|---|
| Anticima Cima Libera | 3399 m | 1.1° | 2.5° | +1.4° | 2.2° | +1.1° | 15 km/h | 7 km/h | -9 |
| Ultimo Cima di Fontana Bianca | 3253 m | 3.8° | 4.0° | +0.2° | 3.4° | -0.4° | 18 km/h | 4 km/h | -14 |
| Senales Croda d. Cornacchie | 3220 m | 3.4° | 3.9° | +0.5° | 4.0° | +0.6° | 10 km/h | 2 km/h | -8 |
| Predoi Pizzo Lungo | 3105 m | 2.7° | 3.0° | +0.3° | 3.4° | +0.7° | 14 km/h | 4 km/h | -10 |

## Run 2026-08-27 20:54 UTC
Stazioni: 6 (Alto Adige, open data provincia BZ). MAE modello: **0.80 °C** · MAE baseline om-2m: **0.68 °C** · MAE vento: **8.4 km/h** (5 staz.)

| stazione | quota | osservata | modello | err | om-2m | err | vento oss | vento om | err |
|---|---|---|---|---|---|---|---|---|---|
| Anticima Cima Libera | 3399 m | 5.2° | 8.0° | +2.8° | 6.3° | +1.1° | 37 km/h | 28 km/h | -9 |
| Solda Cima Beltovo | 3328 m | 7.0° | 7.4° | +0.4° | 7.5° | +0.5° | 28 km/h | 22 km/h | -6 |
| Ultimo Cima di Fontana Bianca | 3253 m | 8.0° | 8.7° | +0.7° | 8.6° | +0.6° | 4 km/h | 21 km/h | +16 |
| Senales Croda d. Cornacchie | 3220 m | 8.4° | 8.3° | -0.1° | 8.8° | +0.4° | 18 km/h | 15 km/h | -3 |
| Predoi Pizzo Lungo | 3105 m | 7.6° | 8.3° | +0.7° | 8.8° | +1.2° | 20 km/h | 12 km/h | -8 |
| Senales Teufelsegg | 3035 m | 9.2° | 9.3° | +0.1° | 8.9° | -0.3° | n.d. | 26 km/h | n.d. |

## Run 2026-08-31 08:32 UTC
Stazioni: 7 (Alto Adige, open data provincia BZ). MAE modello: **0.66 °C** · MAE baseline om-2m: **1.96 °C** · MAE vento: **3.8 km/h** (6 staz.)

| stazione | quota | osservata | modello | err | om-2m | err | vento oss | vento om | err |
|---|---|---|---|---|---|---|---|---|---|
| Anticima Cima Libera | 3399 m | 2.5° | 2.5° | -0.0° | 3.5° | +1.0° | 10 km/h | 2 km/h | -8 |
| Solda Cima Beltovo | 3328 m | 2.9° | 3.2° | +0.3° | 5.5° | +2.6° | 7 km/h | 11 km/h | +4 |
| Ultimo Cima di Fontana Bianca | 3253 m | 4.5° | 4.1° | -0.4° | 6.8° | +2.3° | 5 km/h | 7 km/h | +2 |
| Senales Croda d. Cornacchie | 3220 m | 4.3° | 4.4° | +0.1° | 7.2° | +2.9° | 6 km/h | 9 km/h | +3 |
| Predoi Pizzo Lungo | 3105 m | 3.4° | 4.1° | +0.7° | 6.9° | +3.5° | 6 km/h | 8 km/h | +2 |
| Senales Teufelsegg | 3035 m | 5.4° | 4.7° | -0.7° | 6.5° | +1.1° | n.d. | 8 km/h | n.d. |
| Badia Cima Pisciadù | 2985 m | 8.1° | 5.7° | -2.4° | 8.4° | +0.3° | 3 km/h | 7 km/h | +4 |
