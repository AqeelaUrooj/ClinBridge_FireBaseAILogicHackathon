import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';
import { pdfPageTexts } from './pdfText';

/** Entry detail, all versions and fix (Stitch "Entry detail, versioned correction"). Fictional Practice data only. */
test.use({ serviceWorkers: 'block' });
const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();

async function open(page: Page, path: string, who = /Daniel Okafor/) {
  await page.goto(path);
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
}
const goTo = (page: Page, path: string) => page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);
const region = (page: Page, name: string) => page.getByRole('region', { name, exact: true });

test('a fixed record: old, what changed and new side by side, only the changed values marked', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, '/entries/e-041');
  const before = region(page, 'Before the fix'), mid = region(page, 'What changed'), after = region(page, 'After the fix');
  await expect(before).toContainText('#e-040');
  await expect(before).toContainText('Old version');
  await expect(after).toContainText('#e-041');
  await expect(after).toContainText('Confirmed');
  await expect(mid.getByRole('listitem')).toHaveText([/Pulse.*18 \/min.*78 \/min/, /Breathing.*78 \/min.*18 \/min/]);
  await expect(before.locator('dd.line-through')).toHaveText(['18 /min', '78 /min']);
  await expect(mid).toContainText('No reason stored'); // the practice record has none: nothing is made up
  await expect(mid).toContainText('ClinBridge has no second signature on a fix');
  const y = await Promise.all([before, mid, after].map(async (l) => (await l.boundingBox())!));
  expect(Math.abs(y[0]!.y - y[2]!.y)).toBeLessThan(2);
  await expect(page.getByRole('main')).not.toContainText(/unrealistic|outlier|bradycardia|eupneic|normal sinus|NEWS2|countersigned|RSA|mesh|EHR ingestion|approve amendment|keypad/i);
});

test('the old version opens the same comparison and leads to the new one', async ({ page }) => {
  await open(page, '/entries/e-040');
  await expect(page.getByText('This is an old version.')).toBeVisible();
  await expect(region(page, 'After the fix')).toContainText('#e-041');
  await expect(page.getByRole('link', { name: 'Fix', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'See the new one' }).click();
  await expect(page).toHaveURL(/e-041$/);
});

test('change log of the record: the stored rows with names, and the state of the whole log', async ({ page }) => {
  await open(page, '/entries/e-041');
  const log = region(page, 'Change log of this record');
  await expect(log.getByRole('listitem')).toHaveText([/Row 99.*Record saved.*#e-040.*Sara Whitfield/, /Row 100.*Record saved.*#e-041/, /Row 102.*Record confirmed.*#e-040/, /Row 103.*Record confirmed.*#e-041/]);
  await expect(log).toContainText(/Log intact, \d+ rows/);
  await expect(log).not.toContainText(/pr-whitfield|entry_saved_raw/);
});

test('a new fix: reason, who and when are stored and shown; all versions list each change once', async ({ page }) => {
  await open(page, '/entries/e-041/correct');
  await expect(region(page, 'Record now')).toContainText('78');
  await page.getByLabel('Temperature').fill('37.4');
  await page.getByLabel('Why are you fixing this?').fill('typed temperature wrong');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save fix' }).click();
  const mid = region(page, 'What changed');
  await expect(mid.getByRole('listitem')).toHaveText([/Temperature.*37\.1 °C.*37\.4 °C/]);
  await expect(mid).toContainText('typed temperature wrong');
  await expect(mid).toContainText('Daniel Okafor');
  await page.getByRole('link', { name: 'All versions' }).click();
  const versions = page.getByRole('list', { name: 'Versions' }).getByRole('listitem');
  await expect(versions).toHaveCount(3);
  await expect(versions.nth(1)).toContainText(/Pulse:.*18 \/min.*78 \/min/);
  await expect(versions.nth(2)).toContainText(/Temperature:.*37\.1 °C.*37\.4 °C/);
  await expect(versions.nth(2)).toContainText('Why: typed temperature wrong');
  await expect(region(page, 'Change log of this record')).toContainText('Record fixed');
});

test('a mistake keeps its own reason and is never called a fix', async ({ page }) => {
  await open(page, '/entries/e-041');
  await page.getByRole('button', { name: 'Wrong patient or mistake' }).click();
  await page.getByLabel('Reason').fill('recorded on the wrong patient');
  await page.getByRole('button', { name: 'Mark as mistake' }).click();
  const mid = region(page, 'What changed');
  await expect(mid).toContainText('Mistake reason');
  await expect(mid).toContainText('recorded on the wrong patient');
  await expect(mid).not.toContainText('Fix reason');
  await expect(region(page, 'After the fix')).toContainText('Mistake');
});

test('a record with one version has no comparison; medicines, notes and labs show their own values', async ({ page }) => {
  await open(page, '/entries/e-029');
  await expect(page.getByRole('heading', { name: 'Medicine #e-029' })).toBeVisible();
  await expect(region(page, 'What changed')).toHaveCount(0);
  await expect(page.getByRole('main')).toContainText('50 mg');
  await page.getByText('Source photo').click();
  await expect(page.getByText('Photo file is not on this laptop')).toBeVisible();
  await goTo(page, '/entries/e-026');
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(page.getByRole('main')).toContainText('Dr. A. Whitaker, told by phone at 08:55');
});

test('an admin can read and print, but not fix or mark a mistake', async ({ page }) => {
  await open(page, '/entries/e-041', /Kim Ellis/);
  await expect(region(page, 'What changed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Print record' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Fix', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Wrong patient or mistake' })).toHaveCount(0);
});

test('paper holds both versions, the change, the log and the patient; no buttons', async ({ page }) => {
  await open(page, '/entries/e-041');
  await expect(region(page, 'Change log of this record').getByRole('listitem')).toHaveCount(4);
  const pages = (await pdfPageTexts(await page.pdf({ format: 'A4' }))).map(squash);
  for (const p of pages) expect(p).toContain(squash('MRN DK-004546'));
  const all = pages.join('');
  for (const t of ['#e-040', '#e-041', 'What changed', 'Row 103', 'Old version']) expect(all).toContain(squash(t));
  for (const t of ['Wrong patient or mistake', 'Print record', 'Back']) expect(all).not.toContain(squash(t));
});

for (const width of [1440, 1280, 1024, 768, 390, 360]) {
  test(`${width}px: detail, versions and fix fit; nothing is cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page, '/entries/e-041');
    for (const path of ['/entries/e-041', '/entries/e-041/history', '/entries/e-041/correct']) {
      await goTo(page, path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const seen = Array.from(document.querySelectorAll('main button, main a, main dd, main li, main input')).filter((e) => e.getBoundingClientRect().width > 1);
        const out = seen.filter((e) => { const b = e.getBoundingClientRect(); return b.right > W + 1 || b.left < -1; }).map((e) => e.textContent?.slice(0, 30));
        const cut = seen.filter((e) => (e as HTMLInputElement).type !== 'datetime-local' && (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1 && getComputedStyle(e).display !== 'inline').map((e) => e.textContent?.slice(0, 30));
        return { scroll: document.documentElement.scrollWidth > W, out, cut };
      });
      expect(r, `${path} at ${width}`).toEqual({ scroll: false, out: [], cut: [] });
    }
  });
}
