import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';
import { pdfPageTexts } from './pdfText';

/** Change log (Stitch "Cryptographic audit log"). Fictional Practice data only. */
test.use({ serviceWorkers: 'block' });
const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();

async function open(page: Page, who = /Kim Ellis/) {
  await page.goto('/admin/audit');
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page).not.toHaveURL(/sign-in/);
  await page.evaluate(() => { history.pushState({}, '', '/admin/audit'); dispatchEvent(new PopStateEvent('popstate')); });
}
const rows = (page: Page) => page.getByRole('list', { name: 'Rows' }).getByRole('listitem');
const tabs = (page: Page) => page.getByRole('group', { name: 'Row type' });

test('names and plain words instead of ids; counts add up; nothing claims a tree, a chip or other laptops', async ({ page }) => {
  await open(page);
  await expect(page.getByText(/All \d+ rows verified/)).toBeVisible();
  const n = async (name: string) => Number((await tabs(page).getByRole('button', { name: new RegExp(`^${name}`) }).textContent())!.match(/\((\d+)\)/)![1]);
  const [all, ...parts] = [await n('All rows'), await n('Records'), await n('Second look'), await n('Sign-offs'), await n('System')];
  expect(parts.reduce((a, b) => a + b, 0)).toBe(all);
  await expect(rows(page).first()).toBeVisible();
  await page.getByRole('searchbox').fill('e-029');
  await expect(page.getByRole('list', { name: 'Rows' })).toContainText('Medicine e-029');
  await expect(page.getByRole('list', { name: 'Rows' })).toContainText('Second look (simulated): different');
  await expect(page.getByRole('list', { name: 'Rows' })).toContainText('Daniel Okafor');
  await expect(page.getByRole('list', { name: 'Rows' })).not.toContainText(/pr-[a-z]+|entry_confirmed|second_look_mismatch/);
  await expect(page.getByRole('main')).not.toContainText(/merkle|\bTPM\b|ECDSA|\bNTP\b|\bPKI\b|\bmesh\b|certificate|tamper alarm|medico-legal/i);
});

test('search, tabs, action filter and "show more" work on the whole log', async ({ page }) => {
  await open(page);
  await expect(rows(page)).toHaveCount(40);
  await expect(page.getByText(/Showing 40 of 1\d\d/)).toBeVisible();
  const more = page.getByRole('button', { name: /Show \d+ more/ });
  while (await more.count()) await more.click();
  await expect(page.getByRole('button', { name: /Show \d+ more/ })).toHaveCount(0);
  expect(await rows(page).count()).toBeGreaterThan(150);
  await page.getByLabel('Filter by action').selectOption({ label: 'Network cleared' });
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page)).toContainText('Kim Ellis');
  await page.getByLabel('Filter by action').selectOption('');
  await tabs(page).getByRole('button', { name: /^Sign-offs/ }).click();
  await expect(rows(page)).toHaveCount(11);
  await page.getByRole('searchbox').fill('no such thing');
  await expect(page.getByText('No rows here')).toBeVisible();
});

test('the inspector shows the real fingerprints and how the row is linked; a record opens through the patient check', async ({ page }) => {
  await open(page);
  const box = page.getByRole('region', { name: 'Row inspector' });
  await expect(box).toContainText('Pick a row');
  await page.getByRole('searchbox').fill('103');
  await rows(page).filter({ hasText: '#103' }).first().getByRole('button').click();
  for (const t of ['#103', 'Record confirmed', 'Vitals e-041', 'Sara Whitfield', 'DT-4W-01', 'a1024de39df57b7d07a3d62cd87360661884852162bc090a06bb4a37e83df7a1', '4d4871ade92ec82b1ac94e91ca3d5098d41c82f1e32621bad4036ce2420bab73', 'Row 102', 'Row 104 holds the same value']) await expect(box).toContainText(t);
  await box.getByRole('link', { name: 'Open the record' }).click();
  await expect(page.getByRole('dialog', { name: 'Is this the right patient?' })).toContainText('Mei Chen');
});

test('Check again reads the log again and says what it found', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Check again' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Checked again at 13:2\d: (\d+) of \1 rows follow from the row before\./ })).toBeVisible();
});

test('an edited row is shown as a broken chain, in red, and the inspector says which link fails', async ({ page }) => {
  await page.route(/\/assets\/downtimekit-seed-[^/]+\.js$/, async (route) => {
    const res = await route.fetch();
    const body = await res.text();
    const from = '"user_id":"pr-whitfield","device_id":"dev-01","action":"entry_confirmed","entity":"entry/e-041"';
    expect(body).toContain(from);
    await route.fulfill({ response: res, body: body.replace(from, from.replace('pr-whitfield', 'pr-okafor')), headers: { ...res.headers(), 'content-type': 'text/javascript' } });
  });
  await open(page);
  await expect(page.getByText('Broken at row 104')).toBeVisible();
  await page.getByRole('searchbox').fill('e-041');
  await rows(page).filter({ hasText: '#103' }).getByRole('button').click();
  await expect(page.getByRole('region', { name: 'Row inspector' })).toContainText('Row 104 holds a different value');
});

test('a nurse cannot open the change log', async ({ page }) => {
  await open(page, /Daniel Okafor/);
  await expect(page.getByText('Admins only.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Rows' })).toHaveCount(0);
});

test('paper holds the rows shown, with who printed it; no controls', async ({ page }) => {
  await open(page);
  await tabs(page).getByRole('button', { name: /^Sign-offs/ }).click();
  await expect(rows(page)).toHaveCount(11);
  const all = (await pdfPageTexts(await page.pdf({ format: 'A4' }))).map(squash).join('');
  for (const t of ['Change log, Sign-offs', 'printed by Kim Ellis', 'Recovery item signed off', 'Fake practice data, not a clinical record']) expect(all).toContain(squash(t));
  for (const t of ['Check again', 'Row inspector', 'All actions']) expect(all).not.toContain(squash(t));
});

test('the header shows this laptop from its own record, not a fixed text', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route(/\/assets\/downtimekit-seed-[^/]+\.js$/, async (route) => {
    const res = await route.fetch();
    const body = await res.text();
    const from = /label:"DT-4W-01[^"]*"|label:`DT-4W-01[^`]*`/;
    expect(body).toMatch(from);
    await route.fulfill({ response: res, body: body.replace(from, 'label:"LAYOUT TEST laptop (fictional)"'), headers: { ...res.headers(), 'content-type': 'text/javascript' } });
  });
  await open(page);
  await expect(page.getByRole('banner')).toContainText('LAYOUT TEST laptop');
  await expect(page.getByRole('banner')).not.toContainText('DT-4W-01');
});

for (const width of [1440, 1280, 1024, 768, 390, 360]) {
  test(`${width}px: the change log fits; nothing is cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page);
    await rows(page).first().getByRole('button').click();
    await expect(page.getByRole('region', { name: 'Row inspector' })).toContainText('This row');
    const r = await page.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const seen = Array.from(document.querySelectorAll('main button, main a, main dd, main li, main select, main p')).filter((e) => e.getBoundingClientRect().width > 1);
      const out = seen.filter((e) => { const b = e.getBoundingClientRect(); return b.right > W + 1 || b.left < -1; }).map((e) => e.textContent?.slice(0, 30));
      const cut = seen.filter((e) => e.tagName !== 'SELECT' && (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1 && getComputedStyle(e).display !== 'inline').map((e) => e.textContent?.slice(0, 30));
      return { scroll: document.documentElement.scrollWidth > W, out, cut };
    });
    expect(r, `at ${width}`).toEqual({ scroll: false, out: [], cut: [] });
  });
}

test('the header survives the lock screen and shows no laptop name until the records are open', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page);
  await expect(page.getByRole('banner')).toContainText('DT-4W-01');
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Unlock records on this laptop' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use practice passphrase' })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator('body')).not.toContainText('DT-4W-01');
  await page.getByRole('button', { name: 'Use practice passphrase' }).click();
  await expect(page.getByRole('heading', { name: /Who are you/ })).toBeVisible();
  expect(errors).toEqual([]);
});
