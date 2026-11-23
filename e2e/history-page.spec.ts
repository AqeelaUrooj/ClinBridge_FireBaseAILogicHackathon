import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';
import { pdfPageTexts } from './pdfText';

/** Patient history as record cards (Stitch "Patient History & Clinical Timeline"). Fictional Practice data only. */
test.use({ serviceWorkers: 'block' });
const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();

async function open(page: Page, patient: string, who = /Daniel Okafor/) {
  await page.goto(`/patients/${patient}/timeline`);
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Records' })).toBeVisible();
}
const card = (page: Page, id: string) => page.getByTestId(`history-${id}`);
const expand = (page: Page, id: string) => card(page, id).getByRole('button').first().click();

test('a vitals card opens into value tiles, with the existing draft "Unusual" mark and no invented score or diagnosis', async ({ page }) => {
  await open(page, 'pt-09');
  await expect(card(page, 'e-005')).toContainText('04:20');
  await expect(card(page, 'e-005')).toContainText('#e-005');
  await expect(card(page, 'e-005')).toContainText('from paper photo');
  await expand(page, 'e-005');
  const c = card(page, 'e-005');
  for (const t of ['114/68 mmHg', '106 /min', '24 /min', '38.4 °C', '90 %', '4 /10', '2 L/min', 'Nasal tube', 'Alert']) await expect(c).toContainText(t);
  await expect(c.getByText(/Unusual$/)).toHaveCount(4); // pulse, breathing, temperature, oxygen level
  await expect(c).toContainText('draft ranges that are not clinically approved');
  await expect(page.getByRole('main')).not.toContainText(/NEWS2|tachy|fever|critical low|acute desaturation|bedside verified|sinus rhythm/i);
});

test('paper source and sign-off log say only what is stored', async ({ page }) => {
  await open(page, 'pt-09');
  await expand(page, 'e-005');
  const paper = card(page, 'e-005').getByRole('region', { name: 'Paper source' });
  await expect(paper).toContainText('vault/raw/e-005.jpg');
  await expect(paper).toContainText('no problem found');
  await paper.getByRole('button', { name: 'Inspect paper' }).click();
  await expect(paper).toContainText('Photo file is not on this laptop'); // Practice data has no picture: nothing is drawn in its place
  await expect(paper.locator('img')).toHaveCount(0);
  await paper.getByRole('button', { name: 'Hide paper' }).click();
  await expect(paper).not.toContainText('Photo file is not on this laptop');
  await expect(card(page, 'e-005')).toContainText('Jordan Park, 04:27');
  await expect(card(page, 'e-005')).toContainText('Not signed off yet');
  await expand(page, 'e-036');
  await expect(card(page, 'e-036')).toContainText('Daniel Okafor, 10:07');
  await expect(card(page, 'e-036')).toContainText('Signed off by Sara Whitfield, 13:12');
});

test('a photo check the nurse overrode is shown as it was stored', async ({ page }) => {
  await open(page, 'pt-04');
  await expand(page, 'e-044');
  await expect(card(page, 'e-044').getByRole('region', { name: 'Paper source' })).toContainText('blurry, the nurse chose to carry on');
});

test('a critical lab result is a red card; a draft and a mistake keep their own marks', async ({ page }) => {
  await open(page, 'pt-03');
  await expect(card(page, 'e-026').getByText('Critical result')).toBeVisible();
  await expect(page.getByText('Critical result')).toHaveCount(1);
  await open(page, 'pt-10');
  await expect(card(page, 'e-042')).toHaveCount(0);
  await page.getByRole('checkbox').check();
  await expect(card(page, 'e-042')).toContainText('Mistake');
  await expect(page.getByText('Critical result')).toHaveCount(0);
});

test('each card leads to the right pages of this patient', async ({ page }) => {
  await open(page, 'pt-09');
  for (const [id, label, url] of [['e-036', 'Open MAR', /pt-09\/meds$/], ['e-005', 'Open vitals', /pt-09\/vitals$/], ['e-006', 'Open notes', /pt-09\/notes$/], ['e-005', 'Open details', /entries\/e-005$/], ['e-005', 'Fix', /entries\/e-005\/correct$/], ['e-036', 'Add a note', /pt-09\/notes\/new$/]] as const) {
    await expand(page, id);
    await card(page, id).getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(url);
    await page.evaluate(() => { history.pushState({}, '', '/patients/pt-09/timeline'); dispatchEvent(new PopStateEvent('popstate')); });
    await expect(page.getByRole('list', { name: 'Records' })).toBeVisible();
  }
  const actions = page.getByRole('region', { name: 'History actions' });
  await actions.getByRole('link', { name: /Photo of paper/ }).click();
  await expect(page).toHaveURL(/pt-09\/capture$/);
});

test('an admin can read the history but gets no Fix, note or paper buttons', async ({ page }) => {
  await open(page, 'pt-09', /Kim Ellis/);
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.getByRole('link', { name: 'Open details' })).toHaveCount(4);
  for (const n of ['Fix', 'Add a note', /Add a note \(any past time\)/, /Photo of paper/]) await expect(page.getByRole('main').getByRole('link', { name: n, exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Print history/ })).toBeVisible();
});

test('hospital list is a closed card, opens, hides with a filter, and is always printed in full', async ({ page }) => {
  await open(page, 'pt-09');
  const base = page.getByRole('region', { name: 'Hospital patient list before the outage' });
  await expect(base).toContainText('Read only');
  await expect(base.getByText('White blood cells', { exact: true })).toBeHidden();
  const printed = (await pdfPageTexts(await page.pdf({ format: 'A4' }))).map(squash).join('');
  for (const t of ['White blood cells', '14.2 10*3/uL', 'Not entered on this laptop']) expect(printed).toContain(squash(t));
  await base.getByRole('button').click();
  await expect(base.getByText('White blood cells', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(base.getByText('White blood cells', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(base.getByText('White blood cells', { exact: true })).toBeVisible();
  await page.getByRole('group', { name: 'Record type' }).getByRole('button', { name: /^Vitals/ }).click();
  await expect(base).toHaveCount(0);
});

test('care team shows stored people only; the trend table is not cut on paper', async ({ page }) => {
  await open(page, 'pt-09');
  const team = page.getByRole('region', { name: 'Care team' });
  await expect(team).toContainText('2 people');
  await expect(team.getByRole('listitem')).toHaveText([/JP.*Jordan Park.*RN.*3 records/, /DO.*Daniel Okafor.*RN.*1 record/]);
  await expect(team).not.toContainText(/Castellano|badge|pager/i);
  await page.emulateMedia({ media: 'print' });
  const table = page.getByTestId('spo2-trend').locator('table').locator('..');
  expect(await table.evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
});

for (const width of [1440, 1024, 768, 390, 360]) {
  test(`${width}px: history fits, open and closed; nothing is cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const patient of ['pt-09', 'pt-03']) {
      await open(page, patient);
      for (const name of ['Collapse all', 'Expand all']) {
        await page.getByRole('button', { name }).click();
        const r = await page.evaluate(() => {
          const W = document.documentElement.clientWidth;
          const out = Array.from(document.querySelectorAll('main button, main a, main dd, main li, main input')).filter((e) => { const b = e.getBoundingClientRect(); return b.width > 1 && (b.right > W + 1 || b.left < -1) && !e.closest('[aria-label="Patient pages"]'); }).map((e) => e.textContent?.slice(0, 30));
          const cut = Array.from(document.querySelectorAll('main dd, main button')).filter((e) => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1 && getComputedStyle(e).display !== 'inline').map((e) => e.textContent?.slice(0, 30));
          return { scroll: document.documentElement.scrollWidth > W, out, cut };
        });
        expect(r, `${patient} ${name} at ${width}`).toEqual({ scroll: false, out: [], cut: [] });
      }
    }
  });
}
