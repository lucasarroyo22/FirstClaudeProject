import { useState, useRef, useEffect, useCallback } from 'react'
import PriceChart from './PriceChart'
import { fmt, pct, neg } from '../../utils/format'

const PERIODS = [
  { key: 'daily',   label: 'TODAY'    },
  { key: 'weekly',  label: '5 DAYS'   },
  { key: 'monthly', label: '1 MONTH'  },
  { key: 'yearly',  label: '1 YEAR'   },
  { key: 'alltime', label: 'ALL TIME' },
]

export default function SearchView() {
  const [query, setQuery]           = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [ddIndex, setDdIndex]       = useState(-1)
  const [stockData, setStockData]   = useState(null)
  const [status, setStatus]         = useState('idle') // idle | loading | error
  const [errorMsg, setErrorMsg]     = useState('')
  const [period, setPeriod]         = useState('daily')
  const debounceRef = useRef(null)
  const wrapRef     = useRef(null)

  useEffect(() => {
    const handler = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setSuggestions([])
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [])

  function handleInput(val) {
    setQuery(val)
    clearTimeout(debounceRef.current)
    if (!val.trim()) { setSuggestions([]); return }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await fetch(`/api/search?q=${encodeURIComponent(val)}`).then(r => r.json())
        setSuggestions(data.results || [])
        setDdIndex(-1)
      } catch { setSuggestions([]) }
    }, 280)
  }

  function handleKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setDdIndex(i => Math.min(i + 1, suggestions.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setDdIndex(i => Math.max(i - 1, -1)) }
    else if (e.key === 'Enter') {
      if (ddIndex >= 0 && suggestions[ddIndex]) selectStock(suggestions[ddIndex].symbol)
      else search()
    }
    else if (e.key === 'Escape') setSuggestions([])
  }

  function selectStock(symbol) {
    setQuery(symbol)
    setSuggestions([])
    loadStock(symbol)
  }

  function search() {
    const sym = query.trim().toUpperCase()
    if (!sym) return
    setSuggestions([])
    loadStock(sym)
  }

  async function loadStock(symbol) {
    setStatus('loading')
    setStockData(null)
    setPeriod('daily')
    try {
      const data = await fetch(`/api/stock?symbol=${encodeURIComponent(symbol)}`).then(r => r.json())
      if (data.error) { setStatus('error'); setErrorMsg(data.error); return }
      setStockData(data)
      setStatus('idle')
    } catch {
      setStatus('error')
      setErrorMsg('Could not reach server.')
    }
  }

  const activeSymbol = stockData?.symbol
  const b = stockData?.bestDay
  const l = stockData?.latestDay
  const t = stockData?.today

  return (
    <div>
      <div className="search-wrap" ref={wrapRef}>
        <div className="search">
          <input
            id="sym"
            type="text"
            placeholder="Search any stock or ETF…"
            autoComplete="off"
            maxLength={20}
            spellCheck={false}
            value={query}
            onChange={e => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button id="searchBtn" onClick={search}>SEARCH</button>
        </div>
        {suggestions.length > 0 && (
          <div className="dropdown open">
            {suggestions.map((r, i) => (
              <div
                key={r.symbol}
                className={`dd-item${i === ddIndex ? ' active' : ''}`}
                onClick={() => selectStock(r.symbol)}
              >
                <span className="dd-symbol">{r.symbol}</span>
                <span className="dd-name">{r.name}</span>
                <span className="dd-exchange">{r.exchange}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div id="out">
        {status === 'loading' && <div className="status">LOADING {query.toUpperCase()} &hellip;</div>}
        {status === 'error'   && <div className="err">ERROR: {errorMsg}</div>}
        {status === 'idle' && !stockData && <div className="status">SEARCH FOR A STOCK TO BEGIN</div>}

        {stockData && (
          <>
            {t?.live && (
              <div className="card live-card">
                <div className="card-title"><span className="live-dot"></span>Today Live &mdash; {t.date}</div>
                <div className="grid">
                  <div><div className="stat-label">Last Price</div><div className="stat-value lg">{fmt(t.lastPrice)}</div></div>
                  <div><div className="stat-label">Today High</div><div className="stat-value lg">{fmt(t.high)}</div></div>
                  <div><div className="stat-label">Today Low</div><div className="stat-value lg">{fmt(t.low)}</div></div>
                  <div><div className="stat-label">Intraday Range</div><div className="stat-value lg">{fmt(t.range)}</div></div>
                  <div><div className="stat-label">Prev Close</div><div className="stat-value lg">{fmt(t.prevClose)}</div></div>
                  <div><div className="stat-label">Change</div><div className={`stat-value lg ${neg(t.changePct)}`}>{pct(t.changePct)}</div></div>
                </div>
              </div>
            )}

            <div className="card">
              <div className="card-title">{activeSymbol} &mdash; Price Chart</div>
              <div className="chart-tabs">
                {PERIODS.map(p => (
                  <button
                    key={p.key}
                    className={`tab-btn${period === p.key ? ' active' : ''}`}
                    onClick={() => setPeriod(p.key)}
                  >{p.label}</button>
                ))}
              </div>
              <PriceChart symbol={activeSymbol} period={period} />
            </div>

            <div className="card">
              <div className="card-title">Champion Day &mdash; {activeSymbol} &mdash; {stockData.totalDays.toLocaleString()} days analyzed</div>
              <div className="grid">
                <div><div className="stat-label">Date</div><div className="stat-value">{b.date}</div></div>
                <div><div className="stat-label">Intraday Range</div><div className="stat-value xl">{fmt(b.range)}</div></div>
                <div><div className="stat-label">Open &rarr; Close</div><div className={`stat-value ${neg(b.o2cPct)}`}>{pct(b.o2cPct)}</div></div>
                <div><div className="stat-label">Open</div><div className="stat-value">{fmt(b.open)}</div></div>
                <div><div className="stat-label">High</div><div className="stat-value">{fmt(b.high)}</div></div>
                <div><div className="stat-label">Low</div><div className="stat-value">{fmt(b.low)}</div></div>
                <div><div className="stat-label">Close</div><div className="stat-value">{fmt(b.close)}</div></div>
              </div>
            </div>

            <div className="card">
              <div className="card-title">Top 10 Highest-Swing Days</div>
              <table>
                <thead><tr>
                  <th>Date</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Range</th><th>O&rarr;C</th>
                </tr></thead>
                <tbody>{stockData.topDays.map(r => (
                  <tr key={r.date}>
                    <td>{r.date}</td>
                    <td>{fmt(r.open)}</td>
                    <td>{fmt(r.high)}</td>
                    <td>{fmt(r.low)}</td>
                    <td>{fmt(r.close)}</td>
                    <td>{fmt(r.range)}</td>
                    <td className={neg(r.o2cPct)}>{pct(r.o2cPct)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>

            <div className="card">
              <div className="card-title">Last Closed Session &mdash; {l.date}</div>
              <div className="grid">
                <div><div className="stat-label">Open</div><div className="stat-value">{fmt(l.open)}</div></div>
                <div><div className="stat-label">High</div><div className="stat-value">{fmt(l.high)}</div></div>
                <div><div className="stat-label">Low</div><div className="stat-value">{fmt(l.low)}</div></div>
                <div><div className="stat-label">Close</div><div className="stat-value">{fmt(l.close)}</div></div>
                <div><div className="stat-label">Range</div><div className="stat-value">{fmt(l.range)}</div></div>
                <div><div className="stat-label">O&rarr;C</div><div className={`stat-value ${neg(l.o2cPct)}`}>{pct(l.o2cPct)}</div></div>
              </div>
            </div>

            <footer>Data via Yahoo Finance &bull; No API key required &bull; Any publicly traded stock or ETF</footer>
          </>
        )}
      </div>
    </div>
  )
}
