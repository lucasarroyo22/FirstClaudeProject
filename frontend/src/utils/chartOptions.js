export const baseChartOptions = (yCallback, tooltipLabelCallback, maxTicksX = 8) => ({
  responsive: true,
  maintainAspectRatio: false,
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
        label: tooltipLabelCallback
      }
    }
  },
  scales: {
    x: {
      grid:  { color: '#1a1a1a' },
      ticks: { color: '#555', maxTicksLimit: maxTicksX, font: { family: 'Courier New', size: 10 } }
    },
    y: {
      position: 'right',
      grid:  { color: '#1a1a1a' },
      ticks: { color: '#555', font: { family: 'Courier New', size: 10 }, callback: yCallback }
    }
  },
  interaction: { mode: 'index', intersect: false }
})

export const priceDataset = (prices, extra = {}) => ({
  data: prices,
  borderColor: '#e8002d',
  backgroundColor: 'rgba(232,0,45,0.07)',
  borderWidth: 2,
  pointRadius: 0,
  pointHoverRadius: 5,
  pointHoverBackgroundColor: '#e8002d',
  pointHoverBorderColor: '#fff',
  pointHoverBorderWidth: 1,
  tension: 0.1,
  fill: true,
  ...extra
})
