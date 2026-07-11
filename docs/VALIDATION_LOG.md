
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
