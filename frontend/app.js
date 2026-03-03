document.addEventListener('DOMContentLoaded', () => {
    const fetchBtn = document.getElementById('fetch-btn');
    const locationSelect = document.getElementById('location-select');
    const weatherGrid = document.getElementById('weather-grid');
    const targetSummary = document.getElementById('target-summary');
    const statusIndicator = document.getElementById('backend-status');
    const statusDot = document.querySelector('.status-dot');

    const timeControl = document.getElementById('time-control-container');
    const timeSlider = document.getElementById('time-slider');
    const timeLabel = document.getElementById('time-label');
    const layerBtns = document.querySelectorAll('.layer-btn');

    const API_BASE = 'http://127.0.0.1:8000/api';

    let radarMap = null;
    let rainLayer = null;
    let latestRainTime = null; 

    let homeLat = null;
    let homeLon = null;
    let targetMarker = null;

    // Stato Globale dell'App
    let baseData = null; 
    let currentLayer = 'temp'; // 'temp', 'precip', o 'wind'
    let currentHourOffset = 0;

    // --- Gestione Eventi Slider e Bottoni ---
    timeSlider.addEventListener('input', (e) => {
        currentHourOffset = parseInt(e.target.value);
        timeLabel.textContent = currentHourOffset === 0 ? "Adesso" : `+${currentHourOffset}h`;
        if (baseData) updateGridDisplay();
    });

    layerBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            layerBtns.forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            currentLayer = e.currentTarget.dataset.layer;
            if (baseData) {
                updateGridDisplay();
                updateRadarLayer();
            }
        });
    });

    // --- Controllo Status Backend ---
    async function checkStatus() {
        try {
            const res = await fetch(`${API_BASE}/status`);
            if (res.ok) {
                statusIndicator.textContent = "Backend Active";
                statusDot.style.background = "var(--success)";
                statusDot.style.boxShadow = "0 0 10px var(--success)";
            }
        } catch (e) {
            statusIndicator.textContent = "Backend Offline";
            statusDot.style.background = "var(--danger)";
            statusDot.style.boxShadow = "0 0 10px var(--danger)";
        }
    }
    checkStatus();
    setInterval(checkStatus, 10000);

    // --- Chiamata API ---
    async function runInference() {
        const icon = document.getElementById('refresh-icon');
        icon.classList.add('spin');
        fetchBtn.disabled = true;

        try {
            let lat, lon, locationName;

            if (locationSelect.value === 'current') {
                statusIndicator.textContent = "Acquisizione GPS...";
                const pos = await new Promise((resolve, reject) => {
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
                });
                lat = pos.coords.latitude;
                lon = pos.coords.longitude;

                statusIndicator.textContent = "Identificazione città...";
                const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
                const geoData = await geoRes.json();
                
                const city = geoData.address.city || geoData.address.town || geoData.address.village || "Località Sconosciuta";
                locationName = `${city} (Posizione Attuale)`;
                statusIndicator.textContent = "Backend Active"; 
            } else {
                [lat, lon] = locationSelect.value.split(',');
                locationName = locationSelect.options[locationSelect.selectedIndex].text;
            }

            const response = await fetch(`${API_BASE}/forecast?lat=${lat}&lon=${lon}`);
            if (!response.ok) throw new Error('API Error');
            const data = await response.json();

            // Salva i dati originali nello stato globale
            baseData = { ...data, locationName };
            
            // Mostra i controlli del tempo
            timeControl.style.display = 'block';
            
            // Renderizza la UI
            initRadarMap(lat, lon);
            renderSummary(data.grid.find(c => c.is_target), locationName, data.timestamp);
            updateGridDisplay();

        } catch (error) {
            weatherGrid.innerHTML = `<div class="empty-state error"><p>Errore di connessione.</p></div>`;
        } finally {
            icon.classList.remove('spin');
            fetchBtn.disabled = false;
        }
    }

    // Leghiamo la funzione al bottone
    fetchBtn.addEventListener('click', runInference);

    // ESECUZIONE AUTOMATICA ALL'AVVIO
    // Usiamo setTimeout per dare tempo al browser di renderizzare la UI base prima di chiedere il GPS
    setTimeout(() => {
        runInference();
    }, 500);

    // --- Funzione per simulare l'evoluzione temporale (Mocking JS) ---
    function updateGridDisplay() {
        if (!baseData) return;

        // Creiamo una copia della griglia calcolando il meteo futuro
        const simulatedGrid = baseData.grid.map(cell => {
            // Simuliamo il ciclo giorno/notte (onda sinusoidale) per la temperatura
            const tempVariation = Math.sin((currentHourOffset / 24) * Math.PI * 2) * -5; // La notte scende di 5 gradi
            
            // Simuliamo lo spostamento delle nubi/pioggia
            const precipVariation = (currentHourOffset * cell.x_offset * 2); 
            
            return {
                ...cell,
                temp: Math.round((cell.temp + tempVariation) * 10) / 10,
                precip_prob: Math.max(0, Math.min(100, Math.round(cell.precip_prob + precipVariation))),
                wind_dir: (cell.x_offset * 45 + currentHourOffset * 10) % 360 // Direzione vento fittizia
            };
        });

        renderGrid(simulatedGrid);
    }

    // --- Renderizzazione UI ---
    function getConditionIcon(condition) {
        switch (condition) {
            case 'Sunny': return 'sun';
            case 'Partly Cloudy': return 'cloud-sun';
            case 'Rain': return 'cloud-drizzle';
            case 'Thunderstorm': return 'cloud-lightning';
            default: return 'cloud';
        }
    }

    function renderSummary(targetCell, locationName, timestamp) {
        if (!targetCell) return;
        const date = new Date(timestamp).toLocaleString();

        targetSummary.style.display = 'flex';
        targetSummary.innerHTML = `
            <div class="summary-header">
                <h3>${locationName}</h3>
                <span class="timestamp">${date}</span>
            </div>
            <div class="summary-content">
                <div class="summary-stats">
                    <div class="stat-main">
                        <i data-lucide="${getConditionIcon(targetCell.condition)}" class="condition-icon large"></i>
                        <span class="temp-large">${targetCell.temp}°C</span>
                    </div>
                    <div class="stat-details">
                        <div class="stat"><i data-lucide="droplets"></i> ${targetCell.precip_prob}% Precip</div>
                        <div class="stat"><i data-lucide="wind"></i> ${targetCell.wind_speed} km/h Wind</div>
                    </div>
                </div>
            </div>
        `;
        lucide.createIcons();
    }

    function renderGrid(cells) {
        weatherGrid.innerHTML = '';
        cells.sort((a, b) => a.y_offset !== b.y_offset ? a.y_offset - b.y_offset : a.x_offset - b.x_offset);

        cells.forEach((cell, index) => {
            const card = document.createElement('div');
            card.className = `cell-card ${cell.is_target ? 'target' : ''}`;
            card.style.animationDelay = `${index * 0.01}s`; // Animazione più veloce

            let contentHtml = `<div class="cell-coords">[${cell.x_offset > 0 ? '+' + cell.x_offset : cell.x_offset}, ${cell.y_offset > 0 ? '+' + cell.y_offset : cell.y_offset}]</div>`;

            // Mostriamo i dati in base al LIVELLO SELEZIONATO
            if (currentLayer === 'temp') {
                // Temperatura: Colore di sfondo dinamico (Heatmap)
                const hue = Math.max(0, 240 - (cell.temp * 8)); 
                card.style.backgroundColor = `hsla(${hue}, 70%, 20%, 0.4)`;
                contentHtml += `
                    <div class="cell-temp">${cell.temp}°</div>
                    <i data-lucide="${getConditionIcon(cell.condition)}" class="cell-icon"></i>`;
            } 
            else if (currentLayer === 'precip') {
                // Pioggia: Sfumature di azzurro
                const alpha = cell.precip_prob > 0 ? 0.2 + (cell.precip_prob / 100) * 0.6 : 0;
                card.style.backgroundColor = `rgba(56, 189, 248, ${alpha})`;
                contentHtml += `
                    <div class="cell-temp" style="font-size: 1.2rem; color: var(--accent);">${cell.precip_prob}%</div>
                    <i data-lucide="cloud-rain" class="cell-icon" style="color: var(--accent);"></i>`;
            }
            else if (currentLayer === 'wind') {
                // Vento: Intensità e freccia di direzione
                const windColor = cell.wind_speed > 10 ? 'var(--danger)' : 'var(--text-main)';
                card.style.backgroundColor = `rgba(20, 25, 45, 0.6)`; 
                contentHtml += `
                    <div class="cell-temp" style="font-size: 1.1rem; color: ${windColor};">${cell.wind_speed} <span style="font-size: 0.6rem">km/h</span></div>
                    <i data-lucide="navigation" class="cell-icon" style="transform: rotate(${cell.wind_dir}deg); transition: transform 0.3s; margin-top: 5px;"></i>`;
            }
            else if (currentLayer === 'all') {
                // RIEPILOGO: Tutti i dati ridotti in un'unica cella
                card.style.backgroundColor = `rgba(20, 25, 45, 0.6)`; // Sfondo neutro standard
                contentHtml += `
                    <div style="font-size: 1.3rem; font-weight: 800; margin-bottom: 2px;">${cell.temp}°</div>
                    <div style="display: flex; flex-direction: column; gap: 4px; align-items: center; width: 100%;">
                        <div style="display: flex; align-items: center; gap: 4px; font-size: 0.75rem; color: var(--accent);">
                            <i data-lucide="droplets" style="width: 12px; height: 12px;"></i> ${cell.precip_prob}%
                        </div>
                        <div style="display: flex; align-items: center; gap: 4px; font-size: 0.75rem; color: var(--text-muted);">
                            <i data-lucide="wind" style="width: 12px; height: 12px;"></i> ${cell.wind_speed}
                        </div>
                    </div>`;
            }

            card.innerHTML = contentHtml;
            weatherGrid.appendChild(card);
        });
        lucide.createIcons();
    }

    
// --- FUNZIONI RADAR MAP (LEAFLET + RAINVIEWER 0€) ---
async function initRadarMap(lat, lon) {
        const currentRadarSection = document.getElementById('radar-section');
        
        if (!currentRadarSection) {
            console.error("ERRORE: Manca il div con id='radar-section' nel tuo index.html!");
            return;
        }
        
        currentRadarSection.style.display = 'block';

        // Salviamo le coordinate correnti come posizione "Home"
        homeLat = lat;
        homeLon = lon;

        if (!radarMap) {
            radarMap = L.map('radar-map').setView([lat, lon], 6);
            
            // MAPPA PIÙ VISIBILE: Usiamo 'light_all' di CartoDB invece di 'dark_all'
            // In alternativa, per la mappa a colori standard: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '© OpenStreetMap, © CARTO'
            }).addTo(radarMap);

            // CREAZIONE DEL BOTTONE HOME (Leaflet Custom Control)
            const HomeControl = L.Control.extend({
                options: { position: 'topleft' },
                onAdd: function(map) {
                    const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
                    
                    // Stiliamo il contenitore per farlo intonare al tema dark dell'app
                    container.style.backgroundColor = 'var(--card-bg)';
                    container.style.border = '1px solid var(--card-border)';
                    container.style.backdropFilter = 'blur(8px)';
                    container.style.width = '34px';
                    container.style.height = '34px';
                    container.style.display = 'flex';
                    container.style.alignItems = 'center';
                    container.style.justifyContent = 'center';
                    container.style.cursor = 'pointer';
                    
                    // Inseriamo l'icona Lucide "home"
                    container.innerHTML = `<i data-lucide="home" style="color: var(--text-main); width: 18px; height: 18px;"></i>`;
                    
                    // Logica al click: torna alle coordinate home
                    container.onclick = function(e) {
                        e.stopPropagation(); // Evita che il click passi alla mappa sottostante
                        map.flyTo([homeLat, homeLon], 6, { duration: 1.5 }); // Animazione fluida (flyTo)
                    }
                    
                    // Effetti hover base
                    container.onmouseover = () => container.style.backgroundColor = 'var(--primary)';
                    container.onmouseout = () => container.style.backgroundColor = 'var(--card-bg)';

                    return container;
                }
            });

            // Aggiungiamo il controllo alla mappa
            radarMap.addControl(new HomeControl());
            
            // Diamo a Lucide il tempo di renderizzare l'icona appena inserita nel DOM
            setTimeout(() => lucide.createIcons(), 50);

        } else {
            // Se la mappa esiste già, la aggiorniamo in modo fluido
            radarMap.flyTo([lat, lon], 6, { duration: 1.5 });
            radarMap.invalidateSize(); 
        }

        if (targetMarker) {
            targetMarker.setLatLng([lat, lon]);
        } else {
            // Usiamo un'icona personalizzata per farla sembrare un pin rosso
            const redIcon = L.icon({
                iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                iconSize: [25, 41],
                iconAnchor: [12, 41],
                popupAnchor: [1, -34],
                shadowSize: [41, 41]
            });
            targetMarker = L.marker([lat, lon], {icon: redIcon}).addTo(radarMap);
        }

        try {
            const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
            const data = await res.json();
            latestRainTime = data.radar.past[data.radar.past.length - 1].time;
            updateRadarLayer();
        } catch (e) {
            console.error("Errore fetch RainViewer:", e);
        }
    }

    function updateRadarLayer() {
        if (!radarMap) return;
        
        if (rainLayer) {
            radarMap.removeLayer(rainLayer);
            rainLayer = null;
        }

        const currentRadarSubtitle = document.getElementById('radar-subtitle');

        if ((currentLayer === 'precip' || currentLayer === 'all') && latestRainTime) {
            if(currentRadarSubtitle) currentRadarSubtitle.textContent = "";
            const url = `https://tilecache.rainviewer.com/v2/radar/${latestRainTime}/256/{z}/{x}/{y}/2/1_1.png`;
            rainLayer = L.tileLayer(url, { opacity: 0.75, zIndex: 10 }).addTo(radarMap);
        } else {
            let layerName = currentLayer === 'temp' ? 'Temperatura' : 'Vento';
            if(currentRadarSubtitle) currentRadarSubtitle.textContent = ``;
        }
    }

});

