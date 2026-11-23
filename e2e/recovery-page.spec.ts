import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';
import { pdfPageTexts } from './pdfText';

/** Recovery worklist as list, record and decision (Stitch "Recovery worklist"). Fictional Practice data only. */
test.use({ serviceWorkers: 'block' });
const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();
const RIGHT = 'The record matches the paper', WRONG = 'The record is wrong';

async function signIn(page: Page, who = /Kim Ellis/) {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page).not.toHaveURL(/sign-in/);
}
const goTo = (page: Page, path: string) => page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);
async function openItem(page: Page, id: string) {
  await goTo(page, `/recovery/${id}`);
  await expect(page.getByRole('region', { name: 'Decision' })).toBeVisible();
}
const doneCount = async (page: Page) => Number((await page.getByText(/^\d+ of 45 signed off$/).textContent())!.split(' ')[0]);

test('tabs count the real items, the bar adds up, and the list keeps its tab when a record opens beside it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);
  await goTo(page, '/recovery');
  const tabs = page.getByRole('group', { name: 'Filter' });
  await expect(tabs.getByRole('button')).toHaveText(['Not signed off (34)', 'Possible duplicate (2)', 'Missing field (1)', 'Time conflict (2)', 'Recheck (2)', 'All (45)']);
  const status = page.getByRole('region', { name: 'Recovery status' });
  for (const t of ['11 done', '7 open with a flag', '27 open, no flag', '11 of 45 signed off', 'cleared 12:40 by Kim Ellis']) await expect(status).toContainText(t);
  await expect(page.getByText('Open a record from the list')).toBeVisible();
  await tabs.getByRole('button', { name: 'Recheck (2)' }).click();
  const list = page.getByRole('region', { name: 'Worklist' });
  await expect(list.getByRole('link')).toHaveCount(2);
  await page.getByTestId('wl-e-029').click();
  await expect(page).toHaveURL(/wl-029$/);
  await expect(tabs.getByRole('button', { name: 'Recheck (2)' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('wl-e-029')).toHaveAttribute('aria-current', 'page');
  const [a, b] = [(await list.boundingBox())!, (await page.getByRole('region', { name: 'Decision' }).boundingBox())!];
  expect(b.x).toBeGreaterThan(a.x + a.width - 1);
});

test('tenfold dose: paper words, record, order and second look side by side, with no advice on which is right', async ({ page }) => {
  await signIn(page);
  await openItem(page, 'wl-029');
  const head = page.getByRole('region', { name: 'Record to check' });
  for (const t of ['Sam Rivera', 'MRN DK-004512', 'Born 12 Mar 1959', 'Recorded 50 mg · order says 5 mg', 'the record says 50 mg, the second look read 5 mg', 'Nothing here says which value is right']) await expect(head).toContainText(t);
  await expect(head).not.toContainText('no longer find a problem');
  await expect(page.getByRole('region', { name: 'Paper source' })).toContainText('Paper sheet line: amlodipine 5.0 mg PO 0900 DO');
  await expect(page.getByRole('region', { name: 'Downtime record' })).toContainText('50 mg');
  const compare = page.getByRole('region', { name: 'Order and other sources' });
  await expect(compare).toContainText('amLODIPine 5 mg by mouth once daily');
  await expect(compare).toContainText('practice data, simulated');
  await expect(compare.getByRole('row').filter({ hasText: 'Dose given' })).toContainText('(different)');
  await expect(page.getByRole('main')).not.toContainText(/recommended|fatal|code blue|pyxis|dispens|confidence|ceiling|max dose|rapid response/i);
  await page.getByRole('button', { name: 'Inspect paper' }).click();
  await expect(page.getByText('Photo file is not on this laptop')).toBeVisible();
});

test('a vitals recheck names the value that differs', async ({ page }) => {
  await signIn(page);
  await openItem(page, 'wl-042');
  await expect(page.getByRole('region', { name: 'Record to check' })).toContainText('Bottom blood pressure: the record says 70 mmHg, the second look read 76 mmHg.');
});

test('sign-off needs a choice, stays on the record, and never moves to the next one by itself', async ({ page }) => {
  await signIn(page, /Daniel Okafor/);
  await openItem(page, 'wl-018');
  await expect(page.getByRole('heading', { name: 'Compare with' })).toBeVisible();
  const before = await doneCount(page);
  const sign = page.getByRole('button', { name: 'Checked — sign off' });
  await expect(sign).toBeDisabled();
  await page.getByRole('radio', { name: RIGHT }).check();
  await sign.dblclick(); // a double click signs off one record only
  await expect(page).toHaveURL(/wl-018$/);
  await expect(page.getByRole('region', { name: 'Decision' }).getByRole('status')).toContainText('Signed off by Daniel Okafor');
  await expect(page.getByText(`${before + 1} of 45 signed off`)).toBeVisible();
  await expect(sign).toHaveCount(0);
  await page.getByRole('link', { name: 'Next open record' }).click();
  await expect(page).not.toHaveURL(/wl-018$/);
  await expect(page.getByRole('radio', { name: RIGHT })).not.toBeChecked();
  await expect(sign).toBeDisabled();
});

test('a wrong record goes to the normal fix, and the fix is what the worklist shows next', async ({ page }) => {
  await signIn(page, /Daniel Okafor/);
  await openItem(page, 'wl-029');
  await page.getByRole('radio', { name: WRONG }).check();
  await expect(page.getByRole('button', { name: 'Checked — sign off' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Open to fix or mark as mistake' }).click();
  await page.getByRole('button', { name: 'Yes, open' }).click(); // the patient check still comes first
  await page.getByRole('link', { name: 'Fix', exact: true }).click();
  await page.getByLabel('Dose given').fill('5');
  await page.getByLabel('Why are you fixing this?').fill('decimal point missed on the paper');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save fix' }).click();
  await expect(page).toHaveURL(/\/entries\/(?!e-029)[^/]+$/);
  await expect(page.getByText('decimal point missed on the paper')).toBeVisible();
  await openItem(page, 'wl-029');
  await expect(page.getByText('This record was fixed. The newest version is shown.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Downtime record' })).toContainText('5 mg');
  await expect(page.getByRole('note', { name: 'Why this record is on the list' })).toHaveCount(0);
  await expect(page.getByText('All versions')).toBeVisible();
});

test('an admin can sign off but is told a nurse fixes; a nurse gets no admin backup link', async ({ page }) => {
  await signIn(page);
  await openItem(page, 'wl-029');
  await expect(page.getByRole('link', { name: 'Encrypted backup' })).toBeVisible();
  await page.getByRole('radio', { name: WRONG }).check();
  await expect(page.getByText('A nurse fixes records.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open to fix or mark as mistake' })).toHaveCount(0);
  await signIn(page, /Daniel Okafor/);
  await goTo(page, '/recovery');
  await expect(page.getByRole('region', { name: 'Recovery status' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Encrypted backup' })).toHaveCount(0);
});

test('the printed worklist names the patient and MRN on every line, and leaves the buttons off', async ({ page }) => {
  await signIn(page);
  await goTo(page, '/recovery');
  await page.getByRole('group', { name: 'Filter' }).getByRole('button', { name: 'All (45)' }).click();
  await expect(page.getByRole('region', { name: 'Worklist' }).getByRole('link')).toHaveCount(45);
  const pages = (await pdfPageTexts(await page.pdf({ format: 'A4' }))).map(squash);
  const all = pages.join('');
  expect(all.split('mrndk-').length - 1).toBe(45);
  for (const t of ['Recovery worklist, All (45)', 'printed by Kim Ellis', 'Fake practice data, not a clinical record', 'amLODIPine 50 mg', 'Signed off']) expect(all).toContain(squash(t));
  for (const t of ['Encrypted backup', 'Add new downtime records', 'Open a record from the list', 'Next open record']) expect(all).not.toContain(squash(t));
  for (const p of pages) expect(p).not.toBe('');
});

test('closed while the system is down', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'Downtime', exact: true }).or(page.getByRole('link', { name: 'Downtime Management' })).first().click();
  await page.getByRole('button', { name: 'Start a practice outage' }).click();
  await expect(page.getByText('SYSTEM DOWN').first()).toBeVisible();
  await goTo(page, '/recovery/wl-029');
  await expect(page.getByText('Recovery starts after an admin clears the network')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Checked — sign off' })).toHaveCount(0);
  await expect(page.getByRole('main')).not.toContainText('Sam Rivera');
});

test('phone: each line shows time, what happened and why; one record at a time with a way back', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await goTo(page, '/recovery');
  await expect(page.getByTestId('wl-e-029')).toContainText('09:00 amLODIPine 50 mg · Given');
  await expect(page.getByTestId('wl-e-029')).toContainText('Recorded 50 mg · order says 5 mg');
  await page.getByTestId('wl-e-029').click();
  await expect(page.getByRole('region', { name: 'Worklist' })).toBeHidden();
  await page.getByRole('link', { name: 'Back to the list' }).click();
  await expect(page.getByRole('region', { name: 'Worklist' })).toBeVisible();
});

for (const width of [1440, 1024, 768, 390, 360]) {
  test(`${width}px: worklist and record fit; nothing is cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await signIn(page);
    for (const path of ['/recovery', '/recovery/wl-029', '/recovery/wl-042', '/recovery/wl-018']) {
      await goTo(page, path);
      if (path !== '/recovery') await expect(page.getByRole('region', { name: 'Decision' })).toBeVisible(); else await expect(page.getByTestId('wl-e-029')).toBeVisible();
      await page.waitForTimeout(200);
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const seen = Array.from(document.querySelectorAll('main button, main a, main dd, main li, main td, main label')).filter((e) => e.getBoundingClientRect().width > 1);
        const out = seen.filter((e) => { const b = e.getBoundingClientRect(); return b.right > W + 1 || b.left < -1; }).map((e) => e.textContent?.slice(0, 30));
        const cut = seen.filter((e) => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1 && !['inline', 'contents'].includes(getComputedStyle(e).display)).map((e) => e.textContent?.slice(0, 30));
        return { scroll: document.documentElement.scrollWidth > W, out, cut };
      });
      expect(r, `${path} at ${width}`).toEqual({ scroll: false, out: [], cut: [] });
    }
  });
}
