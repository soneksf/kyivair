// Графік історії AQI для обраного району (Chart.js, глобальний `Chart`).
import { getAqiLevel } from './aqi.js';

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const fmtHour = new Intl.DateTimeFormat('uk-UA', { hour: '2-digit', minute: '2-digit' });
const fmtDay = new Intl.DateTimeFormat('uk-UA', { day: '2-digit', month: '2-digit' });
const fmtFull = new Intl.DateTimeFormat('uk-UA', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });

let chart = null;

/** points: [{ts, aqi}], hours: 24 | 168 */
export function renderHistory(canvas, points, hours) {
  const Chart = globalThis.Chart;
  if (!Chart) return;
  const labels = points.map((p) => new Date(p.ts));
  const values = points.map((p) => (p.aqi == null ? null : Math.round(p.aqi)));
  const colors = values.map((v) => getAqiLevel(v).color);
  const muted = css('--ink-3');
  const grid = css('--line');

  if (chart) chart.destroy();
  chart = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 2, barPercentage: 0.9, categoryPercentage: 1 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 300 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => fmtFull.format(labels[items[0].dataIndex]),
            label: (item) => `AQI ${item.raw} · ${getAqiLevel(item.raw).label}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: muted, maxRotation: 0, autoSkip: true, maxTicksLimit: hours > 24 ? 7 : 8,
            callback: (_, i) => (hours > 24 ? fmtDay.format(labels[i]) : fmtHour.format(labels[i])),
          },
        },
        y: { beginAtZero: true, suggestedMax: 100, grid: { color: grid }, border: { display: false }, ticks: { color: muted, maxTicksLimit: 5 } },
      },
    },
  });
  return chart;
}

export function destroyHistory() {
  if (chart) { chart.destroy(); chart = null; }
}
