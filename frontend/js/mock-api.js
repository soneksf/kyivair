// Мок-дані у форматі майбутнього REST API. Значення детерміновані (залежать від району й години),
// тож при перезавантаженні сторінка показує ті самі числа — зручно для тестування.

import { CONFIG } from './config.js';
import { DISTRICTS } from './districts.js';
import { ApiError } from './errors.js';

const BASE = {
  obolonskyi: 42, podilskyi: 58, sviatoshynskyi: 47, shevchenkivskyi: 66, pecherskyi: 61,
  solomianskyi: 72, holosiivskyi: 38, desnianskyi: 55, dniprovskyi: 80, darnytskyi: 104,
};

function rng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hash = (str) => [...str].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) | 0, 7);

function aqiAt(id, hourTs) {
  const r = rng(hash(id) ^ Math.floor(hourTs / 3600e3));
  const d = new Date(hourTs);
  const h = d.getHours();
  const rush = Math.exp(-((h - 8.5) ** 2) / 4) + Math.exp(-((h - 19) ** 2) / 5); // ранкова й вечірня година пік
  const v = BASE[id] * (0.75 + 0.45 * rush) + (r() - 0.5) * 18;
  return Math.max(5, Math.round(v));
}

// Приблизне зворотне перетворення AQI → PM2.5 (лише для наочності мок-даних).
const pm25FromAqi = (aqi) => +(aqi <= 50 ? aqi * 0.18 : aqi <= 100 ? 9 + (aqi - 51) * 0.53 : 35.5 + (aqi - 101) * 0.4).toFixed(1);

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const hourFloor = (t) => Math.floor(t / 3600e3) * 3600e3;

export async function mockFetchCurrent() {
  await delay(250);
  const sc = CONFIG.scenario;
  if (sc === 'error') {
    throw new ApiError('Сервер відповів 503', 503);
  }
  const now = Date.now();
  const updated = sc === 'stale' ? now - 5 * 3600e3 : now - 12 * 60e3;
  return DISTRICTS.map((d) => {
    if (sc === 'offline' && (d.id === 'darnytskyi' || d.id === 'podilskyi')) {
      return { id: d.id, aqi: null, pm25: null, pm10: null, dominantPollutant: null, sensorsCount: 0, updatedAt: null };
    }
    let aqi = aqiAt(d.id, hourFloor(updated));
    if (sc === 'hazard' && d.id === 'dniprovskyi') aqi = 342;
    const pm25 = pm25FromAqi(aqi);
    return {
      id: d.id, aqi, pm25, pm10: +(pm25 * 1.6).toFixed(1), dominantPollutant: 'pm25',
      sensorsCount: 2 + (Math.abs(hash(d.id)) % 7), updatedAt: new Date(updated).toISOString(),
    };
  });
}

export async function mockFetchHistory(id, hours) {
  await delay(150);
  if (CONFIG.scenario === 'error') {
    throw new ApiError('Сервер відповів 503', 503);
  }
  const end = hourFloor(Date.now());
  const pts = [];
  for (let i = hours - 1; i >= 0; i--) {
    const ts = end - i * 3600e3;
    // імітація «дірки» в даних (блекаут) у сценарії offline
    if (CONFIG.scenario === 'offline' && i >= 5 && i < 9) { pts.push({ ts: new Date(ts).toISOString(), aqi: null }); continue; }
    const aqi = aqiAt(id, ts);
    pts.push({ ts: new Date(ts).toISOString(), aqi, pm25: pm25FromAqi(aqi) });
  }
  return pts;
}
