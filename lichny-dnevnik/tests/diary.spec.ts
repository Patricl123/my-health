import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
async function login(page: Page) {
  await page.goto('/');
  await page.getByLabel('Электронная почта').fill('owner@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill('Test-only-password-2026');
  await page.getByRole('button', { name: 'Войти в дневник' }).click();
  await expect(page.getByRole('heading', { name: 'Как вы сегодня?' })).toBeVisible();
  await expect(page.getByLabel('Обычный дневник')).toBeEnabled();
}
async function saved(page: Page) { await expect(page.getByRole('status').filter({ hasText: /^Сохранено$/ })).toBeVisible(); }
test('мобильный путь: вход → свободная запись → сервер → повторное открытие → изменение', async ({ page, browser }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await login(page);
  await page.getByLabel('Обычный дневник').fill('Сегодня записываю только мысли.');
  await page.getByRole('button', { name: 'Сохранить запись', exact: true }).click(); await saved(page);
  await page.reload(); await expect(page.getByLabel('Обычный дневник')).toHaveValue('Сегодня записываю только мысли.'); await saved(page);
  await page.getByRole('button', { name: 'Стресс 4 из 10', exact: true }).click();
  await page.getByRole('button', { name: 'Спокойно', exact: true }).click();
  await page.getByLabel('Что тревожило или помогло успокоиться?').fill('Помогла прогулка.');
  await page.getByRole('button', { name: 'Добавить приём пищи', exact: true }).click();
  await page.getByLabel('Время', { exact: true }).fill('09:15');
  await page.getByLabel('Что вы ели?').fill('Каша и чай');
  await page.getByRole('button', { name: 'Добавить', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить запись', exact: true }).click(); await saved(page);
  // Fresh browser storage represents another phone.
  const context2 = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const second = await context2.newPage(); await login(second);
  await expect(second.getByLabel('Обычный дневник')).toHaveValue('Сегодня записываю только мысли.');
  await expect(second.getByRole('button', { name: 'Стресс 4 из 10', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(second.getByRole('button', { name: /Изменить приём пищи 09:15/ })).toBeVisible();
  await second.getByLabel('Обычный дневник').fill('Изменено со второго устройства.');
  await second.getByRole('button', { name: 'Сохранить запись', exact: true }).click(); await saved(second);
  await page.reload(); await expect(page.getByLabel('Обычный дневник')).toHaveValue('Изменено со второго устройства.');
  await page.screenshot({ path: 'test-results/mobile-today.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 1024 });
  await page.screenshot({ path: 'test-results/desktop-today.png', fullPage: true });
  await context2.close(); expect(errors).toEqual([]);
});
test('история, пустые дни, стресс 0, резервная копия и удаление с подтверждением', async ({ page }) => {
  await login(page); await page.getByRole('navigation', { name: 'Мобильное меню' }).getByRole('button', { name: 'История' }).click();
  await page.getByLabel('Дата записи', { exact: true }).fill('2026-01-08');
  await expect(page.getByLabel('Обычный дневник')).toBeEnabled(); await expect(page.getByLabel('Обычный дневник')).toHaveValue('');
  await expect(page.getByRole('status')).toContainText('Пока нет записи');
  await page.getByRole('button', { name: 'Стресс 0 из 10', exact: true }).click();
  await page.getByRole('button', { name: 'Сохранить запись', exact: true }).click(); await saved(page);
  await page.reload();
  await page.getByRole('navigation', { name: 'Мобильное меню' }).getByRole('button', { name: 'История' }).click();
  await page.getByLabel('Дата записи', { exact: true }).fill('2026-01-08');
  await expect(page.getByRole('button', { name: 'Стресс 0 из 10', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('navigation', { name: 'Мобильное меню' }).getByRole('button', { name: 'Неделя' }).click();
  await expect(page.getByText('7 января: нет отметки стресса', { exact: true })).toBeAttached();
  await expect(page.getByText('8 января: стресс 0 из 10', { exact: true })).toBeAttached();
  await page.getByRole('navigation', { name: 'Мобильное меню' }).getByRole('button', { name: 'Настройки' }).click();
  const downloading = page.waitForEvent('download'); await page.getByRole('button', { name: 'Скачать все записи' }).click();
  const dl = await downloading; const backup = JSON.parse(await readFile((await dl.path())!, 'utf8'));
  expect(backup.entries.some((e: any) => e.date === '2026-01-08' && e.stress === 0)).toBeTruthy();
  await page.getByRole('navigation', { name: 'Мобильное меню' }).getByRole('button', { name: 'История' }).click();
  await page.getByLabel('Дата записи', { exact: true }).fill('2026-01-08');
  await expect(page.getByRole('button', { name: 'Удалить запись за этот день' })).toBeVisible();
  page.once('dialog', d => d.dismiss()); await page.getByRole('button', { name: 'Удалить запись за этот день' }).click();
  await expect(page.getByRole('button', { name: 'Удалить запись за этот день' })).toBeVisible();
  page.once('dialog', d => d.accept()); await page.getByRole('button', { name: 'Удалить запись за этот день' }).click();
  await expect(page.getByRole('status')).toContainText('Запись удалена');
});
test('обрыв связи: черновик переживает перезагрузку и отправляется повторно', async ({ page, context }) => {
  await login(page);
  await page.getByLabel('Обычный дневник').fill('Черновик до обрыва связи.');
  await context.route('**/v1/projects/demo-tiho/databases/**', route => route.abort());
  await page.getByRole('button', { name: 'Сохранить запись', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Не отправлено');
  await expect(page.getByRole('status')).not.toContainText('Сохранено');
  await page.reload();
  await expect(page.getByLabel('Обычный дневник')).toHaveValue('Черновик до обрыва связи.');
  await expect(page.getByLabel('Обычный дневник')).toBeEnabled();
  await context.unroute('**/v1/projects/demo-tiho/databases/**');
  await page.getByRole('button', { name: 'Повторить отправку' }).click(); await saved(page);
  await page.reload(); await expect(page.getByLabel('Обычный дневник')).toHaveValue('Черновик до обрыва связи.'); await saved(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await context.setOffline(true);
  await page.getByLabel('Обычный дневник').fill('Полностью офлайн, включая перезагрузку.');
  await page.getByRole('button', { name: 'Сохранить запись', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Не отправлено');
  await page.reload();
  await expect(page.getByLabel('Обычный дневник')).toHaveValue('Полностью офлайн, включая перезагрузку.');
  await expect(page.getByLabel('Обычный дневник')).toBeEnabled();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Повторить отправку' }).click(); await saved(page);
});
test('ожидание ответа сервера не показывает «Сохранено»', async ({ page, context }) => {
  await login(page); await page.getByLabel('Обычный дневник').fill('Ждём сервер.');
  let release: (() => void) | undefined;
  await context.route('**/documents:commit', async route => { await new Promise<void>(r => { release = r; }); await route.continue(); });
  await page.getByRole('button', { name: 'Сохранить запись', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Отправляем на сервер');
  await expect(page.getByRole('status')).not.toContainText('Сохранено');
  await expect.poll(() => !!release).toBeTruthy(); release!(); await saved(page);
});
test('конфликт устройств сохраняет локальные мысли и не перезаписывает сервер', async ({ page, browser }) => {
  await login(page);
  const otherContext = await browser.newContext(); const other = await otherContext.newPage(); await login(other);
  await other.getByLabel('Обычный дневник').fill('Новая серверная версия.');
  await other.getByRole('button', { name: 'Сохранить запись', exact: true }).click(); await saved(other);
  await page.getByLabel('Обычный дневник').fill('Мой конфликтующий черновик.');
  await page.getByRole('button', { name: 'Сохранить запись', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('На другом устройстве есть более новая запись');
  await expect(page.getByLabel('Обычный дневник')).toHaveValue('Мой конфликтующий черновик.');
  await other.reload(); await expect(other.getByLabel('Обычный дневник')).toHaveValue('Новая серверная версия.');
  await otherContext.close();
});
test('потерянный ответ после записи: повтор не создаёт вторую серверную версию', async ({ page, context }) => {
  await login(page); await page.getByLabel('Обычный дневник').fill('Ответ потерялся, запись дошла.');
  let commits = 0;
  await context.route('**/documents:commit', async route => {
    commits++; await route.fetch(); await route.abort();
  });
  await page.getByRole('button', { name: 'Сохранить запись', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Не отправлено');
  await page.getByRole('button', { name: 'Повторить отправку' }).click(); await saved(page);
  expect(commits).toBe(1);
  await context.unroute('**/documents:commit');
  await page.reload(); await expect(page.getByLabel('Обычный дневник')).toHaveValue('Ответ потерялся, запись дошла.');
});
test('сервер запрещает анонимные и чужие чтения/запись, проверяет значения', async ({ request }) => {
  const doc = `http://127.0.0.1:8080/v1/projects/demo-tiho/databases/(default)/documents/users/test-owner/entries/${today()}`;
  expect((await request.get(doc)).status()).toBe(403);
  async function token(email: string) { const r = await request.post('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key', { data: { email, password: 'Test-only-password-2026', returnSecureToken: true } }); return (await r.json()).idToken; }
  const other = await token('other@example.test');
  expect((await request.get(doc, { headers: { Authorization: `Bearer ${other}` } })).status()).toBe(403);
  expect((await request.patch(doc, { headers: { Authorization: `Bearer ${other}` }, data: { fields: { diary: { stringValue: 'intrusion' } } } })).status()).toBe(403);
  expect((await request.delete(doc, { headers: { Authorization: `Bearer ${other}` } })).status()).toBe(403);
  const owner = await token('owner@example.test');
  expect((await request.get(doc, { headers: { Authorization: `Bearer ${owner}` } })).status()).toBe(200);
  expect((await request.patch(doc, { headers: { Authorization: `Bearer ${owner}` }, data: { fields: { stress: { integerValue: '99' } } } })).status()).toBe(403);
});
