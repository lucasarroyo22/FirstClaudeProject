import { useEffect, useRef } from 'react'
import { Chart } from 'chart.js/auto'
import { baseChartOptions } from '../../utils/chartOptions'

export default function PortfolioChart({ investments, historyBySymbol }) {
  const canvasRef  = useRef(null)
  const chartRef   = useRef(null)
  const loadingRef = useRef(null)

  useEffect(() => {
    const loading = loadingRef.current
    const canvas  = canvasRef.current
    if (!loading || !canvas) return

    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }

    const dateSet = new Set()
    Object.values(historyBySymbol).forEach(h => (h.dates || []).forEach(d => dateSet.add(d)))
    const allDates = [...dateSet].sort()

    if (allDates.length === 0) {
      loading.textContent  = 'NO HISTORY DATA'
      loading.style.display = 'flex'
      return
    }

    const earliest  = investments.reduce((min, i) => i.purchaseDate < min ? i.purchaseDate : min, '9999-12-31')
    const chartDates = allDates.filter(d => d >= earliest)

    function priceOn(sym, date) {
      const h = historyBySymbol[sym]
      if (!h?.dates) return null
      let price = null
      for (let i = 0; i < h.dates.length; i++) {
        if (h.dates[i] <= date) price = h.prices[i]
        else break
      }
      return price
    }

    const values = chartDates.map(date => {
      let total = 0
      investments.forEach(inv => {
        if (inv.purchaseDate > date) return
        const p = priceOn(inv.symbol, date)
        if (p != null) total += inv.shares * p
      })
      return total > 0 ? total : null
    })

    const purchaseDates = new Set(investments.map(i => i.purchaseDate))
    const pointRadii    = chartDates.map(d => purchaseDates.has(d) ? 6 : 0)
    const pointBgColors = chartDates.map(d => purchaseDates.has(d) ? '#ffffff' : 'transparent')

    loading.style.display = 'none'
    canvas.style.display  = 'block'

    chartRef.current = new Chart(canvas.getContext('2d'), {
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
        ...baseChartOptions(
          v => '$' + v.toLocaleString('en-US', { maximumFractionDigits: 0 }),
          ctx => ctx.parsed.y != null
            ? ' $' + ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : ''
        ),
        animation: { duration: 400 },
        plugins: {
          ...baseChartOptions().plugins,
          tooltip: {
            ...baseChartOptions().plugins?.tooltip,
            callbacks: {
              title: items => items[0].label + (purchaseDates.has(items[0].label) ? '  ● PURCHASE' : ''),
              label: ctx  => ctx.parsed.y != null
                ? ' $' + ctx.parsed.y.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                : ''
            }
          }
        }
      }
    })

    return () => { if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null } }
  }, [investments, historyBySymbol])

  return (
    <div className="card">
      <div className="card-title">
        PORTFOLIO VALUE OVER TIME{' '}
        <span style={{ fontSize: 8, color: 'var(--white)', letterSpacing: 1 }}>&mdash; &bull; MARKS PURCHASE DATES</span>
      </div>
      <div className="portfolio-chart-wrap">
        <div className="chart-loading" ref={loadingRef} style={{ display: 'flex' }}>BUILDING CHART &hellip;</div>
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  )
}
