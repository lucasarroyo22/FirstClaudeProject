// ── State ────────────────────────────────────────────────────
let chartInstance          = null;
let currentSymbol          = null;
let currentPeriod          = 'daily';
let ddActiveIndex          = -1;
let debounceTimer          = null;
let currentUser            = null;
let authMode               = 'login';
let showAddForm            = false;
let portfolioChartInstance = null;
let detailChartInstance    = null;
let portfolioInvestments   = [];
let portfolioComputedValues= [];
let currentDetailSymbol    = null;
let currentDetailPeriod    = 'daily';

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

// ── Nav ──────────────────────────────────────────────────────
function switchNav(view) {
  document.getElementById('navSearch').classList.toggle('active',    view === 'search');
  document.getElementById('navPortfolio').classList.toggle('active', view === 'portfolio');
  document.getElementById('viewSearch').classList.toggle('hidden',    view !== 'search');
  document.getElementById('viewPortfolio').classList.toggle('hidden', view !== 'portfolio');
  if (view === 'portfolio') loadPortfolio();
}

// ── Auth ─────────────────────────────────────────────────────
function openAuth() {
  document.getElementById('authOverlay').classList.remove('hidden');
  document.getElementById('authUsername').focus();
}

function closeAuth() {
  document.getElementById('authOverlay').classList.add('hidden');
  document.getElementById('authError').classList.add('hidden');
  document.getElementById('authUsername').value = '';
  document.getElementById('authPassword').value = '';
}

function showAuthTab(mode) {
  authMode = mode;
  document.getElementById('tabLogin').classList.toggle('active',    mode === 'login');
  document.getElementById('tabRegister').classList.toggle('active', mode === 'register');
  document.getElementById('authSubmit').textContent = mode === 'login' ? 'LOGIN' : 'CREATE ACCOUNT';
  document.getElementById('authError').classList.add('hidden');
}

async function submitAuth() {
  const username = document.getElementById('authUsername').value.trim();
  const password = document.getElementById('authPassword').value;
  const errEl    = document.getElementById('authError');
  errEl.classList.add('hidden');
  const res = await fetch(`/api/auth/${authMode}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  }).then(r => r.json());
  if (!res.ok) { errEl.textContent = res.message; errEl.classList.remove('hidden'); return; }
  currentUser = res.username;
  updateAuthUI();
  closeAuth();
  if (!document.getElementById('viewPortfolio').classList.contains('hidden')) loadPortfolio();
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  currentUser = null;
  updateAuthUI();
  document.getElementById('portfolioOut').innerHTML = '<div class="status">LOGIN TO VIEW YOUR PORTFOLIO</div>';
}

function updateAuthUI() {
  const greeting  = document.getElementById('userGreeting');
  const authBtn   = document.getElementById('authBtn');
  const logoutBtn = document.getElementById('logoutBtn');
  if (currentUser) {
    greeting.textContent = `WELCOME, ${currentUser.toUpperCase()}`;
    greeting.classList.remove('hidden');
    authBtn.classList.add('hidden');
    logoutBtn.classList.remove('hidden');
  } else {
    greeting.classList.add('hidden');
    authBtn.classList.remove('hidden');
    logoutBtn.classList.add('hidden');
  }
}

document.getElementById('authOverlay').addEventListener('click', e => {
  if (e.target === document.getElementById('authOverlay')) closeAuth();
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeAuth(); closeStockDetail(); }
});
document.getElementById('authPassword').addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });
document.getElementById('authUsername').addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });

// ── Portfolio ────────────────────────────────────────────────
async function loadPortfolio() {
  const out = document.getElementById('portfolioOut');
  if (!currentUser) { out.innerHTML = '<div class="status">LOGIN TO VIEW YOUR PORTFOLIO</div>'; return; }
  out.innerHTML = '<div class="status">LOADING PORTFOLIO &hellip;</div>';
  if (portfolioChartInstance) { portfolioChartInstance.destroy(); portfolioChartInstance = null; }

  const data = await fetch('/api/portfolio').then(r => r.json());
  if (data.error) { out.innerHTML = `<div class="err">${esc(data.error)}</div>`; return; }

  portfolioInvestments = data.investments || [];
  const symbols = [...new Set(portfolioInvestments.map(i => i.symbol))];

  const prices = {};
  await Promise.all(symbols.map(async sym => {
    try {
      const d = await fetch(`/api/stock?symbol=${encodeURIComponent(sym)}`).then(r => r.json());
      if (d.today && d.today.live) prices[sym] = d.today.lastPrice;
      else if (d.latestDay)        prices[sym] = d.latestDay.close;
    } catch { prices[sym] = null; }
  }));

  portfolioComputedValues = portfolioInvestments.map(i => {
    const cur    = prices[i.symbol] != null ? prices[i.symbol] : null;
    const cost   = i.shares * i.purchasePrice;
    const val    = cur != null ? i.shares * cur : null;
    const pnl    = val != null ? val - cost : null;
    const pnlPct = pnl != null && cost > 0 ? (pnl / cost) * 100 : null;
    return { cur, cost, val, pnl, pnlPct };
  });

  let totalCost = 0, totalValue = 0;
  portfolioComputedValues.forEach(c => {
    totalCost  += c.cost;
    if (c.val != null) totalValue += c.val;
  });
  const totalPnl    = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

  const addFormHtml = showAddForm ? `
  <div class="add-form">
    <label>Symbol<input id="iSym"    type="text"   placeholder="AAPL"/></label>
    <label>Shares<input  id="iShares" type="number" placeholder="10" step="0.000001" min="0"/></label>
    <label>Buy Price<input id="iPrice" type="number" placeholder="150.00" step="0.01" min="0"/></label>
    <label>Date<input     id="iDate"  type="date"   value="${new Date().toISOString().slice(0,10)}"/></label>
    <label>Notes<input    id="iNotes" type="text"   placeholder="Optional"/></label>
    <button class="btn-submit" onclick="addInvestment()">ADD</button>
  </div>` : '';

  const chartCard = portfolioInvestments.length > 0 ? `
  <div class="card">
    <div class="card-title">PORTFOLIO VALUE OVER TIME <span style="font-size:8px;color:var(--muted);letter-spacing:1px">&mdash; &bull; MARKS PURCHASE DATES</span></div>
    <div class="portfolio-chart-wrap">
      <div class="chart-loading" id="portfolioChartLoading">BUILDING CHART &hellip;</div>
      <canvas id="portfolioChart" style="display:none"></canvas>
    </div>
  </div>` : '';

  const tableHtml = portfolioInvestments.length === 0
    ? '<div class="status">NO INVESTMENTS YET — ADD ONE ABOVE</div>'
    : `<div class="card">
    <div class="card-title">HOLDINGS <span style="font-size:9px;color:var(--muted);letter-spacing:1px">&mdash; CLICK ROW FOR DETAILS</span></div>
    <table>
      <thead><tr>
        <th>Symbol</th><th>Shares</th><th>Buy</th><th>Date</th>
        <th>Price</th><th>Value</th><th>P&amp;L</th><th></th>
      </tr></thead>
      <tbody>${portfolioInvestments.map((i, idx) => {
        const { cur, val, pnl, pnlPct } = portfolioComputedValues[idx];
        return `<tr class="holding-row" onclick="openStockDetail(${idx})">
          <td><strong style="color:var(--red)">${esc(i.symbol)}</strong></td>
          <td>${Number(i.shares).toLocaleString('en-US',{maximumFractionDigits:6})}</td>
          <td>${fmt(i.purchasePrice)}</td>
          <td>${esc(i.purchaseDate)}</td>
          <td>${cur != null ? fmt(cur) : '—'}</td>
          <td>${val != null ? fmt(val) : '—'}</td>
          <td class="${pnl != null && pnl < 0 ? 'neg' : ''}">${pnl != null ? fmt(pnl)+' ('+pct(pnlPct)+')' : '—'}</td>
          <td onclick="event.stopPropagation()"><button class="btn-delete" onclick="deleteInvestment(${i.id})">&#x2715;</button></td>
        </tr>`;
      }).join('')}
      </tbody>
    </table>
  </div>`;

  out.innerHTML = `
    <div class="summary-bar">
      <div><div class="stat-label">Total Cost</div><div class="stat-value lg">${fmt(totalCost)}</div></div>
      <div><div class="stat-label">Market Value</div><div class="stat-value lg">${fmt(totalValue)}</div></div>
      <div><div class="stat-label">Total P&amp;L</div><div class="stat-value lg ${totalPnl < 0 ? 'neg' : ''}">${fmt(totalPnl)} (${pct(totalPnlPct)})</div></div>
      <div><div class="stat-label">Positions</div><div class="stat-value lg">${portfolioInvestments.length}</div></div>
    </div>
    ${chartCard}
    <div class="portfolio-header">
      <div class="card-title" style="margin:0;border:none;padding:0">MY INVESTMENTS</div>
      <button class="btn-add" onclick="toggleAddForm()">${showAddForm ? 'CANCEL' : '+ ADD INVESTMENT'}</button>
    </div>
    ${addFormHtml}
    ${tableHtml}`;

  if (portfolioInvestments.length > 0) {
    const earliest = portfolioInvestments.reduce(
      (min, i) => i.purchaseDate < min ? i.purchaseDate : min, '9999-12-31');
    const historyBySymbol = {};
    await Promise.all(symbols.map(async sym => {
      try {
        const h = await fetch(`/api/history?symbol=${encodeURIComponent(sym)}&from=${encodeURIComponent(earliest)}`)
                            .then(r => r.json());
        if (!h.error) historyBySymbol[sym] = h;
      } catch {}
    }));
    buildPortfolioChart(portfolioInvestments, historyBySymbol);
  }
}

function buildPortfolioChart(investments, historyBySymbol) {
  const canvas  = document.getElementById('portfolioChart');
  const loading = document.getElementById('portfolioChartLoading');
  if (!canvas) return;

  if (portfolioChartInstance) { portfolioChartInstance.destroy(); portfolioChartInstance = null; }

  const dateSet = new Set();
  Object.values(historyBySymbol).forEach(h => (h.dates || []).forEach(d => dateSet.add(d)));
  const allDates = [...dateSet].sort();

  if (allDates.length === 0) {
    if (loading) { loading.style.display = 'flex'; loading.textContent = 'NO HISTORY DATA'; }
    return;
  }

  const earliest   = investments.reduce((min, i) => i.purchaseDate < min ? i.purchaseDate : min, '9999-12-31');
  const chartDates = allDates.filter(d => d >= earliest);

  function priceOn(sym, date) {
    const h = historyBySymbol[sym];
    if (!h || !h.dates) return null;
    let price = null;
    for (let i = 0; i < h.dates.length; i++) {
      if (h.dates[i] <= date) price = h.prices[i];
      else break;
    }
    return price;
  }

  const values = chartDates.map(date => {
    let total = 0;
    investments.forEach(inv => {
      if (inv.purchaseDate > date) return;
      const p = priceOn(inv.symbol, date);
      if (p != null) total += inv.shares * p;
    });
    return total > 0 ? total : null;
  });

  const purchaseDates  = new Set(investments.map(i => i.purchaseDate));
  const pointRadii     = chartDates.map(d => purchaseDates.has(d) ? 6 : 0);
  const pointBgColors  = chartDates.map(d => purchaseDates.has(d) ? '#ffffff' : 'transparent');

  if (loading) loading.style.display = 'none';
  canvas.style.display = 'block';

  portfolioChartInstance = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: chartDates,
      datasets: [{
        data: values,
        borderColor: '#e8002d',
        backgroundColor: 'rgba(232,0,45,0.07)',
        borderWidth: 2,
        pointRadius: pointRadii,
        pointBackgroundColor: pointBgColors,
        pointBorderColor: '#e8002d',
        pointBorderWidth: 2,
        pointHoverRadius: 5,
        tension: 0.1,
        fill: true,
        spanGaps: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 400 },
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
            title: items => items[0].label + (purchaseDates.has(items[0].label) ? '  ● PURCHASE' : ''),
            label: ctx  => ctx.parsed.y != null
              ? ' $' + ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
              : ''
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
          ticks: {
            color: '#555',
            font: { family: 'Courier New', size: 10 },
            callback: v => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 })
          }
        }
      },
      interaction: { mode: 'index', intersect: false }
    }
  });
}

function toggleAddForm() { showAddForm = !showAddForm; loadPortfolio(); }

async function addInvestment() {
  const sym    = document.getElementById('iSym').value.trim().toUpperCase();
  const shares = parseFloat(document.getElementById('iShares').value);
  const price  = parseFloat(document.getElementById('iPrice').value);
  const date   = document.getElementById('iDate').value;
  const notes  = document.getElementById('iNotes').value;
  if (!sym || isNaN(shares) || isNaN(price) || !date) { alert('Please fill in all required fields.'); return; }
  await fetch('/api/portfolio', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ symbol: sym, shares, purchasePrice: price, purchaseDate: date, notes })
  });
  showAddForm = false;
  loadPortfolio();
}

async function deleteInvestment(id) {
  if (!confirm('Remove this investment?')) return;
  await fetch(`/api/portfolio/${id}`, { method: 'DELETE' });
  loadPortfolio();
}

// ── Stock Detail Panel ────────────────────────────────────────
function openStockDetail(idx) {
  const inv      = portfolioInvestments[idx];
  const computed = portfolioComputedValues[idx];
  if (!inv) return;

  currentDetailSymbol = inv.symbol;
  currentDetailPeriod = 'daily';

  document.getElementById('stockDetailOverlay').classList.remove('hidden');
  document.getElementById('detailSymbol').textContent = inv.symbol;
  document.getElementById('detailMeta').textContent   = 'POSITION DETAIL';

  document.getElementById('detailPriceBar').innerHTML = `
    <div><div class="stat-label">Market Price</div><div class="stat-value" id="detailPrice">—</div></div>
    <div><div class="stat-label">Today Change</div><div class="stat-value" id="detailChange">—</div></div>
    <div><div class="stat-label">Day Range</div><div class="stat-value" id="detailRange" style="font-size:13px">—</div></div>`;

  const pnlClass = computed.pnl != null && computed.pnl < 0 ? 'neg' : '';
  document.getElementById('detailPosition').innerHTML = `
    <div><div class="stat-label">Shares</div><div class="stat-value">${Number(inv.shares).toLocaleString('en-US',{maximumFractionDigits:6})}</div></div>
    <div><div class="stat-label">Buy Price</div><div class="stat-value">${fmt(inv.purchasePrice)}</div></div>
    <div><div class="stat-label">Purchase Date</div><div class="stat-value" style="font-size:14px">${esc(inv.purchaseDate)}</div></div>
    <div><div class="stat-label">Cost Basis</div><div class="stat-value">${fmt(computed.cost)}</div></div>
    <div><div class="stat-label">Market Value</div><div class="stat-value">${computed.val != null ? fmt(computed.val) : '—'}</div></div>
    <div><div class="stat-label">P&amp;L</div><div class="stat-value ${pnlClass}">${computed.pnl != null ? fmt(computed.pnl)+' ('+pct(computed.pnlPct)+')' : '—'}</div></div>`;

  const tabs = document.querySelectorAll('#detailTabs .tab-btn');
  tabs[0].classList.add('active');
  tabs[1].classList.remove('active');

  loadDetailPrice(inv.symbol);
  loadDetailChart(inv.symbol, 'daily');
}

function closeStockDetail() {
  document.getElementById('stockDetailOverlay').classList.add('hidden');
  if (detailChartInstance) { detailChartInstance.destroy(); detailChartInstance = null; }
  currentDetailSymbol = null;
}

function switchDetailTab(period) {
  currentDetailPeriod = period;
  const tabs = document.querySelectorAll('#detailTabs .tab-btn');
  tabs[0].classList.toggle('active', period === 'daily');
  tabs[1].classList.toggle('active', period === 'weekly');
  if (currentDetailSymbol) loadDetailChart(currentDetailSymbol, period);
}

async function loadDetailPrice(symbol) {
  try {
    const data = await fetch(`/api/stock?symbol=${encodeURIComponent(symbol)}`).then(r => r.json());
    const t = data.today, l = data.latestDay;
    const priceEl  = document.getElementById('detailPrice');
    const changeEl = document.getElementById('detailChange');
    const rangeEl  = document.getElementById('detailRange');
    if (!priceEl) return;
    if (t && t.live) {
      priceEl.textContent  = fmt(t.lastPrice);
      changeEl.className   = 'stat-value ' + (t.changePct < 0 ? 'neg' : '');
      changeEl.textContent = pct(t.changePct);
      rangeEl.textContent  = fmt(t.low) + ' – ' + fmt(t.high);
    } else if (l) {
      priceEl.textContent  = fmt(l.close);
      changeEl.className   = 'stat-value ' + (l.o2cPct < 0 ? 'neg' : '');
      changeEl.textContent = pct(l.o2cPct);
      rangeEl.textContent  = fmt(l.low) + ' – ' + fmt(l.high);
    }
  } catch {}
}

async function loadDetailChart(symbol, period) {
  const loading = document.getElementById('detailChartLoading');
  const canvas  = document.getElementById('detailChartCanvas');
  if (!loading || !canvas) return;

  if (detailChartInstance) { detailChartInstance.destroy(); detailChartInstance = null; }
  loading.textContent   = 'LOADING …';
  loading.style.display = 'flex';
  canvas.style.display  = 'none';

  try {
    const data = await fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&period=${period}`)
                         .then(r => r.json());
    if (data.error || !data.timestamps || !data.timestamps.length) {
      loading.textContent = 'NO DATA';
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

    detailChartInstance = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: data.prices,
          borderColor: '#e8002d',
          backgroundColor: 'rgba(232,0,45,0.07)',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#e8002d',
          tension: 0.1,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: '#111',
            titleColor: '#777',
            bodyColor: '#fff',
            borderColor: '#333',
            borderWidth: 1,
            padding: 8,
            titleFont: { family: 'Courier New', size: 10 },
            bodyFont:  { family: 'Courier New', size: 12 },
            callbacks: {
              title: items => items[0].label,
              label: ctx  => ' $' + ctx.parsed.y.toFixed(2)
            }
          }
        },
        scales: {
          x: {
            grid:  { color: '#1a1a1a' },
            ticks: { color: '#555', maxTicksLimit: 6, font: { family: 'Courier New', size: 9 } }
          },
          y: {
            position: 'right',
            grid:  { color: '#1a1a1a' },
            ticks: { color: '#555', font: { family: 'Courier New', size: 9 }, callback: v => '$' + v.toFixed(2) }
          }
        },
        interaction: { mode: 'index', intersect: false }
      }
    });
  } catch {
    if (loading) { loading.style.display = 'flex'; loading.textContent = 'CHART UNAVAILABLE'; }
  }
}

// ── Init ─────────────────────────────────────────────────────
async function init() {
  const me = await fetch('/api/auth/me').then(r => r.json());
  if (me.loggedIn) { currentUser = me.username; updateAuthUI(); }
}

window.onload = init;
