// Налаштування фронтенду.
// За замовчуванням дані беруться з бекенду (/api). Мок-дані вмикаються параметром ?mock=1
// або автоматично на GitHub Pages, де бекенду немає.
// ?scenario=offline|error|stale|hazard — тестові сценарії мок-даних.
const params = new URLSearchParams(globalThis.location?.search ?? '');

export const CONFIG = {
  apiBase: params.get('api') ?? '/api',           // базова адреса REST API
  useMock: params.get('mock') === '1'
    || (params.get('mock') !== '0' && (globalThis.location?.hostname ?? '').endsWith('github.io')),
  scenario: params.get('scenario') ?? 'normal',   // для QA, див. README
  refreshMs: 10 * 60 * 1000,                      // автооновлення раз на 10 хв (дані — щогодини)
  requestTimeoutMs: 8000,
};
