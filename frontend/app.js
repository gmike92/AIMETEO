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

    const panelLayerBtns  = document.querySelectorAll('.ptab');
    const sideLayerBtns   = document.querySelectorAll('.layer-btn[data-layer]');

    const API_BASE = 'http://127.0.0.1:8000/api';

    function normLon(lon) {
        return ((lon + 180) % 360 + 360) % 360 - 180;
    }

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
    let clickHistory  = [];

    let baseData        = null;
    let currentLayer    = 'temp';
    let selectedLocationData = null;
    let dayNightLayer    = null;
    let cloudsLayer      = null;
    let eventMarkers     = [];
    let currentHourOffset = 0;

    // FIX: sostituiti i canvas appesi a #radar-map con L.imageOverlay,
    // che usa bounds geografici e segue pan/zoom automaticamente.
    let tempImageOverlay   = null;
    let precipImageOverlay = null;

    let windParticleAnim = null;
    let windCanvas       = null;
    let windCtx          = null;
    let windParticles    = [];
    let windFieldData    = null;
    let windFetchPending = false;
    let auroraData       = null;
    let auroraLayer      = null;
    let mapMoveDebounce  = null;

    // ── LEGEND BAR ────────────────────────────────────────────────────────────
    const legendBar      = document.getElementById('legend-bar');
    const legendGradient = document.getElementById('legend-gradient');
    const legendMin      = document.getElementById('legend-min');
    const legendMax      = document.getElementById('legend-max');
    const legendTitle    = document.getElementById('legend-title');

    function showLegend({ gradient, min, max, title }) {
        if (!legendBar) return;
        legendGradient.style.background = gradient;
        legendMin.textContent  = min;
        legendMax.textContent  = max;
        legendTitle.textContent = title;
        legendBar.style.display = 'flex';
    }

    function hideLegend() {
        if (legendBar) legendBar.style.display = 'none';
    }

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
    let settings = {
        layers:   { temp:true, precip:true, wind:true, daynight:true, clouds:true, aurora:true, hazards:true, amazing:true },
        units:    { temp:'C', wind:'kmh', precip:'mm', pressure:'hpa' },
        language: 'it'
    };

    const saved = localStorage.getItem('aimeteo_settings');
    if (saved) {
        try { settings = { ...settings, ...JSON.parse(saved) }; } catch {}
    }

    function applySettings() {
        document.querySelectorAll('.layer-btn[data-layer]').forEach(btn => {
            const layer = btn.dataset.layer;
            btn.style.display = settings.layers[layer] === false ? 'none' : '';
        });
        document.querySelectorAll('.flyout-btn[data-layer]').forEach(btn => {
            const layer = btn.dataset.layer;
            btn.style.display = settings.layers[layer] === false ? 'none' : '';
        });
    }

    function syncSettingsUI() {
        document.querySelectorAll('[data-layer-toggle]').forEach(input => {
            input.checked = settings.layers[input.dataset.layerToggle] !== false;
        });
        document.querySelectorAll('.unit-btn[data-unit]').forEach(btn => {
            btn.classList.toggle('active', settings.units[btn.dataset.unit] === btn.dataset.value);
        });
        document.querySelectorAll('.lang-btn[data-lang]').forEach(btn => {
            btn.classList.toggle('active', settings.language === btn.dataset.lang);
        });
    }

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

    document.querySelectorAll('[data-layer-toggle]').forEach(input => {
        input.addEventListener('change', () => {
            settings.layers[input.dataset.layerToggle] = input.checked;
        });
    });

    document.querySelectorAll('.unit-btn[data-unit]').forEach(btn => {
        btn.addEventListener('click', () => {
            settings.units[btn.dataset.unit] = btn.dataset.value;
            document.querySelectorAll(`.unit-btn[data-unit="${btn.dataset.unit}"]`)
                .forEach(b => b.classList.toggle('active', b === btn));
        });
    });

    document.querySelectorAll('.lang-btn[data-lang]').forEach(btn => {
        btn.addEventListener('click', () => {
            settings.language = btn.dataset.lang;
            document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    settingsSave.addEventListener('click', () => {
        localStorage.setItem('aimeteo_settings', JSON.stringify(settings));
        applySettings();
        closeSettings();
        settingsSave.textContent = '✓ Salvato!';
        setTimeout(() => { settingsSave.textContent = 'Salva impostazioni'; }, 1800);
    });

    applySettings();
    checkStatus();
    setInterval(checkStatus, 10_000);

    // ── LAYER BUTTONS ─────────────────────────────────────────────────────────
    sideLayerBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            sideLayerBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLayer = btn.dataset.layer;
            if (baseData) {
                updateGridDisplay();
                updateRadarLayer();
                panelLayerBtns.forEach(b => b.classList.toggle('active', b.dataset.player === currentLayer));
            }
        });
    });

    panelLayerBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            panelLayerBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLayer = btn.dataset.player;
            if (baseData) {
                updateGridDisplay();
                updateRadarLayer();
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
    document.querySelector('.detail-panel-peek')?.addEventListener('click', openPanel);

    // ── MAP INIT ──────────────────────────────────────────────────────────────
    function initMap(lat, lon) {
        if (radarMap) {
            radarMap.flyTo([lat, lon], 7, { duration: 1.4 });
            radarMap.invalidateSize();
            return;
        }

        radarMap = L.map('radar-map', { zoomControl: true, minZoom: 3 }).setView([lat, lon], 7);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors, © CARTO',
            maxZoom: 19
        }).addTo(radarMap);

        radarMap.on('click', async (e) => {
            const { lat, lng } = e.latlng;

            let label = `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
            try {
                const geo = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`);
                const geoData = await geo.json();
                const city = geoData.address?.city || geoData.address?.town || geoData.address?.village;
                const country = geoData.address?.country_code?.toUpperCase();
                if (city) label = country ? `${city}, ${country}` : city;
            } catch {}

            clickLabel = label;
            placeClickMarker(lat, lng, label);
            await fetchAndShowGrid(lat, lng, label);
        });

        radarMap.on('moveend zoomend', () => {
            clearTimeout(mapMoveDebounce);
            mapMoveDebounce = setTimeout(() => {
                if (currentLayer === 'temp')   refreshTempLayer();
                if (currentLayer === 'wind')   refreshWindLayer();
                if (currentLayer === 'precip') updateRadarLayer();
                if (currentLayer === 'clouds') {
                    if (cloudsLayer) { radarMap.removeLayer(cloudsLayer); cloudsLayer = null; }
                    drawCloudsLayer();
                }
                if (currentLayer === 'aurora') renderAuroraMarkers();
            }, 250);
        });
    }

    // ── MARKERS ───────────────────────────────────────────────────────────────
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
            iconAnchor: [6, 22]
        });

        const popupContent = () => {
            const div = document.createElement('div');
            div.className = 'custom-popup';
            div.innerHTML = `
                <div class="popup-title">
                    <i data-lucide="map-pin"></i>
                    <span>${label}</span>
                </div>
                <div style="font-size:0.72rem;color:var(--muted);font-family:var(--mono);margin-bottom:10px">
                    ${lat.toFixed(5)}, ${lon.toFixed(5)}
                </div>
                <div class="popup-actions">
                    <button class="popup-btn set-home" style="flex:1;background:rgba(99,102,241,0.12);color:#a5b4fc;border:1px solid rgba(99,102,241,0.3);border-radius:8px;padding:6px 10px;font-family:var(--font);font-size:0.75rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px;">
                        <i data-lucide="home"></i> Imposta Home
                    </button>
                    <button class="popup-btn remove" style="background:rgba(244,63,94,0.1);color:#fda4af;border:1px solid rgba(244,63,94,0.25);border-radius:8px;padding:6px 10px;font-family:var(--font);font-size:0.75rem;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                        <i data-lucide="x"></i>
                    </button>
                </div>`;

            setTimeout(() => lucide.createIcons({ nodes: [div] }), 0);

            div.querySelector('.set-home').addEventListener('click', () => {
                homeLat = lat;
                homeLon = lon;
                if (baseData?.center_coords) {
                    homeLat = baseData.center_coords.lat;
                    homeLon = baseData.center_coords.lon;
                }

                clickHistory = clickHistory.filter(h => h.value !== `${lat},${lon}`);
                clickHistory.unshift({ label, value: `${lat},${lon}` });
                if (clickHistory.length > 5) clickHistory.pop();
                rebuildHistoryOptions();

                placeHomeMarker(lat, lon, label);
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
        if (homeMarker) {
            radarMap.removeLayer(homeMarker);
            homeMarker = null;
        }
        const customOpt = document.getElementById('custom-home-option');
        if (customOpt) customOpt.remove();
        locationSelect.selectedIndex = 0;
        homeLat = null;
        homeLon = null;
    }

    function rebuildHistoryOptions() {
        document.querySelectorAll('.history-option').forEach(o => o.remove());

        let group = document.getElementById('history-group');
        if (!group) {
            group = document.createElement('optgroup');
            group.id = 'history-group';
            group.label = 'Recenti';
            locationSelect.appendChild(group);
        }
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

    // ── FETCH GRID ────────────────────────────────────────────────────────────
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

    // ── MAIN INFERENCE ────────────────────────────────────────────────────────
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

            loadingMsg.textContent = 'Running AI inference...';
            const response = await fetch(`${API_BASE}/forecast?lat=${lat}&lon=${lon}`);
            if (!response.ok) throw new Error('API Error');
            const data = await response.json();
            baseData = { ...data, locationName };

            renderSummaryCard(data.grid.find(c => c.is_target), locationName);
            summaryCard.style.display = 'block';

            hideSelectedCard();
            if (clickMarker) {
                radarMap.removeLayer(clickMarker);
                clickMarker = null;
                clickLabel = null;
            }

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

        // Cleanup tutti i layer attivi
        if (rainLayer)     { radarMap.removeLayer(rainLayer);     rainLayer = null; }
        if (dayNightLayer) { radarMap.removeLayer(dayNightLayer); dayNightLayer = null; }
        if (cloudsLayer)   { radarMap.removeLayer(cloudsLayer);   cloudsLayer = null; }
        removeTempOverlay();
        removePrecipOverlay();
        stopWindParticles();
        hideLegend();
        if (!['aurora','hazards','amazing'].includes(currentLayer)) clearEventMarkers();

        if (currentLayer === 'precip' || currentLayer === 'all') {
            const showPrecipTiles = () => {
                if (latestRainTime) {
                    const url = `https://tilecache.rainviewer.com/v2/radar/${latestRainTime}/256/{z}/{x}/{y}/2/1_1.png`;
                    rainLayer = L.tileLayer(url, { opacity: 0.7, zIndex: 10, maxZoom: 19, minZoom: 1 }).addTo(radarMap);
                } else {
                    refreshPrecipFallbackLayer();
                }
            };
            if (latestRainTime) {
                showPrecipTiles();
            } else {
                loadRainViewer().then(showPrecipTiles);
            }
            if (currentLayer === 'precip') showLegend({
                gradient: 'linear-gradient(to right, rgba(34,211,238,0.2), #22d3ee, #0ea5e9, #6366f1, #a21caf)',
                min: '0%', max: '100%', title: 'Probabilità precipitazioni'
            });
        }
        if (currentLayer === 'temp')     refreshTempLayer();
        if (currentLayer === 'wind')     refreshWindLayer();
        if (currentLayer === 'daynight') drawDayNightLayer(new Date(Date.now() + currentHourOffset * 3600000));
        if (currentLayer === 'clouds')   drawCloudsLayer();
        if (currentLayer === 'aurora')   fetchAuroraLayer();
        if (currentLayer === 'hazards')  fetchHazardsLayer();
        if (currentLayer === 'amazing')  fetchAmazingLayer();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // PRECIPITAZIONI FALLBACK
    // FIX: il canvas viene renderizzato offscreen con coordinate geografiche,
    // poi passato a L.imageOverlay(dataUrl, bounds) che gestisce il posizionamento.
    // ═══════════════════════════════════════════════════════════════════════════
    const precipCache = new Map();
    let precipFetchId = 0;

    function precipToColor(prob) {
        if (prob < 5)  return [34, 211, 238, 0];
        if (prob < 20) return [34, 211, 238, Math.round(prob * 1.5)];
        if (prob < 50) return [14, 165, 233, Math.round(80 + prob)];
        if (prob < 80) return [99, 102, 241, Math.round(120 + prob * 0.8)];
        return [162, 28, 175, Math.round(160 + prob * 0.6)];
    }

    function removePrecipOverlay() {
        if (precipImageOverlay) {
            radarMap.removeLayer(precipImageOverlay);
            precipImageOverlay = null;
        }
    }

    async function refreshPrecipFallbackLayer() {
        if (!radarMap) return;
        removePrecipOverlay();
        const fetchId = ++precipFetchId;

        const zoom   = radarMap.getZoom();
        const bounds = radarMap.getBounds();

        const GRID = zoom <= 4 ? 6 : zoom <= 7 ? 9 : 12;
        const SNAP = zoom <= 5 ? 2.0 : zoom <= 8 ? 0.5 : 0.25;

        const latMin = bounds.getSouth(), latMax = bounds.getNorth();
        const lonMin = bounds.getWest(),  lonMax = bounds.getEast();

        const lats = [], lons = [];
        for (let i = 0; i <= GRID; i++) lats.push(+(Math.round((latMin + (latMax-latMin)*(i/GRID)) / SNAP) * SNAP).toFixed(2));
        for (let j = 0; j <= GRID; j++) lons.push(+normLon(Math.round((lonMin + (lonMax-lonMin)*(j/GRID)) / SNAP) * SNAP).toFixed(2));

        const missing = [];
        lats.forEach((la) => lons.forEach((lo) => {
            const key = `prec_${la}_${lo}_${currentHourOffset}`;
            if (!precipCache.has(key)) missing.push({ la, lo, key });
        }));

        if (missing.length > 0) {
            const latStr = missing.map(p => p.la).join(',');
            const lonStr = missing.map(p => p.lo).join(',');
            try {
                const r = await fetch(
                    `https://api.open-meteo.com/v1/forecast?latitude=${latStr}&longitude=${lonStr}` +
                    `&hourly=precipitation_probability&forecast_days=2&timezone=UTC&timeformat=unixtime`
                );
                if (fetchId !== precipFetchId) return;
                const d = await r.json();
                const results = Array.isArray(d) ? d : [d];
                results.forEach((res, idx) => {
                    const val = res?.hourly?.precipitation_probability?.[currentHourOffset] ?? 0;
                    if (missing[idx]) precipCache.set(missing[idx].key, val);
                });
            } catch {}
        }

        if (fetchId !== precipFetchId) return;

        const grid = lats.map(la => lons.map(lo => {
            const key = `prec_${la}_${lo}_${currentHourOffset}`;
            return precipCache.get(key) ?? 0;
        }));

        // Render offscreen: le coordinate pixel sono calcolate direttamente
        // in spazio geografico, NON in pixel schermo. L.imageOverlay si occupa
        // di mappare i bounds geografici ai pixel corretti durante pan/zoom.
        const RW = 256, RH = 256;
        const offscreen = document.createElement('canvas');
        offscreen.width = RW;
        offscreen.height = RH;
        const ctx = offscreen.getContext('2d');
        const imgData = ctx.createImageData(RW, RH);
        const data = imgData.data;

        for (let py = 0; py < RH; py++) {
            for (let px = 0; px < RW; px++) {
                // Interpola in spazio geografico (lat decresce top→bottom)
                const lat = latMax - (py / (RH - 1)) * (latMax - latMin);
                const lng = lonMin + (px / (RW - 1)) * (lonMax - lonMin);

                const fi  = (lat - lats[0]) / (lats[GRID] - lats[0]) * GRID;
                const fj  = (lng - lons[0]) / (lons[GRID] - lons[0]) * GRID;
                const ii  = Math.max(0, Math.min(GRID-1, Math.floor(fi)));
                const jj  = Math.max(0, Math.min(GRID-1, Math.floor(fj)));
                const di  = fi - ii, dj = fj - jj;
                const prob = grid[ii][jj]             * (1-di) * (1-dj)
                           + (grid[ii][jj+1]   || 0)  * (1-di) * dj
                           + (grid[ii+1]?.[jj]  || 0) * di     * (1-dj)
                           + (grid[ii+1]?.[jj+1]|| 0) * di     * dj;
                const [r,g,b,a] = precipToColor(prob);
                const k = (py * RW + px) * 4;
                data[k]=r; data[k+1]=g; data[k+2]=b; data[k+3]=a;
            }
        }
        ctx.putImageData(imgData, 0, 0);

        const dataUrl = offscreen.toDataURL();
        precipImageOverlay = L.imageOverlay(dataUrl, bounds, { opacity: 0.85, zIndex: 10 }).addTo(radarMap);
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // TEMPERATURA
    // FIX: stesso approccio di precipitazioni — canvas offscreen → L.imageOverlay
    // ═══════════════════════════════════════════════════════════════════════════
    const tempCache  = new Map();
    let tempFetchId  = 0;

    const TEMP_LUT = (() => {
        const lut = new Uint8Array(58 * 3);
        const stops = [
            [-15,  20,  30, 160],
            [  0,  30, 140, 220],
            [ 10,  40, 200, 180],
            [ 20,  60, 220,  80],
            [ 28, 240, 200,  30],
            [ 35, 240,  80,  20],
            [ 42, 180,  10,  10],
        ];
        for (let ti = -15; ti <= 42; ti++) {
            let r=180, g=10, b=10;
            for (let s=0; s<stops.length-1; s++) {
                const [at,ar,ag,ab] = stops[s];
                const [bt,br,bg,bb] = stops[s+1];
                if (ti >= at && ti <= bt) {
                    const f = (ti-at)/(bt-at);
                    r=Math.round(ar+f*(br-ar)); g=Math.round(ag+f*(bg-ag)); b=Math.round(ab+f*(bb-ab));
                    break;
                }
            }
            const idx = (ti+15)*3;
            lut[idx]=r; lut[idx+1]=g; lut[idx+2]=b;
        }
        return lut;
    })();

    function removeTempOverlay() {
        if (tempImageOverlay) {
            radarMap.removeLayer(tempImageOverlay);
            tempImageOverlay = null;
        }
    }

    async function refreshTempLayer() {
        if (!radarMap) return;
        const fetchId = ++tempFetchId;

        const zoom   = radarMap.getZoom();
        const bounds = radarMap.getBounds();

        const GRID = zoom <= 4 ? 6 : zoom <= 7 ? 9 : 12;
        const SNAP = zoom <= 5 ? 2.0 : zoom <= 8 ? 0.5 : 0.25;

        const latMin = bounds.getSouth(), latMax = bounds.getNorth();
        const lonMin = bounds.getWest(),  lonMax = bounds.getEast();

        const lats = [], lons = [];
        for (let i = 0; i <= GRID; i++) lats.push(+(Math.round((latMin + (latMax-latMin)*(i/GRID)) / SNAP) * SNAP).toFixed(2));
        for (let j = 0; j <= GRID; j++) lons.push(+normLon(Math.round((lonMin + (lonMax-lonMin)*(j/GRID)) / SNAP) * SNAP).toFixed(2));

        const missing = [];
        lats.forEach((la, i) => lons.forEach((lo, j) => {
            const key = `${la}_${normLon(lo)}_${currentHourOffset}`;
            if (!tempCache.has(key)) missing.push({ la, lo, key, i, j });
        }));

        if (missing.length > 0) {
            const CHUNK = 40;
            for (let c = 0; c < missing.length; c += CHUNK) {
                if (fetchId !== tempFetchId) return;
                const chunk = missing.slice(c, c + CHUNK);
                const latStr = chunk.map(p => p.la).join(',');
                const lonStr = chunk.map(p => p.lo).join(',');
                try {
                    const r = await fetch(
                        `https://api.open-meteo.com/v1/forecast?latitude=${latStr}&longitude=${lonStr}` +
                        `&hourly=temperature_2m&forecast_days=2&timezone=UTC&timeformat=unixtime`
                    );
                    if (fetchId !== tempFetchId) return;
                    const d = await r.json();
                    const results = Array.isArray(d) ? d : [d];
                    results.forEach((res, idx) => {
                        const val = res?.hourly?.temperature_2m?.[currentHourOffset] ?? null;
                        if (val !== null && chunk[idx]) tempCache.set(chunk[idx].key, val);
                    });
                } catch {}
            }
        }

        if (fetchId !== tempFetchId) return;

        const grid = lats.map(la => lons.map(lo => {
            const key = `${la}_${normLon(lo)}_${currentHourOffset}`;
            return tempCache.get(key) ?? null;
        }));
        const allVals = grid.flat().filter(v => v !== null);
        const fallback = allVals.length ? allVals.reduce((a,b)=>a+b,0)/allVals.length : 15;
        grid.forEach(row => { for(let j=0;j<row.length;j++) if(row[j]===null) row[j]=fallback; });

        const RW = 256, RH = 256;
        const offscreen = document.createElement('canvas');
        offscreen.width = RW;
        offscreen.height = RH;
        const ctx = offscreen.getContext('2d', { willReadFrequently: false });
        const imgData = ctx.createImageData(RW, RH);
        const data = imgData.data;

        const latRange = lats[GRID] - lats[0];
        const lonRange = lons[GRID] - lons[0];

        for (let py = 0; py < RH; py++) {
            // Interpola in spazio geografico (lat decresce top→bottom)
            const lat = latMax - (py / (RH - 1)) * (latMax - latMin);

            for (let px = 0; px < RW; px++) {
                const lng = lonMin + (px / (RW - 1)) * (lonMax - lonMin);

                const fi  = (lat - lats[0]) / latRange * GRID;
                const fj  = (lng - lons[0]) / lonRange * GRID;
                const ii  = Math.max(0, Math.min(GRID-1, fi | 0));
                const jj  = Math.max(0, Math.min(GRID-1, fj | 0));
                const di  = fi - ii, dj = fj - jj;

                const t = grid[ii][jj]     * (1-di) * (1-dj)
                        + grid[ii][jj+1]   * (1-di) * dj
                        + grid[ii+1][jj]   * di     * (1-dj)
                        + grid[ii+1][jj+1] * di     * dj;

                const ti  = Math.max(0, Math.min(57, (t + 15 + 0.5) | 0));
                const ci  = ti * 3;
                const k   = (py * RW + px) * 4;
                data[k]   = TEMP_LUT[ci];
                data[k+1] = TEMP_LUT[ci+1];
                data[k+2] = TEMP_LUT[ci+2];
                data[k+3] = 200;
            }
        }
        ctx.putImageData(imgData, 0, 0);

        if (fetchId !== tempFetchId) return;

        // Rimuovi vecchio overlay e crea il nuovo ancorato ai bounds geografici.
        // Leaflet gestirà automaticamente le trasformazioni CSS durante pan/zoom.
        removeTempOverlay();
        const dataUrl = offscreen.toDataURL();
        tempImageOverlay = L.imageOverlay(dataUrl, bounds, {
            opacity: 0.75,
            zIndex: 8
        }).addTo(radarMap);

        showLegend({
            gradient: 'linear-gradient(to right, #141e9f, #1e8cdc, #28c8b4, #3cdc50, #f0c81e, #f05014, #b40a0a)',
            min: '−15 °C', max: '42 °C', title: 'Temperatura a 2m'
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // VENTO — Particle flow animation stile Windy
    // FIX: windCanvas aggiunto all'overlayPane di Leaflet (non a #radar-map),
    // e posizionato con L.DomUtil.setPosition per allinearlo correttamente.
    // ═══════════════════════════════════════════════════════════════════════════
    const windCache = new Map();

    async function fetchWindForPoint(lat, lon) {
        const key = `${lat.toFixed(1)}_${normLon(lon).toFixed(1)}_${currentHourOffset}`;
        if (windCache.has(key)) return windCache.get(key);
        try {
            const r = await fetch(
                `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${normLon(lon).toFixed(2)}&hourly=wind_speed_10m,wind_direction_10m&forecast_days=2&timezone=UTC`
            );
            const d = await r.json();
            const speed = d?.hourly?.wind_speed_10m?.[currentHourOffset] ?? 0;
            const dir   = d?.hourly?.wind_direction_10m?.[currentHourOffset] ?? 0;
            const val   = { speed, dir };
            windCache.set(key, val);
            return val;
        } catch { return { speed: 0, dir: 0 }; }
    }

    function stopWindParticles() {
        if (windParticleAnim) { cancelAnimationFrame(windParticleAnim); windParticleAnim = null; }
        if (windCanvas && windCanvas.parentNode) windCanvas.parentNode.removeChild(windCanvas);
        windCanvas = null; windCtx = null;
        windParticles = []; windFieldData = null;
    }

    async function refreshWindLayer() {
        stopWindParticles();
        if (!radarMap) return;

        const zoom   = radarMap.getZoom();
        const bounds = radarMap.getBounds();

        const numParticles = zoom <= 4 ? 400 : zoom <= 7 ? 800 : 1400;
        const gridStep     = zoom <= 4 ? 6   : zoom <= 6 ? 3   : zoom <= 8 ? 1.5 : 0.5;

        const latMin = bounds.getSouth(), latMax = bounds.getNorth();
        const lonMin = bounds.getWest(),  lonMax = bounds.getEast();

        const gLats = [], gLons = [];
        for (let la = latMin; la <= latMax + gridStep; la += gridStep) gLats.push(Math.round(la / gridStep) * gridStep);
        for (let lo = lonMin; lo <= lonMax + gridStep; lo += gridStep) gLons.push(normLon(Math.round(lo / gridStep) * gridStep));

        const maxPoints = 64;
        const skipL = Math.max(1, Math.ceil(gLats.length * gLons.length / maxPoints));
        const allPoints = [];
        gLats.forEach(la => gLons.forEach(lo => allPoints.push({ lat: la, lon: lo })));
        const samplePts = allPoints.filter((_, i) => i % skipL === 0);

        const windPts = await Promise.all(samplePts.map(p => fetchWindForPoint(p.lat, p.lon).then(v => ({ ...p, ...v }))));

        windFieldData = { pts: windPts, latMin, latMax, lonMin, lonMax };

        // FIX: appendiamo il canvas all'overlayPane di Leaflet, che si muove
        // con la mappa durante pan, e usiamo L.DomUtil.setPosition per allinearlo
        // all'angolo top-left del viewport corrente.
        const overlayPane = radarMap.getPanes().overlayPane;
        const mapSize = radarMap.getSize();

        windCanvas = document.createElement('canvas');
        windCanvas.width  = mapSize.x;
        windCanvas.height = mapSize.y;
        windCanvas.style.cssText = `position:absolute;pointer-events:none;z-index:15;`;
        overlayPane.appendChild(windCanvas);
        windCtx = windCanvas.getContext('2d');

        // Allinea il canvas all'origine del container
        const mapOrigin = radarMap.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(windCanvas, mapOrigin);

        windParticles = Array.from({ length: numParticles }, () => spawnWindParticle());

        function getWindAt(lat, lon) {
            if (!windFieldData || !windFieldData.pts.length) return { speed: 0, u: 0, v: 0 };
            let wu = 0, wv = 0, wSum = 0;
            for (const p of windFieldData.pts) {
                const d = Math.hypot(lat - p.lat, lon - p.lon) + 0.001;
                const w = 1 / (d * d);
                const rad = p.dir * Math.PI / 180;
                wu += Math.sin(rad) * p.speed * w;
                wv += Math.cos(rad) * p.speed * w;
                wSum += w;
            }
            const u = wu / wSum, v = wv / wSum;
            const speed = Math.hypot(u, v);
            return { speed, u: u / (speed || 1), v: v / (speed || 1) };
        }

        function pixelToLatLon(x, y) {
            const ll = radarMap.containerPointToLatLng(L.point(x, y));
            return { lat: ll.lat, lon: ll.lng };
        }

        function spawnWindParticle() {
            const W = windCanvas.width, H = windCanvas.height;
            return { x: Math.random() * W, y: Math.random() * H, age: Math.random() * 120, maxAge: 80 + Math.random() * 120 };
        }

        function windSpeedToColor(speed) {
            if (speed < 5)  return `rgba(100, 220, 160, `;
            if (speed < 10) return `rgba(80,  200, 240, `;
            if (speed < 20) return `rgba(240, 200, 60,  `;
            if (speed < 30) return `rgba(240, 100, 40,  `;
                            return `rgba(220, 40,  60,  `;
        }

        function animate() {
            const W = windCanvas.width, H = windCanvas.height;

            windCtx.globalCompositeOperation = 'destination-out';
            windCtx.fillStyle = 'rgba(0,0,0,0.06)';
            windCtx.fillRect(0, 0, W, H);
            windCtx.globalCompositeOperation = 'source-over';

            windParticles.forEach((p, idx) => {
                const { lat, lon } = pixelToLatLon(p.x, p.y);
                const w = getWindAt(lat, lon);

                const pixelSpeed = w.speed * (zoom <= 4 ? 0.3 : zoom <= 7 ? 0.5 : 0.8);
                const nx = p.x + w.u * pixelSpeed;
                const ny = p.y - w.v * pixelSpeed;

                const alpha = Math.min(1, (1 - p.age / p.maxAge) * 0.85 + 0.15);
                windCtx.beginPath();
                windCtx.moveTo(p.x, p.y);
                windCtx.lineTo(nx, ny);
                windCtx.strokeStyle = windSpeedToColor(w.speed) + alpha + ')';
                windCtx.lineWidth = zoom <= 4 ? 1 : 1.5;
                windCtx.stroke();

                p.x = nx; p.y = ny; p.age++;

                if (p.age > p.maxAge || p.x < 0 || p.x > W || p.y < 0 || p.y > H) {
                    windParticles[idx] = spawnWindParticle();
                }
            });

            windParticleAnim = requestAnimationFrame(animate);
        }

        animate();

        showLegend({
            gradient: 'linear-gradient(to right, #64dc9f, #50c8f0, #f0c83c, #f06428, #dc283c)',
            min: '0 km/h', max: '30+ km/h', title: 'Velocità vento a 10m'
        });
    }

    function spawnWindParticle() {
        if (!windCanvas) return { x: 0, y: 0, age: 0, maxAge: 100 };
        const W = windCanvas.width, H = windCanvas.height;
        return { x: Math.random() * W, y: Math.random() * H, age: Math.random() * 120, maxAge: 80 + Math.random() * 120 };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // CLOUDS LAYER (L.svgOverlay con bounds geografici — già corretto)
    // ═══════════════════════════════════════════════════════════════════════════
    async function drawCloudsLayer() {
        if (!radarMap) return;

        const bounds = radarMap.getBounds();
        const zoom   = radarMap.getZoom();
        const steps  = zoom >= 8 ? 7 : zoom >= 5 ? 5 : 4;

        const latMin = bounds.getSouth(), latMax = bounds.getNorth();
        const lonMin = bounds.getWest(),  lonMax = bounds.getEast();
        const latStep = (latMax - latMin) / steps;
        const lonStep = (lonMax - lonMin) / steps;

        const points = [];
        for (let i = 0; i <= steps; i++)
            for (let j = 0; j <= steps; j++)
                points.push({ lat: latMin + i * latStep, lon: lonMin + j * lonStep });

        const fetchCloud = async (lat, lon) => {
            try {
                const r = await fetch(
                    `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lon.toFixed(2)}&hourly=cloud_cover&forecast_days=1&timezone=UTC`
                );
                const d = await r.json();
                return d?.hourly?.cloud_cover?.[currentHourOffset] ?? 0;
            } catch { return 0; }
        };

        const samplePoints = points.filter((_, i) => i % 2 === 0).slice(0, 16);
        const coverValues  = await Promise.all(samplePoints.map(p => fetchCloud(p.lat, p.lon)));

        const svgNS = 'http://www.w3.org/2000/svg';
        const svgEl = document.createElementNS(svgNS, 'svg');
        svgEl.setAttribute('xmlns', svgNS);
        svgEl.setAttribute('width', '100%');
        svgEl.setAttribute('height', '100%');

        const defs = document.createElementNS(svgNS, 'defs');
        const grad = document.createElementNS(svgNS, 'radialGradient');
        grad.setAttribute('id', 'cloudGrad');
        grad.setAttribute('cx', '50%'); grad.setAttribute('cy', '50%'); grad.setAttribute('r', '50%');
        const s0 = document.createElementNS(svgNS, 'stop');
        s0.setAttribute('offset', '0%');   s0.setAttribute('stop-color', 'rgba(200,215,230,0.7)');
        const s1 = document.createElementNS(svgNS, 'stop');
        s1.setAttribute('offset', '100%'); s1.setAttribute('stop-color', 'rgba(200,215,230,0)');
        grad.appendChild(s0); grad.appendChild(s1);
        const filter = document.createElementNS(svgNS, 'filter');
        filter.setAttribute('id', 'cloudBlur');
        const feBlur = document.createElementNS(svgNS, 'feGaussianBlur');
        feBlur.setAttribute('stdDeviation', '4');
        filter.appendChild(feBlur);
        defs.appendChild(grad); defs.appendChild(filter);
        svgEl.appendChild(defs);

        samplePoints.forEach((p, i) => {
            const cc = coverValues[i];
            if (cc < 10) return;
            const fx = (p.lon - lonMin) / (lonMax - lonMin);
            const fy = 1 - (p.lat - latMin) / (latMax - latMin);
            const baseR = (1 / steps) * 0.9;
            const rx = baseR * (0.8 + Math.sin(p.lat * 37) * 0.2);
            const ry = baseR * 0.65 * (0.8 + Math.cos(p.lon * 41) * 0.2);
            const ellipse = document.createElementNS(svgNS, 'ellipse');
            ellipse.setAttribute('cx', `${(fx * 100).toFixed(2)}%`);
            ellipse.setAttribute('cy', `${(fy * 100).toFixed(2)}%`);
            ellipse.setAttribute('rx', `${(rx * 100).toFixed(2)}%`);
            ellipse.setAttribute('ry', `${(ry * 100).toFixed(2)}%`);
            ellipse.setAttribute('fill', `url(#cloudGrad)`);
            ellipse.setAttribute('opacity', (0.25 + (cc / 100) * 0.55).toFixed(2));
            ellipse.setAttribute('filter', 'url(#cloudBlur)');
            svgEl.appendChild(ellipse);
        });

        cloudsLayer = L.svgOverlay(svgEl, bounds, { opacity: 1, zIndex: 6 }).addTo(radarMap);
    }

    // ── CLEAR EVENT MARKERS ────────────────────────────────────────────────────
    function clearEventMarkers() {
        eventMarkers.forEach(m => radarMap.removeLayer(m));
        eventMarkers = [];
        if (auroraLayer) { radarMap.removeLayer(auroraLayer); auroraLayer = null; }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // AURORA
    // ═══════════════════════════════════════════════════════════════════════════
    async function fetchAuroraLayer() {
        clearEventMarkers();
        try {
            const res = await fetch('https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json');
            const raw = await res.json();
            const now = Date.now();
            const forecasts = raw.slice(1).filter(r => r[1] !== null).map(row => ({
                time: new Date(row[0]).getTime(),
                kp:   parseFloat(row[1])
            }));

            const seen = new Set();
            auroraData = [];
            const kpToLat = kp => Math.max(40, 90 - kp * 5.5);

            forecasts.forEach(({ time, kp }) => {
                const days = Math.round((time - now) / 86400000);
                if (kp < 2 || days < 0 || days > 7) return;
                const minLat = kpToLat(kp);
                const dedupKey = `${days}_${Math.round(minLat/3)}`;
                if (seen.has(dedupKey)) return;
                seen.add(dedupKey);
                auroraData.push({ days, kp, minLat });
            });

            renderAuroraMarkers();
        } catch(e) { console.error('Aurora fetch error:', e); }
    }

    function renderAuroraMarkers() {
        if (!radarMap || !auroraData) return;

        if (auroraLayer) { radarMap.removeLayer(auroraLayer); auroraLayer = null; }
        eventMarkers = [];

        auroraLayer = L.layerGroup().addTo(radarMap);
        const zoom  = radarMap.getZoom();

        auroraData.forEach(({ days, kp, minLat }) => {
            const label = days === 0 ? 'Stasera' : `tra ${days} ${days > 1 ? 'giorni' : 'giorno'}`;
            const intensity = Math.min(1, kp / 9);
            const alpha = 0.6 + intensity * 0.4;
            const numMarkers = zoom <= 4 ? 12 : zoom <= 6 ? 8 : 5;
            const lonStep = 360 / numMarkers;

            for (let i = 0; i < numMarkers; i++) {
                const baseLon = -180 + i * lonStep;
                const jitter  = Math.sin(days * 2.1 + i * 1.7) * lonStep * 0.38;
                const latJitter = Math.cos(days * 1.3 + i * 2.4) * 4;

                [[minLat + latJitter, baseLon + jitter],
                 [-minLat - latJitter, baseLon + jitter * 0.7]].forEach(([lat, lon]) => {
                    const size = Math.round(28 + intensity * 12);
                    const glow = `rgba(80,120,255,${(0.3 + intensity * 0.5).toFixed(2)})`;
                    const html = `<div style="
                        width:${size}px;height:${size}px;
                        background:radial-gradient(circle, rgba(100,160,255,${alpha.toFixed(2)}) 0%, rgba(40,80,200,0.3) 60%, transparent 100%);
                        border-radius:50%;
                        box-shadow:0 0 ${Math.round(size*0.8)}px ${glow}, 0 0 ${Math.round(size*1.6)}px rgba(60,90,220,0.2);
                        animation:auroraGlow 2s ease-in-out infinite alternate;
                        display:flex;align-items:center;justify-content:center;
                        font-size:${Math.round(size*0.55)}px;
                    ">🌌</div>`;
                    const icon = L.divIcon({ className:'', html, iconSize:[size,size], iconAnchor:[size/2, size/2] });
                    const marker = L.marker([lat, lon], { icon })
                        .bindPopup(`<div class="custom-popup event-popup">
                            <div class="ep-title">🌌 Aurora Boreale/Australe</div>
                            <div class="ep-desc">Kp previsto: <strong>${kp.toFixed(1)}</strong> — visibile da ${minLat.toFixed(0)}° lat</div>
                            <span class="ep-days">${label}</span>
                        </div>`, { closeButton: false, className: 'leaflet-custom-popup' });
                    auroraLayer.addLayer(marker);
                });
            }
        });
    }

    // ── HAZARDS LAYER ─────────────────────────────────────────────────────────
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
                const cat  = evt.categories?.[0]?.title;
                const meta = ICONS[cat];
                if (!meta) return;
                const geo = evt.geometry?.[0];
                if (!geo || geo.type !== 'Point') return;
                const [lon, lat] = geo.coordinates;
                const evtDate = new Date(geo.date).getTime();
                const days    = Math.max(0, Math.round((evtDate - now) / 86400000));
                const label = days === 0 ? 'In corso' : `tra ${days} ${days > 1 ? 'giorni' : 'giorno'}`;
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

    // ── AMAZING LAYER ──────────────────────────────────────────────────────────
    async function fetchAmazingLayer() {
        clearEventMarkers();
        const now = Date.now();
        const eclipses = [
            { date: '2025-03-14', lat: 20,  lon: -100, type: 'Eclissi Lunare Totale',    emoji: '🌕', zones: 'Americhe, Europa occidentale' },
            { date: '2025-09-07', lat: 15,  lon:   60, type: 'Eclissi Lunare Totale',    emoji: '🌕', zones: 'Europa, Africa, Asia' },
            { date: '2026-02-17', lat: -30, lon:   30, type: 'Eclissi Lunare Penombrale', emoji: '🌖', zones: 'Africa, Asia, Oceania' },
        ];
        const festivals = [
            { date: '2025-04-12', lat: 27.5, lon:  85.3, name: 'Pasqua / Vesak',      emoji: '🪔', desc: 'Festival lunare primavera' },
            { date: '2025-10-06', lat: 22.3, lon:  87.3, name: 'Durga Puja',          emoji: '🎆', desc: 'Festival ciclo luna piena' },
            { date: '2025-09-29', lat: 35.6, lon: 139.7, name: 'Mid-Autumn Festival', emoji: '🏮', desc: 'Luna piena autunnale' },
        ];
        [...eclipses, ...festivals].forEach(evt => {
            const evtDate = new Date(evt.date).getTime();
            const days = Math.round((evtDate - now) / 86400000);
            if (days < -1 || days > 7) return;
            const label = days < 0 ? 'Concluso' : days === 0 ? 'Oggi!' : `tra ${days} ${days > 1 ? 'giorni' : 'giorno'}`;
            const el = document.createElement('div');
            el.className = 'event-marker amazing';
            el.textContent = evt.emoji;
            const icon = L.divIcon({ className:'', html: el.outerHTML, iconSize:[32,32], iconAnchor:[16,16] });
            L.marker([evt.lat, evt.lon], { icon })
                .bindPopup(`<div class="custom-popup event-popup">
                    <div class="ep-title">${evt.emoji} ${evt.type || evt.name}</div>
                    <div class="ep-desc">${evt.zones || evt.desc || ''}</div>
                    <span class="ep-days">${label}</span>
                </div>`, { closeButton: false, className: 'leaflet-custom-popup' })
                .addTo(radarMap);
        });
    }

    // ── SUN POSITION + DAY/NIGHT ──────────────────────────────────────────────
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
        const RA  = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda)) * 12 / Math.PI;
        const GMST = (6.697375 + 0.0657098242 * n + date.getUTCHours() + date.getUTCMinutes() / 60) % 24;
        const lon = ((RA - GMST) * 15 + 540) % 360 - 180;
        return { lat: dec, lon };
    }

    function drawDayNightLayer(date) {
        const sunPos = getSunPosition(date);
        const DayNightGridLayer = L.GridLayer.extend({
            createTile: function(coords) {
                const tile = document.createElement('canvas');
                const size = this.getTileSize();
                tile.width  = size.x;
                tile.height = size.y;
                const ctx   = tile.getContext('2d');
                const TILE  = 256;
                const imageData = ctx.createImageData(TILE, TILE);
                const data  = imageData.data;
                const sunLatRad = sunPos.lat * Math.PI / 180;
                for (let px = 0; px < TILE; px++) {
                    for (let py = 0; py < TILE; py++) {
                        const worldX = (coords.x + px / TILE) / Math.pow(2, coords.z);
                        const worldY = (coords.y + py / TILE) / Math.pow(2, coords.z);
                        const lng    = worldX * 360 - 180;
                        const latRad = Math.atan(Math.sinh(Math.PI * (1 - 2 * worldY)));
                        const lngDiffRad = (lng - sunPos.lon) * Math.PI / 180;
                        const sinAlt = Math.sin(sunLatRad) * Math.sin(latRad)
                                     + Math.cos(sunLatRad) * Math.cos(latRad) * Math.cos(lngDiffRad);
                        if (sinAlt < 0) {
                            const depth = Math.min(1, -sinAlt * 3);
                            const idx = (py * TILE + px) * 4;
                            data[idx]   = 10; data[idx+1] = 15; data[idx+2] = 46;
                            data[idx+3] = Math.round(depth * 160);
                        }
                    }
                }
                ctx.putImageData(imageData, 0, 0);
                return tile;
            }
        });
        dayNightLayer = new DayNightGridLayer({ zIndex: 5, opacity: 1 }).addTo(radarMap);
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

        const homeBottom = summaryCard.offsetTop + summaryCard.offsetHeight;
        selectedCard.style.top = (homeBottom + 12) + 'px';
        selectedCard.style.display = 'block';
        lucide.createIcons();
    }

    function hideSelectedCard() {
        selectedCard.style.display = 'none';
        selectedLocationData = null;
    }

    setHomeBtn.addEventListener('click', () => {
        if (!selectedLocationData) return;
        const { cell, locationName } = selectedLocationData;

        if (baseData?.center_coords) {
            homeLat = baseData.center_coords.lat;
            homeLon = baseData.center_coords.lon;
        }

        renderSummaryCard(cell, locationName);

        const customOpt = document.getElementById('custom-home-option') || document.createElement('option');
        customOpt.id = 'custom-home-option';
        customOpt.value = `${homeLat},${homeLon}`;
        customOpt.textContent = `⌂ ${locationName}`;
        if (!document.getElementById('custom-home-option')) {
            locationSelect.insertBefore(customOpt, locationSelect.firstChild);
        }
        locationSelect.value = customOpt.value;

        if (homeLat && homeLon) placeHomeMarker(homeLat, homeLon, locationName);

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
        cells.sort((a, b) => a.y_offset !== b.y_offset ? a.y_offset - b.y_offset : a.x_offset - b.x_offset);

        const fragment = document.createDocumentFragment();
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
                const cc = Math.round(Math.random() * 40 + cell.precip_prob * 0.6);
                const alpha = 0.08 + (cc / 100) * 0.5;
                card.style.backgroundColor = `rgba(180, 200, 220, ${alpha})`;
                inner += `
                    <i data-lucide="cloud" class="cell-icon" style="color:#94a3b8"></i>
                    <div class="cell-label">${cc}%</div>`;
            } else if (currentLayer === 'aurora' || currentLayer === 'hazards' || currentLayer === 'amazing') {
                card.style.backgroundColor = 'rgba(20,25,45,0.5)';
                inner += `<div style="font-size:0.72rem;color:var(--muted);text-align:center;padding:4px">Vedi mappa</div>`;
            } else if (currentLayer === 'daynight') {
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
                inner += `
                    <div class="cell-temp" style="font-size:1.1rem">${cell.temp}°</div>
                    <div style="font-size:.68rem;color:var(--accent);font-family:var(--mono)">${cell.precip_prob}%</div>
                    <div style="font-size:.65rem;color:var(--muted);font-family:var(--mono)">${cell.wind_speed}km/h</div>`;
            }

            card.innerHTML = inner;
            fragment.appendChild(card);
        });

        weatherGrid.innerHTML = '';
        weatherGrid.appendChild(fragment);
        lucide.createIcons({ nodes: [weatherGrid] });
    }

    // ── SUN TIMES ─────────────────────────────────────────────────────────────
    function calcSunTimes(lat, lon, date) {
        const rad = Math.PI / 180;
        const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 86400000);
        const B = (360 / 365) * (dayOfYear - 81) * rad;
        const EoT = 9.87 * Math.sin(2 * B) - 7.53 * Math.cos(B) - 1.5 * Math.sin(B);
        const solarNoon = 720 - (lon * 4) - EoT;
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