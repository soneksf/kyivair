// E2E-тести ключових сценаріїв у браузері (Playwright + node:test). Запуск: npm run test:e2e
// Номери TC-xx відповідають тест-кейсам у тест-плані.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startServer, openPage, launch } from './helpers.js';

let server, url, browser;
before(async () => { ({ server, url } = await startServer()); browser = await launch(); });
after(async () => { await browser.close(); server.close(); });

const ready = (page) => page.waitForFunction(() => document.querySelectorAll('.rank-row').length === 10
  && !document.querySelector('#status').textContent.includes('Завантаження'));

test('TC-01 Головна сторінка: карта з 10 районами, легенда, без помилок у консолі', async () => {
  const { page, ctx, errors } = await openPage(browser, url + '?mock=1');
  await ready(page);
  assert.equal(await page.locator('.map-district').count(), 10);
  assert.equal(await page.locator('#legend li').count(), 7); // 6 категорій + «Немає даних»
  assert.match(await page.locator('#status').textContent(), /Оновлено/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('TC-02 Колір району на карті відповідає категорії AQI', async () => {
  const { page, ctx } = await openPage(browser, url + '?mock=1');
  await ready(page);
  const rows = await page.$$eval('.map-district', (els) => els.map((e) => ({
    label: e.getAttribute('aria-label'), fill: e.style.fill,
  })));
  const { getAqiLevel } = await import('../../js/aqi.js');
  const hexToRgb = (h) => `rgb(${[1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ')})`;
  for (const r of rows) {
    const aqi = Number(r.label.match(/AQI (\d+)/)[1]);
    assert.equal(r.fill, hexToRgb(getAqiLevel(aqi).color), r.label);
    assert.ok(r.label.endsWith(getAqiLevel(aqi).label), r.label);
  }
  await ctx.close();
});

test('TC-03 Клік по району на карті відкриває його картку й оновлює адресу', async () => {
  const { page, ctx } = await openPage(browser, url + '?mock=1');
  await ready(page);
  await page.click('.map-district[data-id="darnytskyi"]');
  assert.equal(await page.locator('#p-name').textContent(), 'Дарницький район');
  assert.equal(new URL(page.url()).hash, '#darnytskyi');
  assert.equal(await page.locator('.map-district[data-id="darnytskyi"]').getAttribute('aria-pressed'), 'true');
  const mapAqi = (await page.getAttribute('.map-district[data-id="darnytskyi"]', 'aria-label')).match(/AQI (\d+)/)[1];
  assert.equal(await page.locator('#p-aqi').textContent(), mapAqi); // однакове значення на карті й у картці
  await ctx.close();
});

test('TC-04 Вибір району з клавіатури (Tab + Enter)', async () => {
  const { page, ctx } = await openPage(browser, url + '?mock=1');
  await ready(page);
  await page.focus('.map-district[data-id="obolonskyi"]');
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('#p-name').textContent(), 'Оболонський район');
  await ctx.close();
});

test('TC-05 Рейтинг відсортований за спаданням AQI і перемикає район', async () => {
  const { page, ctx } = await openPage(browser, url + '?mock=1');
  await ready(page);
  const vals = (await page.$$eval('.rank-val', (e) => e.map((x) => x.textContent))).map(Number);
  assert.deepEqual(vals, [...vals].sort((a, b) => b - a));
  await page.click('.rank-row[data-id="holosiivskyi"]');
  assert.equal(await page.locator('#p-name').textContent(), 'Голосіївський район');
  await ctx.close();
});

test('TC-06 Пряме посилання на район через #id', async () => {
  const { page, ctx } = await openPage(browser, url + '?mock=1#pecherskyi');
  await ready(page);
  assert.equal(await page.locator('#p-name').textContent(), 'Печерський район');
  await ctx.close();
});

test('TC-07 Графік історії: перемикання 24 год / 7 днів', async () => {
  const { page, ctx } = await openPage(browser, url + '?mock=1');
  await ready(page);
  await page.waitForFunction(() => document.querySelector('#chart-note').hidden);
  const avg24 = await page.locator('#c-avg').textContent();
  await page.click('[data-hours="168"]');
  assert.equal(await page.getAttribute('[data-hours="168"]', 'aria-pressed'), 'true');
  await page.waitForFunction((a) => document.querySelector('#c-avg').textContent !== a, avg24, { timeout: 3000 }).catch(() => {});
  assert.match(await page.locator('#c-max').textContent(), /^\d+$/);
  await ctx.close();
});

test('TC-08 Датчики не передають дані → «Немає даних», сірий колір, решта працює', async () => {
  const { page, ctx, errors } = await openPage(browser, url + '?mock=1&scenario=offline#podilskyi');
  await ready(page);
  assert.equal(await page.locator('#p-aqi').textContent(), '—');
  assert.equal(await page.locator('#p-level').textContent(), 'Немає даних');
  assert.ok(await page.locator('.map-district[data-id="podilskyi"]').evaluate((e) => e.classList.contains('is-nodata')));
  const last = await page.$$eval('.rank-row', (r) => r.slice(-2).map((x) => x.dataset.id).sort());
  assert.deepEqual(last, ['darnytskyi', 'podilskyi']); // райони без даних — в кінці списку
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('TC-09 Помилка сервера → повідомлення і кнопка «Спробувати ще раз»', async () => {
  const { page, ctx } = await openPage(browser, url + '?mock=1&scenario=error');
  await page.waitForSelector('#error:not([hidden])');
  assert.match(await page.locator('#error-text').textContent(), /503/);
  assert.ok(await page.locator('#retry').isVisible());
  await ctx.close();
});

test('TC-10 Застарілі дані (> 2 год) позначаються попередженням', async () => {
  const { page, ctx } = await openPage(browser, url + '?mock=1&scenario=stale');
  await ready(page);
  assert.match(await page.locator('#status').textContent(), /застаріли/);
  assert.ok(await page.locator('#p-stale').isVisible());
  await ctx.close();
});

test('TC-11 Високий рівень забруднення (AQI 342) → «Небезпечно»', async () => {
  const { page, ctx } = await openPage(browser, url + '?mock=1&scenario=hazard#dniprovskyi');
  await ready(page);
  assert.equal(await page.locator('#p-aqi').textContent(), '342');
  assert.equal(await page.locator('#p-level').textContent(), 'Небезпечно');
  assert.equal(await page.$eval('.rank-row', (r) => r.dataset.id), 'dniprovskyi');
  await ctx.close();
});

test('TC-12 Мобільна ширина 360 px: немає горизонтальної прокрутки', async () => {
  const { page, ctx } = await openPage(browser, url + '?mock=1', { viewport: { width: 360, height: 740 } });
  await ready(page);
  const { sw, cw } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  assert.ok(sw <= cw, `scrollWidth ${sw} > ${cw}`);
  await ctx.close();
});

test('TC-13 Режим API (без моку): дані з /api/districts/current відображаються на карті', async () => {
  const { page, ctx } = await openPage(browser, 'about:blank');
  await page.route('**/api/districts/current', (r) => r.fulfill({ json: [
    { id: 'obolonskyi', aqi: 12, pm25: 2.9, pm10: 5, sensorsCount: 4, updatedAt: new Date().toISOString() },
  ] }));
  await page.route('**/api/districts/*/history*', (r) => r.fulfill({ json: [] }));
  await page.goto(url + '#obolonskyi');
  await ready(page);
  assert.equal(await page.locator('#p-aqi').textContent(), '12');
  assert.equal(await page.locator('#demo-badge').isVisible(), false);
  assert.match(await page.getAttribute('.map-district[data-id="darnytskyi"]', 'aria-label'), /Немає даних/);
  assert.equal(await page.locator('#chart-note').textContent(), 'Немає даних за цей період');
  await ctx.close();
});
