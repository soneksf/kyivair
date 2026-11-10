// Інтерактивна карта районів (SCRUM-19). Малює SVG з GeoJSON у координатах lon/lat.

import { DISTRICT_SHAPES, RIVER, districtName } from './districts.js';
import { getAqiLevel, formatAqi } from './aqi.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 600;
const PAD = 12;

/** Проста рівнокутна проєкція з поправкою на широту Києва. Повертає функцію [lon,lat] → [x,y]. */
export function makeProjection(features, width = W, pad = PAD) {
  const pts = features.flatMap((f) => f.geometry.coordinates.flat());
  const lons = pts.map((p) => p[0]);
  const lats = pts.map((p) => p[1]);
  const [minLon, maxLon, minLat, maxLat] = [Math.min(...lons), Math.max(...lons), Math.min(...lats), Math.max(...lats)];
  const k = Math.cos(((minLat + maxLat) / 2) * Math.PI / 180);
  const scale = (width - 2 * pad) / ((maxLon - minLon) * k);
  const height = (maxLat - minLat) * scale + 2 * pad;
  const project = ([lon, lat]) => [pad + (lon - minLon) * k * scale, pad + (maxLat - lat) * scale];
  return { project, width, height };
}

/** Центроїд багатокутника (для підпису). */
export function centroid(ring) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  return a === 0 ? ring[0] : [cx / (3 * a), cy / (3 * a)];
}

const el = (tag, attrs = {}) => {
  const n = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const pathD = (ring, project) => ring.map((p, i) => (i ? 'L' : 'M') + project(p).map((v) => v.toFixed(1)).join(',')).join('') + 'Z';

/**
 * Створює карту в контейнері. onSelect(id) викликається при кліку / Enter / Space.
 * Повертає { update(dataById, selectedId) }.
 */
export function createMap(container, onSelect) {
  const { project, width, height } = makeProjection(DISTRICT_SHAPES.features);
  const svg = el('svg', { viewBox: `0 0 ${width} ${height.toFixed(0)}`, role: 'group', 'aria-label': 'Карта районів Києва' });
  svg.classList.add('map-svg');

  svg.append(el('path', { d: pathD(RIVER, project), class: 'map-river' }));
  const labels = el('g', { class: 'map-labels', 'aria-hidden': 'true' });
  const nodes = new Map();

  for (const f of DISTRICT_SHAPES.features) {
    const id = f.properties.id;
    const ring = f.geometry.coordinates[0];
    const p = el('path', { d: pathD(ring, project), class: 'map-district', tabindex: '0', role: 'button', 'data-id': id });
    p.addEventListener('click', () => onSelect(id));
    p.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(id); }
    });
    const title = el('title');
    p.append(title);
    svg.append(p);

    const [cx, cy] = project(centroid(ring));
    const name = el('text', { x: cx.toFixed(1), y: (cy - 4).toFixed(1), class: 'map-name' });
    name.textContent = districtName(id);
    const val = el('text', { x: cx.toFixed(1), y: (cy + 15).toFixed(1), class: 'map-value' });
    labels.append(name, val);
    nodes.set(id, { p, title, name, val });
  }
  svg.append(labels);

  const riverLabel = el('text', { class: 'map-river-label', 'aria-hidden': 'true' });
  const [rx, ry] = project([30.655, 50.262]);
  riverLabel.setAttribute('transform', `translate(${rx.toFixed(1)},${ry.toFixed(1)}) rotate(-68)`);
  riverLabel.textContent = 'Дніпро';
  svg.insertBefore(riverLabel, labels);

  container.replaceChildren(svg);

  return {
    update(dataById, selectedId) {
      for (const [id, n] of nodes) {
        const d = dataById.get(id);
        const lvl = getAqiLevel(d?.aqi);
        n.p.style.fill = lvl.color;
        n.p.classList.toggle('is-selected', id === selectedId);
        n.p.classList.toggle('is-nodata', lvl.key === 'no-data');
        n.p.setAttribute('aria-pressed', String(id === selectedId));
        const label = `${districtName(id)}: AQI ${formatAqi(d?.aqi)}, ${lvl.label}`;
        n.p.setAttribute('aria-label', label);
        n.title.textContent = label;
        for (const t of [n.name, n.val]) { t.style.fill = lvl.text; t.style.stroke = lvl.color; }
        n.val.textContent = formatAqi(d?.aqi);
      }
      // обраний район — поверх інших, щоб обведення не перекривалося сусідами
      const sel = nodes.get(selectedId);
      if (sel) sel.p.parentNode.insertBefore(sel.p, sel.p.parentNode.querySelector('.map-river-label'));
    },
  };
}
