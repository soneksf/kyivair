// Модульні тести нормалізації відповідей REST API та карти. Запуск: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeCurrentList, normalizeHistory, ApiError } from '../../js/api.js';
import { DISTRICTS, DISTRICT_SHAPES } from '../../js/districts.js';
import { makeProjection, centroid } from '../../js/map.js';

test('UT-09 Відповідь API завжди дає рівно 10 районів у сталому порядку', () => {
  const out = normalizeCurrentList([{ id: 'pecherskyi', aqi: 64, sensorsCount: 3, updatedAt: '2026-11-10T10:00:00Z' }]);
  assert.equal(out.length, 10);
  assert.deepEqual(out.map((d) => d.id), DISTRICTS.map((d) => d.id));
  assert.equal(out.find((d) => d.id === 'pecherskyi').aqi, 64);
  assert.equal(out.find((d) => d.id === 'obolonskyi').aqi, null); // відсутній район → «Немає даних»
});

test('UT-10 Невідомі райони та некоректні поля ігноруються', () => {
  const out = normalizeCurrentList({ districts: [
    { id: 'lviv', aqi: 10 },
    { id: 'darnytskyi', aqi: -5, pm25: 'abc', sensorsCount: 2.5 },
    null, 42,
  ] });
  assert.equal(out.length, 10);
  const d = out.find((x) => x.id === 'darnytskyi');
  assert.equal(d.aqi, null);
  assert.equal(d.pm25, null);
  assert.equal(d.sensorsCount, 0);
});

test('UT-11 Неочікуваний формат відповіді → ApiError', () => {
  assert.throws(() => normalizeCurrentList({ foo: 1 }), ApiError);
  assert.throws(() => normalizeCurrentList(null), ApiError);
  assert.throws(() => normalizeHistory('oops'), ApiError);
});

test('UT-12 Історія сортується за часом, записи з некоректним часом відкидаються', () => {
  const out = normalizeHistory([
    { ts: '2026-11-10T02:00:00Z', aqi: 30 },
    { ts: 'bad', aqi: 99 },
    { ts: '2026-11-10T01:00:00Z', aqi: null },
    { ts: '2026-11-10T03:00:00Z', aqi: 45 },
  ]);
  assert.deepEqual(out.map((p) => p.aqi), [null, 30, 45]);
});

test('UT-13 Геометрія карти: є полігон для кожного району, підписи всередині області малювання', () => {
  const ids = DISTRICT_SHAPES.features.map((f) => f.properties.id).sort();
  assert.deepEqual(ids, DISTRICTS.map((d) => d.id).sort());
  const { project, width, height } = makeProjection(DISTRICT_SHAPES.features);
  for (const f of DISTRICT_SHAPES.features) {
    const ring = f.geometry.coordinates[0];
    assert.deepEqual(ring[0], ring.at(-1), `${f.properties.id}: контур не замкнений`);
    const [x, y] = project(centroid(ring));
    assert.ok(x > 0 && x < width && y > 0 && y < height, f.properties.id);
  }
});
