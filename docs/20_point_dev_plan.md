# aimeteo.it - 20-Point Dev Plan

The Language: Why Python + Rust is the 2026 Winner
For a high-concurrency AI weather app, a Hybrid Architecture is best:
- **Primary: Python.** (80% of the codebase). It is the native language for Google Vertex AI and WeatherNext 2. It allows you to use libraries like Xarray and Dask which are essential for handling the massive multidimensional arrays (GRIB2/NetCDF formats) used in weather forecasting.
- **Secondary: Rust or Go.** (20% of the codebase). Use this for the "Nowcasting" engine. When you need to push millisecond-accurate alerts to millions of users on the Upper West Side during a flash storm, Python's latency might be too high. Rust handles the data ingestion and WebSocket streaming with maximum safety and speed.

## Phase I: Foundation (Weeks 1-4)
1. **Google Cloud (GCP) Architecture Setup**: Vertex AI & BigQuery.
2. **WeatherNext 2 API Integration**: Connect to Google's GenCast/WeatherNext models.
3. **Data Ingestion Pipeline**: Stream ERA5 & HRES data for fine-tuning.
4. **Hyper-local Grid Definition**: Define 1km x 1km resolution cells for Italy/NYC.
5. **Database Strategy**: Use TimescaleDB for time-series weather data.

## Phase II: AI Core (Weeks 5-10)
6. **Model Fine-tuning**: Inject local Italian topography data into the AI.
7. **Probabilistic Engine**: Generate 100+ "scenarios" for every forecast.
8. **Nowcasting Algorithm**: Build the 0-6 hour "immediate" rain logic (Rust/Go).
9. **Bias Correction Layer**: Use historical local sensor data to fix AI "drift."
10. **Multi-Modal Analysis**: Use Gemini to "read" satellite images & radar.

## Phase III: Backend/API (Weeks 11-14)
11. **Rust Data-Pusher**: High-speed ingestion for lightning/radar data.
12. **GraphQL API Development**: Flexible data fetching for the frontend.
13. **User Authentication**: Secure login & preference storage.
14. **Geofencing Engine**: Logic to trigger alerts based on GPS movement.
15. **WebSocket Implementation**: Real-time "Rain is 5 mins away" live updates.

## Phase IV: User Experience (Weeks 15-20)
16. **Frontend Development**: Flutter (Cross-platform iOS/Android/Web).
17. **Dynamic AI Dashboards**: Summarize weather in plain Italian via AI.
18. **Beta Testing**: Focus group in Milan and NYC.
19. **Monetization Integration**: Ad-engine and "Pro" subscription hooks.
20. **App Store / Play Store Launch**: Global deployment of aimeteo.it.

## The Schedule (6-Month "Go-to-Market")
- **Month 1**: Prototype. Get raw AI data from Google and display it in a terminal or simple web UI. Prove the 1km accuracy.
- **Month 2-3**: The Brain. Build the heavy backend logic. Since you are comfortable with Python and physics, this is where you'll spend your time optimizing the "Chiral" style data flows of atmospheric variables.
- **Month 4**: The Interface. Build the mobile app. It must be faster and cleaner than Meteo.it.
- **Month 5**: Stress Test. Simulate 100,000 users to ensure the Rust/Python hybrid doesn't crash during a simulated "mediterranean hurricane."
- **Month 6**: Launch & Marketing. Focus on the "AI-First" branding.
