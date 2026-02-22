# aimeteo.it - Architecture Decision: Google Vertex AI vs. Open-Meteo API

This document outlines the architectural trade-offs between consuming raw Google AI models (GenCast/WeatherNext) via Google Cloud versus utilizing the Open-Meteo API aggregator.

## Option 1: The GCP / Vertex AI Route (Original Plan)
*Building a proprietary AI Weather Engine.*

### Architecture
- **Data Source:** Raw GRIB2/NetCDF files from Google Vertex AI (GenCast / WeatherNext 2).
- **Processing (Python):** `xarray` and `dask` data pipelines to ingest, slice, and process the massive multidimensional arrays into the 1km x 1km local grids.
- **AI Core:** Custom fine-tuning of the models using local Italian topography and historical sensor data for bias correction.
- **Probabilistic Engine:** Generating 50-100+ possible weather scenarios (ensemble forecasts) inherent to GenCast's diffusion model architecture.

### Pros
- **Maximum Analytical Power:** You control the generative models to produce probabilities and specific scenarios, rather than just single deterministic outputs.
- **Proprietary IP:** The fine-tuned weights, bias correction layers, and data pipelines become the core intellectual property of aimeteo.it.
- **Extreme Customization:** Ability to strictly map to hyper-local topographic constraints.

### Cons
- **High Infrastructure Cost:** Vertex AI inference, BigQuery storage, and compute for processing massive NetCDF files are expensive.
- **Complex Engineering:** Managing the `xarray`/`dask` pipelines requires significant effort before serving the data to the frontend.

---

## Option 2: The Open-Meteo API Route
*Moving fast with aggregated, deterministic AI data.*

### Architecture
- **Data Source:** REST API requests to Open-Meteo, specifically requesting the `models=google_graphcast` parameter.
- **Processing (Python/Rust):** Lightweight JSON parsing. The heavy lifting of running the AI model is offloaded to Open-Meteo.
- **AI Core (Limited):** The focus shifts strictly to the "Nowcasting" engine (0-6 hours) using Rust, bridging the API data with real-time radar data.
- **Probabilistic Engine (Omitted):** GraphCast provides deterministic predictions (1 scenario), not an ensemble of probabilities. 

### Pros
- **Speed to Market:** You can skip the complex GCP integration and start building the frontend, dashboards, and alerting systems immediately.
- **Cost-Effective:** Open-Meteo is free for non-commercial use and significantly cheaper than operating your own TPU/GPU inference pipelines.
- **Simplified Stack:** Removes the necessity for multidimensional array processing (`xarray`) in Phase 1.

### Cons
- **Limited to GraphCast:** You only have access to Google's deterministic model, missing out on the GenCast probabilistic generative AI capabilities.
- **No Direct Fine-Tuning:** You cannot inject your own topographical weights directly into the Google model; you can only apply post-processing bias correction on your backend.

## Summary Conclusion
If the core value of **aimeteo.it** is delivering a 100+ scenario generative AI prediction specifically tuned to Italian topography, **Option 1 (Vertex AI)** is mandatory.
If the core value is delivering an incredibly fast, beautiful app utilizing Google's AI data faster than competitors, **Option 2 (Open-Meteo)** allows you to drastically speed up Phase 1 and 2 and focus extensively on UX and the Rust-based alerting engine.
