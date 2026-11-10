// Клієнт REST API KyivAir (backend/app/main.py). Контракт описано в README.md.
// Без бекенду можна працювати з мок-даними (?mock=1, див. mock-api.js).

import { CONFIG } from './config.js';
import { mockFetchCurrent, mockFetchHistory } from './mock-api.js';
import { isValidAqi } from './aqi.js';
import { DISTRICTS } from './districts.js';

import { ApiError } from './errors.js';

export { ApiError };

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Нормалізує запис поточного стану району; некоректні поля → null. */
export function normalizeCurrent(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string') return null;
  return {
    id: raw.id,
    aqi: isValidAqi(raw.aqi) ? raw.aqi : null,
    pm25: num(raw.pm25),
    pm10: num(raw.pm10),
    dominantPollutant: typeof raw.dominantPollutant === 'string' ? raw.dominantPollutant : null,
    sensorsCount: Number.isInteger(raw.sensorsCount) && raw.sensorsCount >= 0 ? raw.sensorsCount : 0,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

/**
 * Повертає рівно 10 районів у порядку DISTRICTS. Райони, яких немає у відповіді,
 * отримують aqi = null (відображаються як «Немає даних»), невідомі id ігноруються.
 */
export function normalizeCurrentList(payload) {
  const list = Array.isArray(payload) ? payload : payload?.districts;
  if (!Array.isArray(list)) throw new ApiError('Неочікуваний формат відповіді API', 0);
  const byId = new Map(list.map(normalizeCurrent).filter(Boolean).map((d) => [d.id, d]));
  return DISTRICTS.map((d) => byId.get(d.id) ?? {
    id: d.id, aqi: null, pm25: null, pm10: null, dominantPollutant: null, sensorsCount: 0, updatedAt: null,
  });
}

/** Нормалізує історію: відкидає записи без коректного часу, сортує за часом. */
export function normalizeHistory(payload) {
  const list = Array.isArray(payload) ? payload : payload?.points;
  if (!Array.isArray(list)) throw new ApiError('Неочікуваний формат історії', 0);
  return list
    .filter((p) => p && !Number.isNaN(new Date(p.ts).getTime()))
    .map((p) => ({ ts: p.ts, aqi: isValidAqi(p.aqi) ? p.aqi : null, pm25: num(p.pm25), pm10: num(p.pm10) }))
    .sort((a, b) => new Date(a.ts) - new Date(b.ts));
}

async function getJson(path) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CONFIG.requestTimeoutMs);
  try {
    const res = await fetch(CONFIG.apiBase + path, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) throw new ApiError(`Сервер відповів ${res.status}`, res.status);
    return await res.json();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new ApiError(e.name === 'AbortError' ? 'Сервер не відповідає' : 'Немає з’єднання з сервером', 0);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchCurrent() {
  const raw = CONFIG.useMock ? await mockFetchCurrent() : await getJson('/districts/current');
  return normalizeCurrentList(raw);
}

/** hours: 24 або 168 (7 днів). */
export async function fetchHistory(districtId, hours) {
  const to = new Date();
  const from = new Date(to.getTime() - hours * 3600e3);
  const raw = CONFIG.useMock
    ? await mockFetchHistory(districtId, hours)
    : await getJson(`/districts/${encodeURIComponent(districtId)}/history?from=${from.toISOString()}&to=${to.toISOString()}`);
  return normalizeHistory(raw);
}
