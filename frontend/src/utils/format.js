export const fmt = n =>
  '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const pct = n => (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'

export const neg = n => (n < 0 ? 'neg' : '')

export const tsLabel = (ts, period) => {
  const d = new Date(ts)
  if (period === 'daily')   return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  if (period === 'alltime') return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', timeZone: 'UTC' })
  if (period === 'yearly')  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', timeZone: 'UTC' })
}
