# Stock Analyzer — Project Context

## Stack
- **Backend**: Java 21, `com.sun.net.httpserver` (no framework), Maven build
- **Frontend**: React 18 + Vite 5, Chart.js 4 (raw API, no wrapper library)
- **Database**: PostgreSQL (`stockanalyzer` db, default user `postgres`/`postgres`)
- **Data source**: Yahoo Finance v8 API (`query1.finance.yahoo.com/v8/finance/chart/`)

## Frontend — React + Vite

Source lives in `frontend/`. Vite builds to `src/main/resources/static/`, which Maven bundles into the JAR. The Java server serves everything from that directory — no Node.js in production.

### Development (hot reload)
```powershell
# Terminal 1 — Java backend (must already be running)
java -jar target\stock-analyzer.jar

# Terminal 2 — Vite dev server at http://localhost:5173 (proxies /api → :8080)
cd frontend
npm run dev
```
Use the Vite dev server for all frontend work — instant hot reload, no JAR rebuild needed.

### Production build
```powershell
cd frontend
npm run build    # outputs to src/main/resources/static/
```
Then deploy the JAR (see Build & Run below).

### CSS
Canonical source: `frontend/src/style.css`. The file in `src/main/resources/static/assets/` is Vite output — never edit it directly. To change styles, edit `frontend/src/style.css` and rebuild.

### Component structure
```
frontend/src/
  App.jsx                       # root — currentUser, activeNav, authOpen state
  style.css                     # canonical CSS (copied into build output by Vite)
  utils/
    format.js                   # fmt(), pct(), neg(), tsLabel() helpers
    chartOptions.js             # shared Chart.js dataset + options factories
  components/
    Header.jsx                  # title, user greeting, login/logout
    NavTabs.jsx                 # SEARCH / PORTFOLIO tab switcher
    AuthModal.jsx               # login/register modal with Escape + backdrop close
    search/
      SearchView.jsx            # search input, autocomplete dropdown, all stock result cards
      PriceChart.jsx            # reusable Chart.js line chart (used in search + detail panel)
    portfolio/
      PortfolioView.jsx         # portfolio data fetch, summary bar, holdings table, add form
      PortfolioChart.jsx        # portfolio value over time chart
      StockDetailPanel.jsx      # slide-over panel when clicking a holding row
```

### Key implementation notes
- Chart.js instances are managed with `useRef` + `useEffect` — always destroyed on unmount/re-render to prevent canvas reuse errors
- `PriceChart` is reused in both `SearchView` (5 period tabs) and `StockDetailPanel` (today/5-day only); the `periods` shown are controlled by the parent
- Portfolio load uses only `/api/history` per symbol — the last price in the history array is used for P&L, avoiding a redundant `/api/stock` call

## Build & Run

### The JAR
Always run `target/stock-analyzer.jar` (shaded fat-JAR). `target/stock-analyzer-1.0-shaded.jar` is a stale artifact — ignore it.

### Windows file lock — IMPORTANT
Java holds an exclusive file lock on the running JAR. **Maven cannot overwrite it** — `mvnw.cmd package` exits 0 but silently does nothing if the server is running. Never use Maven to rebuild while the server is up.

### Correct rebuild sequence
```powershell
# 1. Stop the server
Get-Process -Name java | Where-Object {
  (Get-WmiObject Win32_Process -Filter "ProcessId=$($_.Id)").CommandLine -match "stock-analyzer"
} | Stop-Process -Force
Start-Sleep -Seconds 1

# 2a. Frontend changes — rebuild React app
cd frontend; npm run build; cd ..

# 2b. Java changes — recompile and patch the JAR manually
$jar = "C:\Program Files\Java\jdk-21.0.11\bin\jar.exe"
$deps = (Get-ChildItem "$env:USERPROFILE\.m2\repository" -Recurse -Filter "*.jar" |
  Where-Object { $_.Name -match "gson|postgresql|jbcrypt" -and $_.Name -notmatch "sources|javadoc" } |
  Select-Object -ExpandProperty FullName) -join ";"
javac -cp $deps -d target\classes src\main\java\com\stocks\*.java
Push-Location target\classes
& $jar uf "..\stock-analyzer.jar" "com\stocks\StockServer.class"
Pop-Location

# 2c. Static file changes — patch the JAR with new Vite output
$staging = "target\static-staging"
New-Item -ItemType Directory -Force "$staging\static" | Out-Null
Copy-Item src\main\resources\static\index.html "$staging\static\"
Copy-Item src\main\resources\static\assets "$staging\static\assets" -Recurse
Push-Location $staging; & $jar uf "..\stock-analyzer.jar" "static"; Pop-Location
Remove-Item $staging -Recurse -Force

# 3. Restart
Start-Process -NoNewWindow java -ArgumentList "-jar","target\stock-analyzer.jar"
```

## Backend Architecture
- **`StockServer.java`** — all HTTP routing, Yahoo Finance fetching, JSON responses
- **`Database.java`** — PostgreSQL connection (`DB_URL`, `DB_USER`, `DB_PASS` env vars; defaults to `localhost:5432/stockanalyzer`)
- **`AuthService.java`** — session token auth, bcrypt passwords
- **`PortfolioService.java`** — portfolio CRUD
- Static files served via `StockServer.class.getResourceAsStream("/static" + path)`
- `mimeType()` handles: `.html`, `.css`, `.js`, `.json`, `.svg`, `.ico`, `.png`

## API Reference

### Chart — `GET /api/chart?symbol=AAPL&period=<period>`

| period | Yahoo Finance params | Interval |
|---|---|---|
| `daily` | `range=1d&interval=5m` | 5-min bars (intraday) |
| `weekly` | `period1/period2` (5 days) | 1-day bars |
| `monthly` | `period1/period2` (30 days) | 1-day bars |
| `yearly` | `period1/period2` (1 year) | 1-week bars |
| `alltime` | `period1=0/period2=now` | 1-month bars |

Always use explicit `period1`/`period2` epoch timestamps for non-intraday periods — Yahoo Finance's `range` shorthand is unreliable with `interval=1wk` and `interval=1mo`.

### Other endpoints
- `GET /api/stock?symbol=` — full stock analysis (10y history, champion day, top swings, live price). **Not used by portfolio view** — too slow.
- `GET /api/history?symbol=&from=YYYY-MM-DD` — daily closes from a date. Used by portfolio for both P&L prices and chart data.
- `GET /api/search?q=` — symbol autocomplete
- `POST /api/auth/login` / `POST /api/auth/register` / `POST /api/auth/logout` / `GET /api/auth/me`
- `GET /api/portfolio` / `POST /api/portfolio` / `DELETE /api/portfolio/:id`
