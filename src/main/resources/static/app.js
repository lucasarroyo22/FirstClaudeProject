// ── State ────────────────────────────────────────────────────
let chartInstance  = null;
let currentSymbol  = null;
let currentPeriod  = 'daily';
let ddActiveIndex  = -1;
let debounceTimer  = null;

// ── DOM refs ─────────────────────────────────────────────────
const input    = document.getElementById('sym');
const dropdown = document.getElementById('dropdown');
const btn      = document.getElementById('searchBtn');

// ── Listeners ────────────────────────────────────────────────
input.addEventListener('input', () => {
  const q = input.value.trim();
  clearTimeout(debounceTimer);
  if (!q) { closeDropdown(); return; }
  debounceTimer = setTimeout(() => fetchSuggestions(q), 280);
});

input.addEventListener('keydown', e => {
  const items = [...dropdown.querySelectorAll('.dd-item')];
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    ddActiveIndex = Math.min(ddActiveIndex + 1, items.length - 1);
    applyActive(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    ddActiveIndex = Math.max(ddActiveIndex - 1, -1);
    applyActive(items);
  } else if (e.key === 'Enter') {
    if (ddActiveIndex >= 0 && items[ddActiveIndex]) items[ddActiveIndex].click();
    else search();
  } else if (e.key === 'Escape') {
    closeDropdown();
  }
});

document.addEventListener('click', e => {
  if (!e.target.closest('.search-wrap')) closeDropdown();
});

btn.addEventListener('click', search);

// ── Autocomplete ─────────────────────────────────────────────
async function fetchSuggestions(q) {
  try {
    const data = await fetch(`/api/search?q=${encodeURIComponent(q)}`).then(r => r.json());
    renderDropdown(data.results || []);
  } catch {
    closeDropdown();
  }
}

function renderDropdown(results) {
  if (!results.length) { closeDropdown(); return; }
  ddActiveIndex = -1;
  dropdown.innerHTML = results.map(r => `
    <div class="dd-item" data-symbol="${esc(r.symbol)}" onclick="selectStock('${esc(r.symbol)}')">
      <span class="dd-symbol">${esc(r.symbol)}</span>
      <span class="dd-name">${esc(r.name)}</span>
      <span class="dd-exchange">${esc(r.exchange)}</span>
    </div>`).join('');
  dropdown.classList.add('open');
}

function applyActive(items) {
  items.forEach((el, i) => el.classList.toggle('active', i === ddActiveIndex));
  if (ddActiveIndex >= 0 && items[ddActiveIndex]) {
    input.value = items[ddActiveIndex].dataset.symbol;
  }
}

function closeDropdown() {
  dropdown.classList.remove('open');
  dropdown.innerHTML = '';
  ddActiveIndex = -1;
}

function selectStock(symbol) {
  input.value = symbol;
  closeDropdown();
  loadStock(symbol);
}

// ── Search ───────────────────────────────────────────────────
function search() {
  const sym = input.value.trim().toUpperCase();
  if (!sym) return;
  closeDropdown();
  loadStock(sym);
}

// ── Stock data ───────────────────────────────────────────────
async function loadStock(symbol) {
  currentSymbol = symbol;
  document.getElementById('out').innerHTML =
    `<div class="status">LOADING ${esc(symbol)} &hellip;</div>`;
  try {
    const data = await fetch(`/api/stock?symbol=${encodeURIComponent(symbol)}`).then(r => r.json());
    if (data.error) {
      document.getElementById('out').innerHTML = `<div class="err">ERROR: ${esc(data.error)}</div>`;
      return;
    }
    renderResults(data);
    loadChart(symbol, currentPeriod);
  } catch {
    document.getElementById('out').innerHTML = `<div class="err">ERROR: Could not reach server.</div>`;
  }
}

// ── Format helpers ───────────────────────────────────────────
function fmt(n) {
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function pct(n)  { return (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'; }
function neg(n)  { return n < 0 ? 'neg' : ''; }
function esc(s)  { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Render ───────────────────────────────────────────────────
function renderResults(d) {
  const b = d.bestDay, l = d.latestDay, t = d.today;

  const liveCard = (t && t.live) ? `
  <div class="card live-card">
    <div class="card-title"><span class="live-dot"></span>Today Live &mdash; ${esc(t.date)}</div>
    <div class="grid">
      <div><div class="stat-label">Last Price</div><div class="stat-value lg">${fmt(t.lastPrice)}</div></div>
      <div><div class="stat-label">Today High</div><div class="stat-value lg">${fmt(t.high)}</div></div>
      <div><div class="stat-label">Today Low</div><div class="stat-value lg">${fmt(t.low)}</div></div>
      <div><div class="stat-label">Intraday Range</div><div class="stat-value lg">${fmt(t.range)}</div></div>
      <div><div class="stat-label">Prev Close</div><div class="stat-value lg">${fmt(t.prevClose)}</div></div>
      <div><div class="stat-label">Change</div><div class="stat-value lg ${neg(t.changePct)}">${pct(t.changePct)}</div></div>
    </div>
  </div>` : '';

  document.getElementById('out').innerHTML = `
    ${liveCard}

    <div class="card">
      <div class="card-title">${esc(d.symbol)} &mdash; Price Chart</div>
      <div class="chart-tabs">
        <button class="tab-btn active" id="tab-daily"  onclick="switchTab('daily')">TODAY</button>
        <button class="tab-btn"        id="tab-weekly" onclick="switchTab('weekly')">5 DAYS</button>
      </div>
      <div class="chart-container">
        <div class="chart-loading" id="chartLoading">LOADING CHART &hellip;</div>
        <canvas id="stockChart" style="display:none"></canvas>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Champion Day &mdash; ${esc(d.symbol)} &mdash; ${d.totalDays.toLocaleString()} days analyzed</div>
      <div class="grid">
        <div><div class="stat-label">Date</div><div class="stat-value">${esc(b.date)}</div></div>
        <div><div class="stat-label">Intraday Range</div><div class="stat-value xl">${fmt(b.range)}</div></div>
        <div><div class="stat-label">Open &rarr; Close</div><div class="stat-value ${neg(b.o2cPct)}">${pct(b.o2cPct)}</div></div>
        <div><div class="stat-label">Open</div><div class="stat-value">${fmt(b.open)}</div></div>
        <div><div class="stat-label">High</div><div class="stat-value">${fmt(b.high)}</div></div>
        <div><div class="stat-label">Low</div><div class="stat-value">${fmt(b.low)}</div></div>
        <div><div class="stat-label">Close</div><div class="stat-value">${fmt(b.close)}</div></div>
      </div>
    </div>

    <div class="card">
      <div class="card-title">Top 10 Highest-Swing Days</div>
      <table>
        <thead><tr>
          <th>Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Range</th><th>O&rarr;C</th>
        </tr></thead>
        <tbody>${d.topDays.map(r => `
          <tr>
            <td>${esc(r.date)}</td>
            <td>${fmt(r.open)}</td>
            <td>${fmt(r.high)}</td>
            <td>${fmt(r.low)}</td>
            <td>${fmt(r.close)}</td>
            <td>${fmt(r.range)}</td>
            <td class="${neg(r.o2cPct)}">${pct(r.o2cPct)}</td>
          </tr>`).join('')}
        </tbody>
      </table>
    </div>

    <div class="card">
      <div class="card-title">Last Closed Session &mdash; ${esc(l.date)}</div>
      <div class="grid">
        <div><div class="stat-label">Open</div><div class="stat-value">${fmt(l.open)}</div></div>
        <div><div class="stat-label">High</div><div class="stat-value">${fmt(l.high)}</div></div>
        <div><div class="stat-label">Low</div><div class="stat-value">${fmt(l.low)}</div></div>
        <div><div class="stat-label">Close</div><div class="stat-value">${fmt(l.close)}</div></div>
        <div><div class="stat-label">Range</div><div class="stat-value">${fmt(l.range)}</div></div>
        <div><div class="stat-label">O&rarr;C</div><div class="stat-value ${neg(l.o2cPct)}">${pct(l.o2cPct)}</div></div>
      </div>
    </div>

    <footer>Data via Yahoo Finance &bull; No API key required &bull; Any publicly traded stock or ETF</footer>
  `;
}

// ── Chart ────────────────────────────────────────────────────
function switchTab(period) {
  currentPeriod = period;
  document.getElementById('tab-daily').classList.toggle('active',  period === 'daily');
  document.getElementById('tab-weekly').classList.toggle('active', period === 'weekly');
  if (currentSymbol) loadChart(currentSymbol, period);
}

async function loadChart(symbol, period) {
  const loading = document.getElementById('chartLoading');
  const canvas  = document.getElementById('stockChart');
  if (!loading || !canvas) return;

  if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
  loading.textContent = 'LOADING CHART …';
  loading.style.display = 'flex';
  canvas.style.display  = 'none';

  try {
    const data = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&period=${period}`)
                         .then(r => r.json());

    if (data.error || !data.timestamps || !data.timestamps.length) {
      loading.textContent = 'NO DATA AVAILABLE';
      return;
    }

    const labels = data.timestamps.map(ts => {
      const d = new Date(ts);
      return period === 'daily'
        ? d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        : d.toLocaleDateString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric' });
    });

    loading.style.display = 'none';
    canvas.style.display  = 'block';

    chartInstance = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: data.prices,
          borderColor: '#e8002d',
          backgroundColor: 'rgba(232,0,45,0.07)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 5,
          pointHoverBackgroundColor: '#e8002d',
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 1,
          tension: 0.1,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 350 },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: '#111',
            titleColor: '#777',
            bodyColor: '#ffffff',
            borderColor: '#333',
            borderWidth: 1,
            padding: 10,
            titleFont: { family: 'Courier New', size: 10 },
            bodyFont:  { family: 'Courier New', size: 13 },
            callbacks: {
              title: items => items[0].label,
              label: ctx  => ' $' + ctx.parsed.y.toFixed(2)
            }
          }
        },
        scales: {
          x: {
            grid:  { color: '#1a1a1a' },
            ticks: { color: '#555', maxTicksLimit: 8, font: { family: 'Courier New', size: 10 } }
          },
          y: {
            position: 'right',
            grid:  { color: '#1a1a1a' },
            ticks: { color: '#555', font: { family: 'Courier New', size: 10 }, callback: v => '$' + v.toFixed(2) }
          }
        },
        interaction: { mode: 'index', intersect: false }
      }
    });
  } catch {
    if (loading) { loading.style.display = 'flex'; loading.textContent = 'CHART UNAVAILABLE'; }
  }
}
