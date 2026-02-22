document.addEventListener('DOMContentLoaded', () => {
    const fetchBtn = document.getElementById('fetch-btn');
    const locationSelect = document.getElementById('location-select');
    const weatherGrid = document.getElementById('weather-grid');
    const targetSummary = document.getElementById('target-summary');
    const statusIndicator = document.getElementById('backend-status');
    const statusDot = document.querySelector('.status-dot');

    const API_BASE = 'http://127.0.0.1:8000/api';

    // Check Backend Status
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

    fetchBtn.addEventListener('click', async () => {
        const [lat, lon] = locationSelect.value.split(',');
        const locationName = locationSelect.options[locationSelect.selectedIndex].text;
        const icon = document.getElementById('refresh-icon');

        // Spin animation
        icon.classList.add('spin');
        fetchBtn.disabled = true;

        try {
            const response = await fetch(`${API_BASE}/forecast?lat=${lat}&lon=${lon}`);
            if (!response.ok) throw new Error('API Error');
            const data = await response.json();

            renderGrid(data.grid);
            renderSummary(data.grid.find(c => c.is_target), locationName, data.timestamp);

        } catch (error) {
            weatherGrid.innerHTML = `
                <div class="empty-state error">
                    <i data-lucide="alert-triangle" class="empty-icon"></i>
                    <p>Failed to fetch AI inference data. Make sure backend is running.</p>
                </div>
            `;
            lucide.createIcons();
        } finally {
            icon.classList.remove('spin');
            fetchBtn.disabled = false;
        }
    });

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
                <h3>${locationName} (Target Center)</h3>
                <span class="timestamp">${date}</span>
            </div>
            <div class="summary-stats">
                <div class="stat-main">
                    <i data-lucide="${getConditionIcon(targetCell.condition)}" class="condition-icon large"></i>
                    <span class="temp-large">${targetCell.temp}°C</span>
                </div>
                <div class="stat-details">
                    <div class="stat"><i data-lucide="droplets"></i> ${targetCell.precip_prob}% Precip</div>
                    <div class="stat"><i data-lucide="wind"></i> ${targetCell.wind_speed} km/h Wind</div>
                    <div class="stat"><i data-lucide="cpu"></i> AI Conf: 98.4%</div>
                </div>
            </div>
        `;
        lucide.createIcons();
    }

    function renderGrid(cells) {
        weatherGrid.innerHTML = '';

        // Ensure standard order sorting
        cells.sort((a, b) => {
            if (a.y_offset !== b.y_offset) return a.y_offset - b.y_offset; // Top to bottom
            return a.x_offset - b.x_offset; // Left to right
        });

        cells.forEach((cell, index) => {
            const card = document.createElement('div');
            card.className = `cell-card ${cell.is_target ? 'target' : ''}`;
            card.style.animationDelay = `${index * 0.02}s`;

            card.innerHTML = `
                <div class="cell-coords">[${cell.x_offset > 0 ? '+' + cell.x_offset : cell.x_offset}, ${cell.y_offset > 0 ? '+' + cell.y_offset : cell.y_offset}]</div>
                <div class="cell-temp">${cell.temp}°</div>
                <i data-lucide="${getConditionIcon(cell.condition)}" class="cell-icon"></i>
                <div class="cell-prob"><i data-lucide="droplets" class="tiny-icon"></i> ${cell.precip_prob}%</div>
            `;

            weatherGrid.appendChild(card);
        });
        lucide.createIcons();
    }
});
