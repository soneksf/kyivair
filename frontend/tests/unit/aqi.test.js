// Модульні тести шкали AQI (SCRUM-20). Запуск: npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { AQI_LEVELS, getAqiLevel, formatAqi, isValidAqi, isStale, formatAgo } from '../../js/aqi.js';

describe('UT-01 Межі категорій AQI (граничні значення)', () => {
  const cases = [
    [0, 'good'], [50, 'good'], [51, 'moderate'], [100, 'moderate'], [101, 'usg'], [150, 'usg'],
    [151, 'unhealthy'], [200, 'unhealthy'], [201, 'very-unhealthy'], [300, 'very-unhealthy'],
    [301, 'hazardous'], [500, 'hazardous'],
  ];
  for (const [v, key] of cases) test(`AQI ${v} → ${key}`, () => assert.equal(getAqiLevel(v).key, key));
});

test('UT-02 Значення понад 500 — «Небезпечно»', () => {
  assert.equal(getAqiLevel(501).key, 'hazardous');
  assert.equal(getAqiLevel(999).key, 'hazardous');
});

test('UT-03 Дробові значення округлюються перед визначенням категорії', () => {
  assert.equal(getAqiLevel(50.4).key, 'good');
  assert.equal(getAqiLevel(50.5).key, 'moderate');
  assert.equal(formatAqi(87.6), '88');
});

test('UT-04 Некоректні значення → «Немає даних» і прочерк', () => {
  for (const v of [null, undefined, NaN, Infinity, -1, '42', {}]) {
    assert.equal(getAqiLevel(v).key, 'no-data', String(v));
    assert.equal(formatAqi(v), '—');
    assert.equal(isValidAqi(v), false);
  }
});

test('UT-05 Шкала неперервна: без пропусків і перекриттів 0–500', () => {
  assert.equal(AQI_LEVELS[0].min, 0);
  assert.equal(AQI_LEVELS.at(-1).max, 500);
  for (let i = 1; i < AQI_LEVELS.length; i++) assert.equal(AQI_LEVELS[i].min, AQI_LEVELS[i - 1].max + 1);
});

test('UT-06 Кожна категорія має назву, колір і пораду', () => {
  for (const l of AQI_LEVELS) {
    assert.ok(l.label && l.advice, l.key);
    assert.match(l.color, /^#[0-9a-f]{6}$/i);
  }
});

test('UT-07 Контраст тексту на кольорі категорії ≥ 3:1 (WCAG для великого тексту)', () => {
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((x) => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  for (const l of AQI_LEVELS) {
    const [a, b] = [lum(l.color), lum(l.text)].sort((x, y) => y - x);
    assert.ok((a + 0.05) / (b + 0.05) >= 3, `${l.key}: ${((a + 0.05) / (b + 0.05)).toFixed(2)}`);
  }
});

describe('UT-08 Актуальність даних', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  test('дані 119 хв тому — свіжі', () => assert.equal(isStale('2026-11-10T10:01:00Z', now), false));
  test('дані 121 хв тому — застарілі', () => assert.equal(isStale('2026-11-10T09:59:00Z', now), true));
  test('некоректна дата — застарілі', () => assert.equal(isStale('not a date', now), true));
  test('formatAgo', () => {
    assert.equal(formatAgo('2026-11-10T11:59:40Z', now), 'щойно');
    assert.equal(formatAgo('2026-11-10T11:48:00Z', now), '12 хв тому');
    assert.equal(formatAgo('2026-11-10T09:00:00Z', now), '3 год тому');
    assert.equal(formatAgo('2026-11-08T11:00:00Z', now), '2 дн. тому');
    assert.equal(formatAgo('bad', now), 'невідомо');
  });
});
