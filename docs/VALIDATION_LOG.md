
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

## Run 2026-07-20 05:48 UTC
Stazioni: 5 (Alto Adige, open data provincia BZ). MAE modello: **0.84 °C** · MAE baseline om-2m: **0.88 °C**

| stazione | quota | osservata | modello | err | om-2m | err |
|---|---|---|---|---|---|---|
| Ultimo Cima di Fontana Bianca | 3253 m | 2.9° | 2.6° | -0.3° | 3.5° | +0.6° |
| Senales Croda d. Cornacchie | 3220 m | 2.8° | 1.6° | -1.2° | 3.4° | +0.6° |
| Predoi Pizzo Lungo | 3105 m | 2.4° | 1.6° | -0.8° | 2.7° | +0.3° |
| Senales Teufelsegg | 3035 m | 3.8° | 2.1° | -1.7° | 2.4° | -1.4° |
| Badia Cima Pisciadù | 2985 m | 4.2° | 4.0° | -0.2° | 5.7° | +1.5° |
