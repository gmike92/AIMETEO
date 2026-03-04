document.addEventListener('DOMContentLoaded', () => {

    // ── DOM REFS ──────────────────────────────────────────────────────────────
    const fetchBtn        = document.getElementById('fetch-btn');
    const refreshIcon     = document.getElementById('refresh-icon');
    const locationSelect  = document.getElementById('location-select');
    const statusDot       = document.getElementById('status-dot');
    const statusText      = document.getElementById('backend-status');

    const summaryCard     = document.getElementById('summary-card');
    const summaryLocation = document.getElementById('summary-location');
    const summaryIcon     = document.getElementById('summary-icon');
    const summaryTemp     = document.getElementById('summary-temp');
    const summaryPrecip   = document.getElementById('summary-precip');
    const summaryWind     = document.getElementById('summary-wind');

    const selectedCard     = document.getElementById('selected-card');
    const selectedLocation = document.getElementById('selected-location');
    const selectedIcon     = document.getElementById('selected-icon');
    const selectedTemp     = document.getElementById('selected-temp');
    const selectedPrecip   = document.getElementById('selected-precip');
    const selectedWind     = document.getElementById('selected-wind');
    const setHomeBtn       = document.getElementById('set-home-btn');

    const detailPanel     = document.getElementById('detail-panel');
    const panelClose      = document.getElementById('panel-close');
    const gridTimestamp   = document.getElementById('grid-timestamp');
    const weatherGrid     = document.getElementById('weather-grid');

    const timeBar         = document.getElementById('time-bar');
    const timeSlider      = document.getElementById('time-slider');
    const timeLabel       = document.getElementById('time-label');

    const loadingOverlay  = document.getElementById('loading-overlay');
    const loadingMsg      = document.getElementById('loading-msg');

    const homeBtn         = document.getElementById('home-btn');

    // Panel layer tab buttons
    const panelLayerBtns  = document.querySelectorAll('.ptab');
    // Left sidebar layer buttons
    const sideLayerBtns   = document.querySelectorAll('.layer-btn[data-layer]');

    const API_BASE = 'http://127.0.0.1:8000/api';

    // ── STATE ─────────────────────────────────────────────────────────────────
    let radarMap        = null;
    let rainLayer       = null;
    let latestRainTime  = null;
    let targetMarker    = null;
    let clickMarker     = null;

    let homeLat = null;
    let homeLon = null;
    let clickLabel    = null;
    let homeMarker     = null;
    let clickHistory  = [];   // storico ultime 5 località cliccate come home

    let baseData        = null;   // full API response
    let currentLayer    = 'temp'; // temp | precip | wind | all
    let selectedLocationData = null; // dati della location cliccata sulla mappa
    let dayNightLayer   = null;
    let cloudsLayer     = null;
    let eventMarkers    = [];
    let currentHourOffset = 0;

    // ── BACKEND STATUS ────────────────────────────────────────────────────────
    async function checkStatus() {
        try {
            const res = await fetch(`${API_BASE}/status`);
            if (res.ok) {
                statusText.textContent = 'Backend Active';
                statusDot.classList.add('online');
            } else throw new Error();
        } catch {
            statusText.textContent = 'Backend Offline';
            statusDot.classList.remove('online');
        }
    }
    // ── SETTINGS ─────────────────────────────────────────────────────────────

    // Stato impostazioni con default
    let settings = {
        layers:   { temp:true, precip:true, wind:true, daynight:true, clouds:true, aurora:true, hazards:true, amazing:true },
        units:    { temp:'C', wind:'kmh', precip:'mm', pressure:'hpa' },
        language: 'it'
    };

    // Carica da localStorage se presente
    const saved = localStorage.getItem('aimeteo_settings');
    if (saved) {
        try { settings = { ...settings, ...JSON.parse(saved) }; } catch {}
    }

    function applySettings() {
        // Mostra/nascondi layer buttons in sidebar
        document.querySelectorAll('.layer-btn[data-layer]').forEach(btn => {
            const layer = btn.dataset.layer;
            btn.style.display = settings.layers[layer] === false ? 'none' : '';
        });
        // Mostra/nascondi flyout buttons
        document.querySelectorAll('.flyout-btn[data-layer]').forEach(btn => {
            const layer = btn.dataset.layer;
            btn.style.display = settings.layers[layer] === false ? 'none' : '';
        });
    }

    function syncSettingsUI() {
        // Toggle layer
        document.querySelectorAll('[data-layer-toggle]').forEach(input => {
            input.checked = settings.layers[input.dataset.layerToggle] !== false;
        });
        // Unit buttons
        document.querySelectorAll('.unit-btn[data-unit]').forEach(btn => {
            btn.classList.toggle('active', settings.units[btn.dataset.unit] === btn.dataset.value);
        });
        // Language
        document.querySelectorAll('.lang-btn[data-lang]').forEach(btn => {
            btn.classList.toggle('active', settings.language === btn.dataset.lang);
        });
    }

    // Drawer open/close
    const settingsBtn     = document.getElementById('settings-btn');
    const settingsDrawer  = document.getElementById('settings-drawer');
    const settingsOverlay = document.getElementById('settings-overlay');
    const settingsClose   = document.getElementById('settings-close');
    const settingsSave    = document.getElementById('settings-save');

    function openSettings() {
        syncSettingsUI();
        settingsDrawer.classList.add('open');
        settingsOverlay.classList.add('open');
    }
    function closeSettings() {
        settingsDrawer.classList.remove('open');
        settingsOverlay.classList.remove('open');
    }

    settingsBtn.addEventListener('click', openSettings);
    settingsClose.addEventListener('click', closeSettings);
    settingsOverlay.addEventListener('click', closeSettings);

    // Layer toggles
    document.querySelectorAll('[data-layer-toggle]').forEach(input => {
        input.addEventListener('change', () => {
            settings.layers[input.dataset.layerToggle] = input.checked;
        });
    });

    // Unit buttons
    document.querySelectorAll('.unit-btn[data-unit]').forEach(btn => {
        btn.addEventListener('click', () => {
            settings.units[btn.dataset.unit] = btn.dataset.value;
            // Aggiorna visivamente tutti i btn dello stesso gruppo
            document.querySelectorAll(`.unit-btn[data-unit="${btn.dataset.unit}"]`)
                .forEach(b => b.classList.toggle('active', b === btn));
        });
    });

    // Language buttons
    document.querySelectorAll('.lang-btn[data-lang]').forEach(btn => {
        btn.addEventListener('click', () => {
            settings.language = btn.dataset.lang;
            document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Salva
    settingsSave.addEventListener('click', () => {
        localStorage.setItem('aimeteo_settings', JSON.stringify(settings));
        applySettings();
        closeSettings();
        // Feedback visivo
        settingsSave.textContent = '✓ Salvato!';
        setTimeout(() => { settingsSave.textContent = 'Salva impostazioni'; }, 1800);
    });

    // Applica subito al caricamento
    applySettings();

    checkStatus();
    setInterval(checkStatus, 10_000);

    // ── LAYER BUTTONS (sidebar) ───────────────────────────────────────────────
    sideLayerBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sideLayerBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLayer = btn.dataset.layer;
            if (baseData) {
                updateGridDisplay();
                updateRadarLayer();
                // sync panel tabs
                panelLayerBtns.forEach(b => b.classList.toggle('active', b.dataset.player === currentLayer));
            }
        });
    });

    // ── PANEL LAYER TABS ─────────────────────────────────────────────────────
    panelLayerBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            panelLayerBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLayer = btn.dataset.player;
            if (baseData) {
                updateGridDisplay();
                updateRadarLayer();
                // sync sidebar
                sideLayerBtns.forEach(b => b.classList.toggle('active', b.dataset.layer === currentLayer));
            }
        });
    });

    // ── TIME SLIDER ───────────────────────────────────────────────────────────
    timeSlider.addEventListener('input', (e) => {
        currentHourOffset = parseInt(e.target.value);
        timeLabel.textContent = currentHourOffset === 0 ? '+0h' : `+${currentHourOffset}h`;
        if (baseData) updateGridDisplay();
    });

    // ── HOME BUTTON ───────────────────────────────────────────────────────────
    homeBtn.addEventListener('click', () => {
        if (radarMap && homeLat) {
            radarMap.flyTo([homeLat, homeLon], 7, { duration: 1.4 });
        }
    });
    
    // ── FLYOUT "ALTRO" ────────────────────────────────────────────────────────
    document.querySelectorAll('.flyout-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.flyout-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLayer = btn.dataset.layer;
            // Deseleziona sidebar buttons normali
            sideLayerBtns.forEach(b => b.classList.remove('active'));
            panelLayerBtns.forEach(b => b.classList.toggle('active', b.dataset.player === currentLayer));
            updateGridDisplay();
            updateRadarLayer();
        });
    });

    // ── PANEL OPEN / CLOSE ────────────────────────────────────────────────────
    function openPanel() {
        detailPanel.classList.add('open');
        timeBar.classList.add('panel-open');
    }

    function closePanel() {
        detailPanel.classList.remove('open');
        timeBar.classList.remove('panel-open');
    }

    panelClose.addEventListener('click', closePanel);

    // ── MAP INIT ──────────────────────────────────────────────────────────────
    function initMap(lat, lon) {
        if (radarMap) {
            radarMap.flyTo([lat, lon], 7, { duration: 1.4 });
            radarMap.invalidateSize();
            return;
        }

        radarMap = L.map('radar-map', { zoomControl: true , minZoom: 3 }).setView([lat, lon], 7);

        // Dark satellite-style tile
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors, © CARTO',
            maxZoom: 19
        }).addTo(radarMap);

        // Map click → reverse geocoding + marker con popup + fetch grid
        radarMap.on('click', async (e) => {
            const { lat, lng } = e.latlng;

            // Reverse geocoding per il label del fumetto
            let label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            try {
                const geo = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
                const geoData = await geo.json();
                const city = geoData.address?.city || geoData.address?.town || geoData.address?.village;
                const country = geoData.address?.country_code?.toUpperCase();
                if (city) label = country ? `${city}, ${country}` : city;
            } catch { /* usa coordinate come fallback */ }

            clickLabel = label;
            placeClickMarker(lat, lng, label);
            await fetchAndShowGrid(lat, lng, label);
        });
    }

    // ── TARGET MARKER ─────────────────────────────────────────────────────────
    function setTargetMarker(lat, lon) {
        const gpsIcon = L.divIcon({
            className: '',
            html: '<div class="gps-marker-dot"></div>',
            iconSize: [16, 16],
            iconAnchor: [8, 8]
        });

        if (targetMarker) {
            targetMarker.setLatLng([lat, lon]);
        } else {
            targetMarker = L.marker([lat, lon], { icon: gpsIcon, zIndexOffset: 100 }).addTo(radarMap);
        }
    }

    function placeClickMarker(lat, lon, label) {
        const pinIcon = L.divIcon({
            className: '',
            html: '<div class="click-marker-pin"></div>',
            iconSize: [22, 22],
            iconAnchor: [6, 22]   // punta del pin sul punto cliccato
        });

        const popupContent = () => {
            const div = document.createElement('div');
            div.className = 'custom-popup';
            div.innerHTML = `
                <div class="popup-title">
                    <i data-lucide="map-pin"></i>
                    <span>${label}</span>
                </div>
                <div class="popup-actions">
                    <button class="popup-btn set-home">
                        <i data-lucide="home"></i> Imposta Home
                    </button>
                    <button class="popup-btn remove">
                        <i data-lucide="x"></i>
                    </button>
                </div>`;

            // Render lucide icons nel popup
            setTimeout(() => lucide.createIcons({ nodes: [div] }), 0);

            div.querySelector('.set-home').addEventListener('click', () => {
                homeLat = lat;
                homeLon = lon;

                // Aggiorna summary card con i dati della selected card se disponibili
                if (selectedLocationData && selectedLocationData.locationName === label) {
                    renderSummaryCard(selectedLocationData.cell, label);
                } else {
                    summaryLocation.textContent = label;
                }

                // Aggiorna option home nel select
                const customOpt = document.getElementById('custom-home-option') || document.createElement('option');
                customOpt.id = 'custom-home-option';
                customOpt.value = `${lat},${lon}`;
                customOpt.textContent = `⌂ ${label}`;
                if (!document.getElementById('custom-home-option')) {
                    locationSelect.insertBefore(customOpt, locationSelect.firstChild);
                }
                locationSelect.value = customOpt.value;

                // Aggiungi allo storico (evita duplicati, max 5)
                clickHistory = clickHistory.filter(h => h.value !== `${lat},${lon}`);
                clickHistory.unshift({ label, value: `${lat},${lon}` });
                if (clickHistory.length > 5) clickHistory.pop();
                rebuildHistoryOptions();

                // Piazza il marker Home
                placeHomeMarker(lat, lon, label);

                // Nascondi la selected card: la home è già aggiornata
                hideSelectedCard();

                clickMarker.closePopup();
            });

            div.querySelector('.remove').addEventListener('click', () => {
                radarMap.removeLayer(clickMarker);
                clickMarker = null;
                clickLabel  = null;
                hideSelectedCard();
                closePanel();
            });

            return div;
        };

        if (clickMarker) {
            clickMarker.setLatLng([lat, lon]);
            clickMarker.getPopup().setContent(popupContent());
        } else {
            clickMarker = L.marker([lat, lon], { icon: pinIcon })
                .bindPopup(popupContent(), {
                    closeButton: false,
                    className: 'leaflet-custom-popup',
                    offset: [6, -10]
                })
                .addTo(radarMap);
        }
    }

    function buildHomePopupContent(lat, lon, label) {
        const div = document.createElement('div');
        div.className = 'custom-popup';
        div.innerHTML = `
            <div class="popup-title">
                <i data-lucide="home"></i>
                <span>${label}</span>
            </div>
            <div style="font-size:0.72rem;color:var(--muted);font-family:var(--mono);margin-bottom:10px">
                ${lat.toFixed(5)}, ${lon.toFixed(5)}
            </div>
            <div class="popup-actions">
                <button class="popup-btn remove-home" style="flex:1;background:rgba(244,63,94,0.1);color:#fda4af;border:1px solid rgba(244,63,94,0.25);border-radius:8px;padding:6px 10px;font-family:var(--font);font-size:0.75rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;">
                    <i data-lucide="home"></i> Rimuovi Home
                </button>
            </div>`;

        setTimeout(() => lucide.createIcons({ nodes: [div] }), 0);

        div.querySelector('.remove-home').addEventListener('click', () => {
            removeCustomHome();
        });

        return div;
    }

    function removeCustomHome() {
        // Rimuovi marker dalla mappa
        if (homeMarker) {
            radarMap.removeLayer(homeMarker);
            homeMarker = null;
        }
        // Rimuovi option custom dal select
        const customOpt = document.getElementById('custom-home-option');
        if (customOpt) customOpt.remove();
        // Ripristina la selezione al primo valore del menu
        locationSelect.selectedIndex = 0;
        // Aggiorna homeLat/homeLon alla posizione GPS (o null se non disponibile)
        homeLat = null;
        homeLon = null;
    }

    function rebuildHistoryOptions() {
        // Rimuovi tutte le option di storico esistenti
        document.querySelectorAll('.history-option').forEach(o => o.remove());

        // Aggiungi le ultime 5 sotto le opzioni fisse
        // Le opzioni fisse sono le prime 5 (current, Milan, Rome, New York)
        // Inseriamo lo storico alla fine, separato da un optgroup
        let group = document.getElementById('history-group');
        if (!group) {
            group = document.createElement('optgroup');
            group.id = 'history-group';
            group.label = 'Recenti';
            locationSelect.appendChild(group);
        }
        // Svuota il gruppo
        group.innerHTML = '';

        clickHistory.forEach(item => {
            const opt = document.createElement('option');
            opt.className = 'history-option';
            opt.value = item.value;
            opt.textContent = `🕑 ${item.label}`;
            group.appendChild(opt);
        });
    }

    function placeHomeMarker(lat, lon, label) {
        const homeIcon = L.divIcon({
            className: '',
            html: `<div class="home-marker-icon">
                <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>
                </svg>
            </div>`,
            iconSize: [28, 28],
            iconAnchor: [16, 16]
        });

        if (homeMarker) {
            homeMarker.setLatLng([lat, lon]);
            homeMarker.getPopup().setContent(buildHomePopupContent(lat, lon, label));
        } else {
            homeMarker = L.marker([lat, lon], { icon: homeIcon, zIndexOffset: 50 })
                .bindPopup(buildHomePopupContent(lat, lon, label), {
                    closeButton: false,
                    className: 'leaflet-custom-popup',
                    offset: [0, -14]
                })
                .addTo(radarMap);
        }
    }


    // ── FETCH GRID FOR COORDS ─────────────────────────────────────────────────
    async function fetchAndShowGrid(lat, lon, locationName) {
        showLoading('Fetching AI grid...');
        try {
            const response = await fetch(`${API_BASE}/forecast?lat=${lat}&lon=${lon}`);
            if (!response.ok) throw new Error('API Error');
            const data = await response.json();

            const name = locationName || `${lat.toFixed(4)}, ${lon.toFixed(4)}`;
            baseData = { ...data, locationName: name };

            gridTimestamp.textContent = new Date(data.timestamp).toLocaleString('it-IT', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
            });

            updateGridDisplay();

            // Aggiorna la selected card con la cella centrale
            const targetCell = data.grid.find(c => c.is_target);
            if (targetCell) {
                updateSelectedCard(targetCell, name);
            }
        } catch (err) {
            console.error(err);
        } finally {
            hideLoading();
        }
    }

    // ── MAIN INFERENCE (fetch btn) ────────────────────────────────────────────
    async function runInference() {
        showLoading('Acquisizione posizione...');
        refreshIcon.classList.add('spin');
        fetchBtn.disabled = true;

        try {
            let lat, lon, locationName;

            if (locationSelect.value === 'current') {
                loadingMsg.textContent = 'Acquisizione GPS...';
                const pos = await new Promise((resolve, reject) =>
                    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10_000 })
                );
                lat = pos.coords.latitude;
                lon = pos.coords.longitude;

                loadingMsg.textContent = 'Reverse geocoding...';
                try {
                    const geoRes = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`);
                    const geoData = await geoRes.json();
                    const city = geoData.address?.city || geoData.address?.town || geoData.address?.village || 'Posizione Attuale';
                    locationName = city;
                } catch {
                    locationName = 'Posizione Attuale';
                }
            } else {
                [lat, lon] = locationSelect.value.split(',').map(Number);
                locationName = locationSelect.options[locationSelect.selectedIndex].text;
            }

            homeLat = lat;
            homeLon = lon;

            loadingMsg.textContent = 'Inizializzazione mappa...';
            initMap(lat, lon);
            setTargetMarker(lat, lon);

            loadingMsg.textContent = 'Caricamento radar...';
            await loadRainViewer();
            updateRadarLayer();

            // Fetch main forecast
            loadingMsg.textContent = 'Running AI inference...';
            const response = await fetch(`${API_BASE}/forecast?lat=${lat}&lon=${lon}`);
            if (!response.ok) throw new Error('API Error');
            const data = await response.json();
            baseData = { ...data, locationName };

            // Update summary card
            renderSummaryCard(data.grid.find(c => c.is_target), locationName);
            summaryCard.style.display = 'block';

            hideSelectedCard();
            if (clickMarker) {
                radarMap.removeLayer(clickMarker);
                clickMarker = null;
                clickLabel = null;
            }

            // Popola hypergrid di default con la posizione corrente
            baseData = { ...data, locationName };
            gridTimestamp.textContent = new Date(data.timestamp).toLocaleString('it-IT', {
                day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
            });
            updateGridDisplay();

        } catch (err) {
            console.error('Inference error:', err);
            statusText.textContent = 'Errore';
        } finally {
            refreshIcon.classList.remove('spin');
            fetchBtn.disabled = false;
            hideLoading();
        }
    }

    fetchBtn.addEventListener('click', runInference);

    locationSelect.addEventListener('change', () => {
        // Se l'utente sceglie una voce diversa da quella home custom,
        // rimuovi il marker home dalla mappa (ma mantieni lo storico)
        const customOpt = document.getElementById('custom-home-option');
        if (customOpt && locationSelect.value !== customOpt.value) {
            if (homeMarker) {
                radarMap.removeLayer(homeMarker);
                homeMarker = null;
            }
            customOpt.remove();
            homeLat = null;
            homeLon = null;
        }
    });

    // Auto-run on load
    setTimeout(runInference, 400);

    // ── RAINVIEWER ────────────────────────────────────────────────────────────
    async function loadRainViewer() {
        try {
            const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
            const data = await res.json();
            latestRainTime = data.radar.past[data.radar.past.length - 1].time;
        } catch (e) {
            console.warn('RainViewer not available:', e);
        }
    }

    function updateRadarLayer() {
        if (!radarMap) return;

        // Rimuovi layer pioggia
        if (rainLayer) {
            radarMap.removeLayer(rainLayer);
            rainLayer = null;
        }
        // Rimuovi layer notte
        if (dayNightLayer) {
            radarMap.removeLayer(dayNightLayer);
            dayNightLayer = null;
        }

        if ((currentLayer === 'precip' || currentLayer === 'all') && latestRainTime) {
            const url = `https://tilecache.rainviewer.com/v2/radar/${latestRainTime}/256/{z}/{x}/{y}/2/1_1.png`;
            rainLayer = L.tileLayer(url, { opacity: 0.7, zIndex: 10 }).addTo(radarMap);
        }

        if (currentLayer === 'daynight') {
            const now = new Date(Date.now() + currentHourOffset * 3600 * 1000);
            drawDayNightLayer(now);
        }

        // Rimuovi clouds se cambi layer
        if (cloudsLayer) {
            radarMap.removeLayer(cloudsLayer);
            cloudsLayer = null;
        }

        if (currentLayer === 'clouds') {
            drawCloudsLayer();
        }

        // Rimuovi marker speciali se cambi layer
        if (!['aurora','hazards','amazing'].includes(currentLayer)) {
            clearEventMarkers();
        }
        if (currentLayer === 'aurora')   fetchAuroraLayer();
        if (currentLayer === 'hazards')  fetchHazardsLayer();
        if (currentLayer === 'amazing')  fetchAmazingLayer();
    }

// ── CLOUDS LAYER (Open-Meteo via canvas tile) ──────────────────────────────
async function drawCloudsLayer() {
    // Open-Meteo non ha tile server: usiamo il suo API puntuale per
    // colorare ogni tile canvas in base alla copertura nuvolosa interpolata.
    // Per semplicità usiamo un GridLayer che campiona Open-Meteo sulla bbox.
    cloudsLayer = L.GridLayer.extend({
        createTile: function(coords) {
            const tile = document.createElement('canvas');
            const size = this.getTileSize();
            tile.width  = size.x;
            tile.height = size.y;
            const ctx = tile.getContext('2d');
            const TILE = 256;

            // Calcola centro geografico del tile
            const worldX = (coords.x + 0.5) / Math.pow(2, coords.z);
            const worldY = (coords.y + 0.5) / Math.pow(2, coords.z);
            const lng = worldX * 360 - 180;
            const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * worldY)));
            const lat = latRad * 180 / Math.PI;

            // Fetch async: riempiamo il tile quando arriva la risposta
            fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lng.toFixed(2)}&hourly=cloudcover&forecast_days=1&timezone=UTC`)
                .then(r => r.json())
                .then(data => {
                    const cc = data?.hourly?.cloudcover?.[currentHourOffset] ?? 0;
                    const alpha = (cc / 100) * 0.65;
                    ctx.fillStyle = `rgba(180, 200, 220, ${alpha})`;
                    ctx.fillRect(0, 0, TILE, TILE);
                })
                .catch(() => {});

            return tile;
        }
    });
    cloudsLayer = new cloudsLayer({ zIndex: 6, opacity: 1, tileSize: 256 }).addTo(radarMap);
}

// ── CLEAR EVENT MARKERS ────────────────────────────────────────────────────
function clearEventMarkers() {
    eventMarkers.forEach(m => radarMap.removeLayer(m));
    eventMarkers = [];
}

// ── AURORA LAYER (NOAA SWPC) ───────────────────────────────────────────────
async function fetchAuroraLayer() {
    clearEventMarkers();
    try {
        // NOAA SWPC: previsione aurora 3 giorni
        const res = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json');
        const raw = await res.json();
        // raw[0] è l'header, poi le righe: [time, kp, observed, noaa_scale]
        const forecasts = raw.slice(1).filter(r => r[1] !== null);

        // Mappa Kp → latitudine minima visibilità aurora
        // Kp9=~40°, Kp5=~60°, Kp3=~70°
        const kpToLat = kp => Math.max(40, 90 - kp * 5.5);

        const now = Date.now();
        forecasts.forEach(row => {
            const time  = new Date(row[0]).getTime();
            const kp    = parseFloat(row[1]);
            const days  = Math.round((time - now) / 86400000);
            if (kp < 2 || days > 7 || days < 0) return;

            const minLat = kpToLat(kp);
            // Piazza marker su auroral oval (nord e sud)
            [minLat, -minLat].forEach(lat => {
                [-120, -60, 0, 60, 120].forEach(lon => {
                    const el = document.createElement('div');
                    el.className = 'event-marker aurora';
                    el.textContent = '🌌';
                    const icon = L.divIcon({ className:'', html: el.outerHTML, iconSize:[32,32], iconAnchor:[16,16] });
                    const label = days === 0 ? 'Stasera' : `upcoming in ${days} day${days > 1 ? 's' : ''}`;
                    const marker = L.marker([lat, lon], { icon })
                        .bindPopup(`<div class="custom-popup event-popup">
                            <div class="ep-title">🌌 Aurora Boreale</div>
                            <div class="ep-desc">Kp previsto: <strong>${kp.toFixed(1)}</strong> — visibile da ${minLat.toFixed(0)}° lat</div>
                            <span class="ep-days">${label}</span>
                        </div>`, { closeButton: false, className: 'leaflet-custom-popup' })
                        .addTo(radarMap);
                    eventMarkers.push(marker);
                });
            });
        });
    } catch(e) { console.error('Aurora fetch error:', e); }
}

// ── HAZARDS LAYER (NASA EONET) ─────────────────────────────────────────────
async function fetchHazardsLayer() {
    clearEventMarkers();
    const ICONS = {
        'Wildfires':          { emoji: '🔥', cls: 'hazard' },
        'Floods':             { emoji: '🌊', cls: 'hazard' },
        'Severe Storms':      { emoji: '⛈️',  cls: 'hazard' },
        'Tropical Cyclones':  { emoji: '🌀', cls: 'hazard' },
        'Volcanoes':          { emoji: '🌋', cls: 'hazard' },
    };
    try {
        const res  = await fetch('https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=100&days=7');
        const data = await res.json();
        const now  = Date.now();

        data.events.forEach(evt => {
            const cat   = evt.categories?.[0]?.title;
            const meta  = ICONS[cat];
            if (!meta) return;

            const geo   = evt.geometry?.[0];
            if (!geo || geo.type !== 'Point') return;
            const [lon, lat] = geo.coordinates;

            const evtDate = new Date(geo.date).getTime();
            const days    = Math.max(0, Math.round((evtDate - now) / 86400000));
            const label   = days === 0 ? 'In corso' : `upcoming in ${days} day${days > 1 ? 's' : ''}`;

            const el = document.createElement('div');
            el.className = `event-marker ${meta.cls}`;
            el.textContent = meta.emoji;
            const icon = L.divIcon({ className:'', html: el.outerHTML, iconSize:[32,32], iconAnchor:[16,16] });

            const marker = L.marker([lat, lon], { icon })
                .bindPopup(`<div class="custom-popup event-popup">
                    <div class="ep-title">${meta.emoji} ${evt.title}</div>
                    <div class="ep-desc">${cat}</div>
                    <span class="ep-days">${label}</span>
                </div>`, { closeButton: false, className: 'leaflet-custom-popup' })
                .addTo(radarMap);
            eventMarkers.push(marker);
        });
    } catch(e) { console.error('EONET fetch error:', e); }
}

// ── AMAZING LAYER (NASA eclissi + mock festival) ───────────────────────────
async function fetchAmazingLayer() {
    clearEventMarkers();
    const now = Date.now();

    // --- NASA eclissi lunari (MPC / hardcoded prossimi eventi noti) ---
    // NASA non ha un endpoint diretto per eclissi future: usiamo un set
    // di dati hardcoded aggiornabili, standard per questo tipo di app.
    const eclipses = [
        { date: '2025-03-14', lat: 20,  lon: -100, type: 'Eclissi Lunare Totale',   emoji: '🌕', zones: 'Americhe, Europa occidentale' },
        { date: '2025-09-07', lat: 15,  lon:   60, type: 'Eclissi Lunare Totale',   emoji: '🌕', zones: 'Europa, Africa, Asia' },
        { date: '2026-02-17', lat: -30, lon:   30, type: 'Eclissi Lunare Penombrale',emoji: '🌖', zones: 'Africa, Asia, Oceania' },
    ];

    // --- Mock festival lunari ---
    const festivals = [
        { date: '2025-04-12', lat: 27.5,  lon:  85.3, name: 'Pasqua / Vesak',          emoji: '🪔', desc: 'Festival lunare primavera' },
        { date: '2025-10-06', lat: 22.3,  lon:  87.3, name: 'Durga Puja',              emoji: '🎆', desc: 'Festival ciclo luna piena' },
        { date: '2025-09-29', lat: 35.6,  lon: 139.7, name: 'Mid-Autumn Festival',     emoji: '🏮', desc: 'Luna piena autunnale' },
    ];

    [...eclipses, ...festivals].forEach(evt => {
        const evtDate = new Date(evt.date).getTime();
        const days    = Math.round((evtDate - now) / 86400000);
        if (days < -1 || days > 7) return; // solo entro 7 giorni

        const label = days < 0  ? 'Concluso'
                    : days === 0 ? 'Oggi!'
                    : `upcoming in ${days} day${days > 1 ? 's' : ''}`;

        const el = document.createElement('div');
        el.className = 'event-marker amazing';
        el.textContent = evt.emoji;
        const icon = L.divIcon({ className:'', html: el.outerHTML, iconSize:[32,32], iconAnchor:[16,16] });

        const title = evt.type || evt.name;
        const desc  = evt.zones || evt.desc || '';

        const marker = L.marker([evt.lat, evt.lon], { icon })
            .bindPopup(`<div class="custom-popup event-popup">
                <div class="ep-title">${evt.emoji} ${title}</div>
                <div class="ep-desc">${desc}</div>
                <span class="ep-days">${label}</span>
            </div>`, { closeButton: false, className: 'leaflet-custom-popup' })
            .addTo(radarMap);
        eventMarkers.push(marker);
    });
}

    // Calcola la posizione del Sole (algoritmo semplificato NOAA)
function getSunPosition(date) {
    const J2000 = 2451545.0;
    const jd = date.getTime() / 86400000 + 2440587.5;
    const n = jd - J2000;
    const L = (280.46 + 0.9856474 * n) % 360;
    const g = ((357.528 + 0.9856003 * n) % 360) * Math.PI / 180;
    const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * Math.PI / 180;
    const epsilon = 23.439 * Math.PI / 180;
    const sinDec = Math.sin(epsilon) * Math.sin(lambda);
    const dec = Math.asin(sinDec) * 180 / Math.PI;
    const RA = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) * 12 / Math.PI;
    const GMST = (6.697375 + 0.0657098242 * n + date.getUTCHours() + date.getUTCMinutes() / 60) % 24;
    const lon = ((RA - GMST) * 15 + 540) % 360 - 180;
    return { lat: dec, lon };
}

function drawDayNightLayer(date) {
    const sunPos = getSunPosition(date);

    dayNightLayer = L.GridLayer.extend({
        createTile: function(coords) {
            const tile = document.createElement('canvas');
            const size = this.getTileSize();
            tile.width  = size.x;
            tile.height = size.y;
            const ctx = tile.getContext('2d');

            const TILE = 256;
            const imageData = ctx.createImageData(TILE, TILE);
            const data = imageData.data;

            const sunLatRad = sunPos.lat * Math.PI / 180;

            for (let px = 0; px < TILE; px++) {
                for (let py = 0; py < TILE; py++) {
                    // Converti pixel tile → coordinate geografiche (proiezione Web Mercator)
                    const worldX = (coords.x + px / TILE) / Math.pow(2, coords.z);
                    const worldY = (coords.y + py / TILE) / Math.pow(2, coords.z);
                    const lng = worldX * 360 - 180;
                    const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * worldY)));
                    const lat = latRad * 180 / Math.PI;

                    // Calcola altitudine solare per questo punto
                    const lngDiffRad = (lng - sunPos.lon) * Math.PI / 180;
                    const sinAlt = Math.sin(sunLatRad) * Math.sin(latRad)
                                 + Math.cos(sunLatRad) * Math.cos(latRad) * Math.cos(lngDiffRad);

                    if (sinAlt < 0) {
                        // Zona notturna: più scuro quanto più sotto l'orizzonte
                        const depth = Math.min(1, -sinAlt * 3);
                        const idx = (py * TILE + px) * 4;
                        data[idx]     = 10;   // R
                        data[idx + 1] = 15;   // G
                        data[idx + 2] = 46;   // B
                        data[idx + 3] = Math.round(depth * 160); // alpha max 160/255
                    }
                    // Zona diurna: lascia trasparente
                }
            }

            ctx.putImageData(imageData, 0, 0);
            return tile;
        }
    });

    dayNightLayer = new dayNightLayer({ zIndex: 5, opacity: 1 }).addTo(radarMap);
}

    // ── SUMMARY CARD ──────────────────────────────────────────────────────────
    function renderSummaryCard(cell, locationName) {
        if (!cell) return;
        summaryLocation.textContent = locationName;
        summaryTemp.textContent = `${cell.temp}°`;
        summaryPrecip.textContent = `${cell.precip_prob}%`;
        summaryWind.textContent = `${cell.wind_speed} km/h`;

        const iconName = getConditionIcon(cell.condition);
        summaryIcon.setAttribute('data-lucide', iconName);
        lucide.createIcons();
    }

    // ── SELECTED LOCATION CARD ────────────────────────────────────────────────
    function updateSelectedCard(cell, locationName) {
        if (!cell) return;
        selectedLocationData = { cell, locationName };

        selectedLocation.textContent = locationName;
        selectedTemp.textContent = `${cell.temp}°`;
        selectedPrecip.textContent = `${cell.precip_prob}%`;
        selectedWind.textContent = `${cell.wind_speed} km/h`;

        const iconName = getConditionIcon(cell.condition);
        selectedIcon.setAttribute('data-lucide', iconName);

        // Posiziona la card subito sotto la home card
        const homeBottom = summaryCard.offsetTop + summaryCard.offsetHeight;
        selectedCard.style.top = (homeBottom + 12) + 'px';

        selectedCard.style.display = 'block';
        lucide.createIcons();
    }

    function hideSelectedCard() {
        selectedCard.style.display = 'none';
        selectedLocationData = null;
    }

    // "Imposta come Home" dalla selected card
    setHomeBtn.addEventListener('click', () => {
        if (!selectedLocationData) return;
        const { cell, locationName } = selectedLocationData;

        // Aggiorna home lat/lon se disponiamo delle coordinate
        if (baseData?.center_coords) {
            homeLat = baseData.center_coords.lat;
            homeLon = baseData.center_coords.lon;
        }

        // Aggiorna la summary card home
        renderSummaryCard(cell, locationName);

        // Aggiorna option nel select
        const customOpt = document.getElementById('custom-home-option') || document.createElement('option');
        customOpt.id = 'custom-home-option';
        customOpt.value = `${homeLat},${homeLon}`;
        customOpt.textContent = `⌂ ${locationName}`;
        if (!document.getElementById('custom-home-option')) {
            locationSelect.insertBefore(customOpt, locationSelect.firstChild);
        }
        locationSelect.value = customOpt.value;

        // Piazza marker home sulla mappa
        if (homeLat && homeLon) placeHomeMarker(homeLat, homeLon, locationName);

        // Nascondi la selected card
        hideSelectedCard();
    });

    document.getElementById('deselect-btn').addEventListener('click', () => {
        hideSelectedCard();
        if (clickMarker) {
            radarMap.removeLayer(clickMarker);
            clickMarker = null;
            clickLabel = null;
        }
    });

    // ── GRID DISPLAY ──────────────────────────────────────────────────────────
    function updateGridDisplay() {
        if (!baseData) return;

        const simulated = baseData.grid.map(cell => {
            const tempVariation = Math.sin((currentHourOffset / 24) * Math.PI * 2) * -5;
            const precipVariation = currentHourOffset * cell.x_offset * 2;
            return {
                ...cell,
                temp: Math.round((cell.temp + tempVariation) * 10) / 10,
                precip_prob: Math.max(0, Math.min(100, Math.round(cell.precip_prob + precipVariation))),
                wind_dir: (cell.x_offset * 45 + currentHourOffset * 10) % 360
            };
        });

        renderGrid(simulated);
    }

    function renderGrid(cells) {
        weatherGrid.innerHTML = '';
        cells.sort((a, b) => a.y_offset !== b.y_offset ? a.y_offset - b.y_offset : a.x_offset - b.x_offset);

        cells.forEach((cell, i) => {
            const card = document.createElement('div');
            card.className = `cell-card${cell.is_target ? ' target' : ''}`;
            card.style.animationDelay = `${i * 0.012}s`;

            const coords = `[${cell.x_offset >= 0 ? '+' + cell.x_offset : cell.x_offset}, ${cell.y_offset >= 0 ? '+' + cell.y_offset : cell.y_offset}]`;

            let inner = `<div class="cell-coords">${coords}</div>`;

            if (currentLayer === 'temp') {
                const hue = Math.max(0, 240 - cell.temp * 8);
                card.style.backgroundColor = `hsla(${hue}, 65%, 18%, 0.45)`;
                inner += `
                    <div class="cell-temp">${cell.temp}°</div>
                    <i data-lucide="${getConditionIcon(cell.condition)}" class="cell-icon"></i>`;
            } else if (currentLayer === 'precip') {
                const alpha = 0.12 + (cell.precip_prob / 100) * 0.55;
                card.style.backgroundColor = `rgba(34, 211, 238, ${alpha})`;
                inner += `
                    <div class="cell-temp" style="font-size:1.1rem; color:var(--accent)">${cell.precip_prob}%</div>
                    <i data-lucide="cloud-rain" class="cell-icon" style="color:var(--accent)"></i>`;
            } else if (currentLayer === 'wind') {
                const color = cell.wind_speed > 10 ? 'var(--danger)' : 'var(--text)';
                inner += `
                    <div class="cell-temp" style="font-size:1rem; color:${color}">${cell.wind_speed}<span style="font-size:.55rem;margin-left:2px">km/h</span></div>
                    <i data-lucide="navigation" class="cell-icon" style="transform:rotate(${cell.wind_dir}deg);transition:transform .3s"></i>`;
            } else if (currentLayer === 'clouds') {
                const cc = Math.round(Math.random() * 40 + cell.precip_prob * 0.6); // mock locale
                const alpha = 0.08 + (cc / 100) * 0.5;
                card.style.backgroundColor = `rgba(180, 200, 220, ${alpha})`;
                inner += `
                    <i data-lucide="cloud" class="cell-icon" style="color:#94a3b8"></i>
                    <div class="cell-label">${cc}%</div>`;
            } else if (currentLayer === 'aurora' || currentLayer === 'hazards' || currentLayer === 'amazing') {
                card.style.backgroundColor = 'rgba(20,25,45,0.5)';
                inner += `<div style="font-size:0.72rem;color:var(--muted);text-align:center;padding:4px">Vedi mappa</div>`;
            } else if (currentLayer === 'daynight') {
                // Calcola alba e tramonto per questa cella
                const { sunrise, sunset } = calcSunTimes(cell.lat, cell.lon, new Date());
                const isNight = isNightTime(cell.lat, cell.lon, new Date(Date.now() + currentHourOffset * 3600 * 1000));
                card.style.backgroundColor = isNight
                    ? 'rgba(10, 15, 46, 0.6)'
                    : 'rgba(251, 191, 36, 0.08)';
                inner += `
                    <i data-lucide="${isNight ? 'moon' : 'sun'}" class="cell-icon" style="color:${isNight ? '#818cf8' : '#fbbf24'}"></i>
                    <div style="font-size:.65rem;color:#fbbf24;font-family:var(--mono)">▲ ${sunrise}</div>
                    <div style="font-size:.65rem;color:#818cf8;font-family:var(--mono)">▼ ${sunset}</div>`;
            } else {
                // all
                inner += `
                    <div class="cell-temp" style="font-size:1.1rem">${cell.temp}°</div>
                    <div style="font-size:.68rem;color:var(--accent);font-family:var(--mono)">${cell.precip_prob}%</div>
                    <div style="font-size:.65rem;color:var(--muted);font-family:var(--mono)">${cell.wind_speed}km/h</div>`;
            }

            card.innerHTML = inner;
            weatherGrid.appendChild(card);
        });

        lucide.createIcons();
    }

    // Calcola alba e tramonto (algoritmo NOAA semplificato)
    function calcSunTimes(lat, lon, date) {
        const rad = Math.PI / 180;
        const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
        const B = (360 / 365) * (dayOfYear - 81) * rad;
        const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B); // minuti
        const solarNoon = 720 - (lon * 4) - EoT; // minuti dalla mezzanotte UTC
        const decl = 23.45 * Math.sin(B);
        const hourAngle = Math.acos(-Math.tan(lat * rad) * Math.tan(decl * rad)) / rad;
        const sunriseMin = solarNoon - hourAngle * 4;
        const sunsetMin  = solarNoon + hourAngle * 4;
        const fmt = (m) => {
            const h = Math.floor((m % 1440 + 1440) % 1440 / 60);
            const min = Math.floor(((m % 1440 + 1440) % 1440) % 60);
            return `${String(h).padStart(2,'0')}:${String(min).padStart(2,'0')}`;
        };
        return { sunrise: fmt(sunriseMin), sunset: fmt(sunsetMin) };
    }

    function isNightTime(lat, lon, date) {
        const { sunrise, sunset } = calcSunTimes(lat, lon, date);
        const toMin = t => parseInt(t.split(':')[0]) * 60 + parseInt(t.split(':')[1]);
        const now = date.getUTCHours() * 60 + date.getUTCMinutes();
        return now < toMin(sunrise) || now > toMin(sunset);
    }

    // ── HELPERS ───────────────────────────────────────────────────────────────
    function getConditionIcon(condition) {
        const map = {
            'Sunny': 'sun',
            'Partly Cloudy': 'cloud-sun',
            'Rain': 'cloud-drizzle',
            'Thunderstorm': 'cloud-lightning'
        };
        return map[condition] || 'cloud';
    }

    function showLoading(msg = 'Caricamento...') {
        loadingMsg.textContent = msg;
        loadingOverlay.style.display = 'flex';
    }

    function hideLoading() {
        loadingOverlay.style.display = 'none';
    }

});