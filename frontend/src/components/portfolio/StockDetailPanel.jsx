import { useEffect, useState } from 'react'
import PriceChart from '../search/PriceChart'
import { fmt, pct, neg } from '../../utils/format'

const DETAIL_PERIODS = [
  { key: 'daily',  label: 'TODAY'  },
  { key: 'weekly', label: '5 DAYS' },
]

export default function StockDetailPanel({ investment, computed, onClose }) {
  const [price, setPrice]   = useState(null)
  const [period, setPeriod] = useState('daily')

  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    setPeriod('daily')
    fetch(`/api/stock?symbol=${encodeURIComponent(investment.symbol)}`).then(r => r.json()).then(data => {
      const t = data.today, l = data.latestDay
      if (t?.live) setPrice({ price: t.lastPrice, changePct: t.changePct, low: t.low, high: t.high })
      else if (l)  setPrice({ price: l.close, changePct: l.o2cPct, low: l.low, high: l.high })
    }).catch(() => {})
  }, [investment.symbol])

  const pnlClass = computed?.pnl != null && computed.pnl < 0 ? 'neg' : ''

  return (
    <div
      className="stock-detail-overlay"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="stock-detail-panel">
        <div className="detail-header">
          <div>
            <div className="detail-symbol">{investment.symbol}</div>
            <div className="detail-meta">POSITION DETAIL</div>
          </div>
          <button className="detail-close" onClick={onClose}>&#x2715;</button>
        </div>

        <div className="detail-price-bar">
          <div>
            <div className="stat-label">Market Price</div>
            <div className="stat-value">{price ? fmt(price.price) : '—'}</div>
          </div>
          <div>
            <div className="stat-label">Today Change</div>
            <div className={`stat-value ${price ? neg(price.changePct) : ''}`}>
              {price ? pct(price.changePct) : '—'}
            </div>
          </div>
          <div>
            <div className="stat-label">Day Range</div>
            <div className="stat-value" style={{ fontSize: 13 }}>
              {price ? `${fmt(price.low)} – ${fmt(price.high)}` : '—'}
            </div>
          </div>
        </div>

        <div className="chart-tabs" id="detailTabs">
          {DETAIL_PERIODS.map(p => (
            <button
              key={p.key}
              className={`tab-btn${period === p.key ? ' active' : ''}`}
              onClick={() => setPeriod(p.key)}
            >{p.label}</button>
          ))}
        </div>

        <PriceChart symbol={investment.symbol} period={period} height="200px" />

        <div className="detail-position-grid">
          <div><div className="stat-label">Shares</div><div className="stat-value">{Number(investment.shares).toLocaleString('en-US', { maximumFractionDigits: 6 })}</div></div>
          <div><div className="stat-label">Buy Price</div><div className="stat-value">{fmt(investment.purchasePrice)}</div></div>
          <div><div className="stat-label">Purchase Date</div><div className="stat-value" style={{ fontSize: 14 }}>{investment.purchaseDate}</div></div>
          <div><div className="stat-label">Cost Basis</div><div className="stat-value">{computed ? fmt(computed.cost) : '—'}</div></div>
          <div><div className="stat-label">Market Value</div><div className="stat-value">{computed?.val != null ? fmt(computed.val) : '—'}</div></div>
          <div><div className="stat-label">P&amp;L</div><div className={`stat-value ${pnlClass}`}>{computed?.pnl != null ? `${fmt(computed.pnl)} (${pct(computed.pnlPct)})` : '—'}</div></div>
        </div>
      </div>
    </div>
  )
}
