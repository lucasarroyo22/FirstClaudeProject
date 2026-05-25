import { useState, useEffect } from 'react'
import PortfolioChart from './PortfolioChart'
import StockDetailPanel from './StockDetailPanel'
import { fmt, pct, neg } from '../../utils/format'

export default function PortfolioView({ currentUser, onOpenAuth }) {
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState(null)
  const [investments, setInvestments]   = useState([])
  const [computed, setComputed]         = useState([])
  const [totals, setTotals]             = useState({ cost: 0, value: 0, pnl: 0, pnlPct: 0 })
  const [showAddForm, setShowAddForm]   = useState(false)
  const [detailIdx, setDetailIdx]       = useState(null)
  const [historyBySymbol, setHistory]   = useState({})
  const [addForm, setAddForm]           = useState({
    sym: '', shares: '', price: '', date: new Date().toISOString().slice(0, 10), notes: ''
  })

  useEffect(() => {
    if (currentUser) loadPortfolio()
  }, [currentUser])

  async function loadPortfolio() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetch('/api/portfolio').then(r => r.json())
      if (data.error) { setError(data.error); return }

      const invs    = data.investments || []
      const symbols = [...new Set(invs.map(i => i.symbol))]
      const earliest = invs.length > 0
        ? invs.reduce((min, i) => i.purchaseDate < min ? i.purchaseDate : min, '9999-12-31')
        : null

      // Single batch of N requests — history already contains the latest close price
      const hist = earliest
        ? await Promise.all(symbols.map(async sym => {
            try {
              const h = await fetch(`/api/history?symbol=${encodeURIComponent(sym)}&from=${encodeURIComponent(earliest)}`).then(r => r.json())
              return [sym, h.error ? null : h]
            } catch { return [sym, null] }
          })).then(entries => Object.fromEntries(entries.filter(([, v]) => v)))
        : {}

      // Derive current price from the last entry in history — no separate /api/stock call needed
      const prices = Object.fromEntries(
        symbols.map(sym => {
          const h = hist[sym]
          const lastPrice = h?.prices?.length ? h.prices[h.prices.length - 1] : null
          return [sym, lastPrice]
        })
      )

      const comp = invs.map(i => {
        const cur    = prices[i.symbol] ?? null
        const cost   = i.shares * i.purchasePrice
        const val    = cur != null ? i.shares * cur : null
        const pnl    = val != null ? val - cost : null
        const pnlPct = pnl != null && cost > 0 ? (pnl / cost) * 100 : null
        return { cur, cost, val, pnl, pnlPct }
      })

      let totalCost = 0, totalValue = 0
      comp.forEach(c => { totalCost += c.cost; if (c.val != null) totalValue += c.val })
      const totalPnl    = totalValue - totalCost
      const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0

      setInvestments(invs)
      setComputed(comp)
      setTotals({ cost: totalCost, value: totalValue, pnl: totalPnl, pnlPct: totalPnlPct })
      setHistory(hist)
    } catch {
      setError('Could not load portfolio.')
    } finally {
      setLoading(false)
    }
  }

  async function addInvestment() {
    const { sym, shares, price, date, notes } = addForm
    if (!sym || !shares || !price || !date) { alert('Please fill in all required fields.'); return }
    await fetch('/api/portfolio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: sym.toUpperCase(), shares: parseFloat(shares), purchasePrice: parseFloat(price), purchaseDate: date, notes })
    })
    setShowAddForm(false)
    setAddForm({ sym: '', shares: '', price: '', date: new Date().toISOString().slice(0, 10), notes: '' })
    loadPortfolio()
  }

  async function deleteInvestment(id) {
    if (!confirm('Remove this investment?')) return
    await fetch(`/api/portfolio/${id}`, { method: 'DELETE' })
    loadPortfolio()
  }

  if (!currentUser) return (
    <div id="portfolioOut">
      <div className="status">
        LOGIN TO VIEW YOUR PORTFOLIO &nbsp;
        <button onClick={onOpenAuth} style={{ marginLeft: 12 }}>LOGIN / REGISTER</button>
      </div>
    </div>
  )

  if (loading) return <div id="portfolioOut"><div className="status">LOADING PORTFOLIO &hellip;</div></div>
  if (error)   return <div id="portfolioOut"><div className="err">{error}</div></div>

  return (
    <div id="portfolioOut">
      <div className="summary-bar">
        <div><div className="stat-label">Total Cost</div><div className="stat-value lg">{fmt(totals.cost)}</div></div>
        <div><div className="stat-label">Market Value</div><div className="stat-value lg">{fmt(totals.value)}</div></div>
        <div><div className="stat-label">Total P&amp;L</div><div className={`stat-value lg ${neg(totals.pnl)}`}>{fmt(totals.pnl)} ({pct(totals.pnlPct)})</div></div>
        <div><div className="stat-label">Positions</div><div className="stat-value lg">{investments.length}</div></div>
      </div>

      {investments.length > 0 && (
        <PortfolioChart investments={investments} historyBySymbol={historyBySymbol} />
      )}

      <div className="portfolio-header">
        <div className="card-title" style={{ margin: 0, border: 'none', padding: 0, background: 'none', color: 'var(--label)' }}>
          MY INVESTMENTS
        </div>
        <button className="btn-add" onClick={() => setShowAddForm(f => !f)}>
          {showAddForm ? 'CANCEL' : '+ ADD INVESTMENT'}
        </button>
      </div>

      {showAddForm && (
        <div className="add-form">
          <label>Symbol<input type="text" placeholder="AAPL" value={addForm.sym} onChange={e => setAddForm(f => ({ ...f, sym: e.target.value }))} /></label>
          <label>Shares<input type="number" placeholder="10" step="0.000001" min="0" value={addForm.shares} onChange={e => setAddForm(f => ({ ...f, shares: e.target.value }))} /></label>
          <label>Buy Price<input type="number" placeholder="150.00" step="0.01" min="0" value={addForm.price} onChange={e => setAddForm(f => ({ ...f, price: e.target.value }))} /></label>
          <label>Date<input type="date" value={addForm.date} onChange={e => setAddForm(f => ({ ...f, date: e.target.value }))} /></label>
          <label>Notes<input type="text" placeholder="Optional" value={addForm.notes} onChange={e => setAddForm(f => ({ ...f, notes: e.target.value }))} /></label>
          <button className="btn-submit" onClick={addInvestment}>ADD</button>
        </div>
      )}

      {investments.length === 0 ? (
        <div className="status">NO INVESTMENTS YET — ADD ONE ABOVE</div>
      ) : (
        <div className="card">
          <div className="card-title">HOLDINGS <span style={{ fontSize: 9, color: 'var(--white)', letterSpacing: 1 }}>&mdash; CLICK ROW FOR DETAILS</span></div>
          <table>
            <thead><tr>
              <th>Symbol</th><th>Shares</th><th>Buy</th><th>Date</th>
              <th>Price</th><th>Value</th><th>P&amp;L</th><th></th>
            </tr></thead>
            <tbody>
              {investments.map((inv, idx) => {
                const { cur, val, pnl, pnlPct } = computed[idx] || {}
                return (
                  <tr key={inv.id} className="holding-row" onClick={() => setDetailIdx(idx)}>
                    <td><strong style={{ color: 'var(--red)' }}>{inv.symbol}</strong></td>
                    <td>{Number(inv.shares).toLocaleString('en-US', { maximumFractionDigits: 6 })}</td>
                    <td>{fmt(inv.purchasePrice)}</td>
                    <td>{inv.purchaseDate}</td>
                    <td>{cur != null ? fmt(cur) : '—'}</td>
                    <td>{val != null ? fmt(val) : '—'}</td>
                    <td className={pnl != null && pnl < 0 ? 'neg' : ''}>{pnl != null ? `${fmt(pnl)} (${pct(pnlPct)})` : '—'}</td>
                    <td onClick={e => e.stopPropagation()}>
                      <button className="btn-delete" onClick={() => deleteInvestment(inv.id)}>&#x2715;</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {detailIdx !== null && (
        <StockDetailPanel
          investment={investments[detailIdx]}
          computed={computed[detailIdx]}
          onClose={() => setDetailIdx(null)}
        />
      )}
    </div>
  )
}
