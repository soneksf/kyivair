// KyivAir — шкала AQI (SCRUM-20).
// Межі категорій відповідають шкалі US EPA AQI (0–500).
// Тексти порад — чернетка; остаточні формулювання погоджує PO (Олеся).

export const AQI_MIN = 0;
export const AQI_MAX = 500;
export const STALE_AFTER_MIN = 120; // дані старші за 2 год вважаємо застарілими

export const AQI_LEVELS = [
  {
    key: 'good', min: 0, max: 50, label: 'Добре', color: '#2f9a4c', text: '#ffffff',
    advice: 'Повітря чисте. Чудовий час для прогулянок і спорту надворі.',
  },
  {
    key: 'moderate', min: 51, max: 100, label: 'Помірно', color: '#f2c335', text: '#1c2430',
    advice: 'Прийнятна якість. Дуже чутливим людям варто скоротити тривалі навантаження надворі.',
  },
  {
    key: 'usg', min: 101, max: 150, label: 'Шкідливо для чутливих', color: '#f08a24', text: '#1c2430',
    advice: 'Дітям, людям похилого віку та з хворобами дихальних шляхів краще обмежити час надворі.',
  },
  {
    key: 'unhealthy', min: 151, max: 200, label: 'Шкідливо', color: '#e0453a', text: '#ffffff',
    advice: 'Скоротіть активність надворі, зачиніть вікна. Чутливим людям — залишатися вдома.',
  },
  {
    key: 'very-unhealthy', min: 201, max: 300, label: 'Дуже шкідливо', color: '#8e44ad', text: '#ffffff',
    advice: 'Уникайте перебування надворі. Якщо є очищувач повітря — увімкніть його.',
  },
  {
    key: 'hazardous', min: 301, max: 500, label: 'Небезпечно', color: '#7e0023', text: '#ffffff',
    advice: 'Небезпечний рівень забруднення. Залишайтеся в приміщенні з зачиненими вікнами.',
  },
];

export const NO_DATA = {
  key: 'no-data', min: null, max: null, label: 'Немає даних', color: '#9aa4b2', text: '#ffffff',
  advice: 'Датчики в районі зараз не передають дані (можливо, через відключення світла). Спробуйте пізніше.',
};

/** Чи є значення коректним AQI (скінченне число ≥ 0). */
export function isValidAqi(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= AQI_MIN;
}

/**
 * Категорія для значення AQI. Дробові значення округлюються (50.4 → 50 «Добре»,
 * 50.5 → 51 «Помірно»), значення > 500 — «Небезпечно», некоректні — «Немає даних».
 */
export function getAqiLevel(value) {
  if (!isValidAqi(value)) return NO_DATA;
  const v = Math.round(value);
  return AQI_LEVELS.find((l) => v <= l.max) ?? AQI_LEVELS[AQI_LEVELS.length - 1];
}

/** Текст для відображення AQI: ціле число або «—». */
export function formatAqi(value) {
  return isValidAqi(value) ? String(Math.round(value)) : '—';
}

/** Чи застарілі дані відносно `now` (за замовчуванням — поточний час). */
export function isStale(updatedAt, now = new Date(), maxAgeMin = STALE_AFTER_MIN) {
  const t = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  if (Number.isNaN(t.getTime())) return true;
  return (now.getTime() - t.getTime()) / 60000 > maxAgeMin;
}

/** «щойно», «12 хв тому», «3 год тому», «2 дн. тому». */
export function formatAgo(updatedAt, now = new Date()) {
  const t = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  if (Number.isNaN(t.getTime())) return 'невідомо';
  const min = Math.max(0, Math.floor((now.getTime() - t.getTime()) / 60000));
  if (min < 1) return 'щойно';
  if (min < 60) return `${min} хв тому`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} год тому`;
  return `${Math.floor(h / 24)} дн. тому`;
}
