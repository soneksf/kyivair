// KyivAir — головний модуль сторінки.
import { CONFIG } from './config.js';
import { fetchCurrent, fetchHistory } from './api.js';
import { AQI_LEVELS, NO_DATA, getAqiLevel, formatAqi, isStale, formatAgo } from './aqi.js';
import { DISTRICTS, districtName } from './districts.js';
import { createMap } from './map.js';
import { renderHistory } from './chart.js';

const $ = (sel) => document.querySelector(sel);
const DEFAULT_DISTRICT = 'shevchenkivskyi';
const POLLUTANT = { pm25: 'PM2.5', pm10: 'PM10', no2: 'NO₂', o3: 'O₃' };

const state = {
  data: new Map(),          // id → поточні дані
  selected: DEFAULT_DISTRICT,
  hours: 24,
  loading: false,
  error: null,
};

const map = createMap($('#map'), (id) => {
  select(id);
  // на телефоні панель району — під картою: прокручуємо до неї
  if (matchMedia('(max-width: 860px)').matches) $('#panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ---------- легенда (SCRUM-20) ----------
function renderLegend() {
  const items = [...AQI_LEVELS, NO_DATA].map((l) => `
    <li class="legend-item" data-level="${l.key}">
      <span class="legend-swatch" style="background:${l.color}"></span>
      <span class="legend-range">${l.min == null ? '—' : l.max === 500 ? `${l.min}+` : `${l.min}–${l.max}`}</span>
      <span class="legend-label">${l.label}</span>
    </li>`).join('');
  $('#legend').innerHTML = items;
}

// ---------- шапка: час оновлення ----------
function renderStatus() {
  const times = [...state.data.values()].map((d) => d.updatedAt).filter(Boolean).map((t) => new Date(t));
  const latest = times.length ? new Date(Math.max(...times)) : null;
  const status = $('#status');
  status.classList.toggle('is-stale', !!latest && isStale(latest));
  if (state.loading && !latest) status.textContent = 'Завантаження даних…';
  else if (!latest) status.textContent = 'Дані недоступні';
  else status.textContent = `Оновлено ${formatAgo(latest)}${isStale(latest) ? ' · дані застаріли' : ''}`;
  $('#refresh').disabled = state.loading;
  $('#refresh').setAttribute('aria-busy', String(state.loading));
}

function renderError() {
  const box = $('#error');
  box.hidden = !state.error;
  if (state.error) $('#error-text').textContent = `Не вдалося завантажити дані: ${state.error}. Перевірте з’єднання та спробуйте ще раз.`;
}

// ---------- панель району ----------
function renderPanel() {
  const d = state.data.get(state.selected);
  const lvl = getAqiLevel(d?.aqi);
  const panel = $('#panel');
  panel.style.setProperty('--level', lvl.color);
  panel.style.setProperty('--level-ink', lvl.text);
  $('#p-name').textContent = `${districtName(state.selected)} район`;
  $('#p-aqi').textContent = formatAqi(d?.aqi);
  $('#p-level').textContent = lvl.label;
  $('#p-advice').textContent = lvl.advice;
  $('#p-pm25').textContent = d?.pm25 != null ? d.pm25.toFixed(1) : '—';
  $('#p-pm10').textContent = d?.pm10 != null ? d.pm10.toFixed(1) : '—';
  $('#p-sensors').textContent = d ? String(d.sensorsCount) : '—';
  $('#p-dominant').textContent = d?.dominantPollutant ? (POLLUTANT[d.dominantPollutant] ?? d.dominantPollutant) : '—';
  const upd = d?.updatedAt;
  const stale = upd ? isStale(upd) : false;
  $('#p-updated').textContent = upd ? `Виміряно ${formatAgo(upd)}` : 'Немає свіжих вимірювань';
  $('#p-stale').hidden = !stale;
}

async function loadHistory() {
  const id = state.selected;
  const hours = state.hours;
  const note = $('#chart-note');
  note.textContent = 'Завантаження…';
  note.hidden = false;
  try {
    const pts = await fetchHistory(id, hours);
    if (id !== state.selected || hours !== state.hours) return; // користувач уже обрав інше
    const valid = pts.filter((p) => p.aqi != null);
    if (!valid.length) { note.textContent = 'Немає даних за цей період'; renderHistory($('#chart'), [], hours); return; }
    note.hidden = true;
    renderHistory($('#chart'), pts, hours);
    const vals = valid.map((p) => p.aqi);
    $('#c-avg').textContent = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    $('#c-max').textContent = Math.round(Math.max(...vals));
    $('#c-min').textContent = Math.round(Math.min(...vals));
  } catch (e) {
    if (id === state.selected) note.textContent = `Не вдалося завантажити історію: ${e.message}`;
  }
}

// ---------- рейтинг районів ----------
function renderRanking() {
  const rows = DISTRICTS.map((d) => ({ ...d, cur: state.data.get(d.id) }))
    .sort((a, b) => (b.cur?.aqi ?? -1) - (a.cur?.aqi ?? -1));
  const max = Math.max(150, ...rows.map((r) => r.cur?.aqi ?? 0));
  $('#ranking').innerHTML = rows.map((r) => {
    const lvl = getAqiLevel(r.cur?.aqi);
    const w = r.cur?.aqi != null ? Math.max(2, (r.cur.aqi / max) * 100) : 0;
    return `<li>
      <button type="button" class="rank-row${r.id === state.selected ? ' is-selected' : ''}" data-id="${r.id}" aria-pressed="${r.id === state.selected}">
        <span class="rank-name">${r.name}</span>
        <span class="rank-bar"><span style="width:${w.toFixed(1)}%;background:${lvl.color}"></span></span>
        <span class="rank-val">${formatAqi(r.cur?.aqi)}</span>
        <span class="rank-level" style="background:${lvl.color};color:${lvl.text}">${lvl.label}</span>
      </button></li>`;
  }).join('');
}

function renderAll() {
  map.update(state.data, state.selected);
  renderPanel();
  renderRanking();
  renderStatus();
  renderError();
}

// ---------- дії ----------
function select(id, { updateHash = true } = {}) {
  if (!DISTRICTS.some((d) => d.id === id)) return;
  state.selected = id;
  if (updateHash && location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`);
  renderAll();
  loadHistory();
}

async function refresh() {
  state.loading = true;
  renderStatus();
  try {
    const list = await fetchCurrent();
    state.data = new Map(list.map((d) => [d.id, d]));
    state.error = null;
  } catch (e) {
    state.error = e.message; // попередні дані (якщо були) лишаються на екрані
  } finally {
    state.loading = false;
    renderAll();
  }
  loadHistory();
}

$('#ranking').addEventListener('click', (e) => {
  const b = e.target.closest('.rank-row');
  if (b) select(b.dataset.id);
});
$('#refresh').addEventListener('click', refresh);
$('#retry').addEventListener('click', refresh);
document.querySelectorAll('[data-hours]').forEach((b) => b.addEventListener('click', () => {
  state.hours = Number(b.dataset.hours);
  document.querySelectorAll('[data-hours]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  loadHistory();
}));
window.addEventListener('hashchange', () => select(location.hash.slice(1), { updateHash: false }));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => loadHistory());

if (CONFIG.useMock) $('#demo-badge').hidden = false;
const fromHash = location.hash.slice(1);
if (DISTRICTS.some((d) => d.id === fromHash)) state.selected = fromHash;
renderLegend();
renderAll();
refresh();
setInterval(refresh, CONFIG.refreshMs);
