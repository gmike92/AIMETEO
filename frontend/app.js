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
            if (baseData) updateGridDisplay();
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
    fetchBtn.addEventListener('click', async () => {
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
            renderSummary(data.grid.find(c => c.is_target), locationName, data.timestamp);
            updateGridDisplay();

        } catch (error) {
            weatherGrid.innerHTML = `<div class="empty-state error"><p>Errore di connessione.</p></div>`;
        } finally {
            icon.classList.remove('spin');
            fetchBtn.disabled = false;
        }
    });

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
        const mapUrl = `https://maps.google.com/maps?q=${targetCell.lat},${targetCell.lon}&z=13&output=embed`;

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
                <div class="map-container">
                    <iframe src="${mapUrl}" width="100%" height="100%" style="border:0;" loading="lazy"></iframe>
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
});
