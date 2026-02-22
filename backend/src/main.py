from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import random
from datetime import datetime

app = FastAPI(title="aimeteo.it Backend - Month 1 Prototype")

# Enable CORS for frontend requests
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/status")
def status():
    return {"status": "online", "model": "Vertex AI (GenCast/WeatherNext2 - MOCK)"}

@app.get("/api/forecast")
def get_forecast(lat: float, lon: float):
    # This endpoint mocks the extraction of a 5x5 grid (1km x 1km cells) centered on the requested coords.
    # In production, this will query Vertex AI and parse the resulting GRIB2/NetCDF arrays using Xarray.
    
    grid = []
    # 0.01 degrees is roughly 1km at mid-latitudes (very rough approximation for this mock)
    for i in range(-2, 3):
        for j in range(-2, 3):
            cell_lat = lat + (i * 0.01)
            cell_lon = lon + (j * 0.01)
            
            # Generate deterministic-ish random data based on coords for the mock
            seed = int(cell_lat * 1000) ^ int(cell_lon * 1000)
            random.seed(seed)
            
            # Simulate a continuous field with some noise
            base_temp = 22.0 if lat > 40 else 28.0 # cooler north, warmer south
            temp = base_temp - (lat - 40) * 0.5 + random.uniform(-1.5, 1.5)
            
            grid.append({
                "id": f"cell_{i}_{j}",
                "lat": round(cell_lat, 4),
                "lon": round(cell_lon, 4),
                "temp": round(temp, 1),
                "precip_prob": random.randint(0, 40) if temp > 15 else random.randint(40, 90),
                "wind_speed": round(random.uniform(2.0, 18.0), 1),
                "condition": random.choice(["Sunny", "Partly Cloudy", "Rain", "Thunderstorm"]),
                "is_target": i == 0 and j == 0,
                "x_offset": j,
                "y_offset": i
            })
            
    return {
        "status": "success",
        "timestamp": datetime.now().isoformat(),
        "center_coords": {"lat": lat, "lon": lon},
        "model_resolution": "1km x 1km",
        "grid": grid
    }
