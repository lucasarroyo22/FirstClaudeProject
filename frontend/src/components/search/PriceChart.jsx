import { useEffect, useRef } from 'react'
import { Chart } from 'chart.js/auto'
import { tsLabel } from '../../utils/format'
import { baseChartOptions, priceDataset } from '../../utils/chartOptions'

export default function PriceChart({ symbol, period, height = '260px' }) {
  const canvasRef  = useRef(null)
  const chartRef   = useRef(null)
  const loadingRef = useRef(null)

  useEffect(() => {
    if (!symbol) return

    const loading = loadingRef.current
    const canvas  = canvasRef.current
    if (!loading || !canvas) return

    if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
    loading.textContent  = 'LOADING CHART …'
    loading.style.display = 'flex'
    canvas.style.display  = 'none'

    let cancelled = false

    fetch(`/api/chart?symbol=${encodeURIComponent(symbol)}&period=${period}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (data.error || !data.timestamps?.length) {
          loading.textContent = 'NO DATA AVAILABLE'
          return
        }
        const labels = data.timestamps.map(ts => tsLabel(ts, period))
        loading.style.display = 'none'
        canvas.style.display  = 'block'
        chartRef.current = new Chart(canvas.getContext('2d'), {
          type: 'line',
          data: { labels, datasets: [priceDataset(data.prices)] },
          options: {
            ...baseChartOptions(
              v => '$' + v.toFixed(2),
              ctx => ' $' + ctx.parsed.y.toFixed(2)
            ),
            animation: { duration: 350 }
          }
        })
      })
      .catch(() => {
        if (!cancelled && loading) {
          loading.style.display = 'flex'
          loading.textContent   = 'CHART UNAVAILABLE'
        }
      })

    return () => {
      cancelled = true
      if (chartRef.current) { chartRef.current.destroy(); chartRef.current = null }
    }
  }, [symbol, period])

  return (
    <div className="chart-container" style={{ height }}>
      <div className="chart-loading" ref={loadingRef} style={{ display: 'flex' }}>LOADING CHART …</div>
      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}
