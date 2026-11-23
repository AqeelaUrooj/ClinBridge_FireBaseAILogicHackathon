import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';
import { pdfPageTexts } from './pdfText';

/** Ward and patient labs (Stitch "Ward laboratory ledger"). Fictional Practice data only. */
test.use({ serviceWorkers: 'block' });
const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();

async function signIn(page: Page, path: string, who = /Daniel Okafor/) {
  await page.goto(path);
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page).not.toHaveURL(/sign-in/);
}
const goTo = (page: Page, path: string) => page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);
const row = (page: Page, id: string) => page.getByTestId(`lab-${id}`);
const filter = (page: Page) => page.getByRole('group', { name: 'Lab filter' });

test('ward: counts, critical card with the stored facts, and no invented range, protocol or courier', async ({ page }) => {
  await signIn(page, '/labs');
  await expect(filter(page).getByRole('button')).toHaveText(['All lab records (7)', 'Critical (1)', 'Sample taken (3)', 'Waiting for sample (1)', 'Result back (0)', 'Bedside blood sugar (2)', 'Hospital list (9)']);
  const card = page.getByRole('region', { name: 'Critical result: Potassium' });
  for (const t of ['Arjun Mehta', 'Bed 5A', 'MRN DK-004527', 'Potassium 6.2 mmol/L', 'Daniel Okafor, 08:20', 'Recorded', 'Dr. A. Whitaker, told by phone at 08:55', '06:05, 14 Nov 2026']) await expect(card).toContainText(t);
  await expect(page.getByRole('list', { name: 'Lab records' }).getByRole('listitem').first()).toContainText('6.2 mmol/L'); // critical first
  await expect(row(page, 'e-047')).toContainText('Waiting for sample');
  await expect(row(page, 'e-047')).toContainText('No result yet');
  await expect(page.getByRole('main')).not.toContainText(/escalation|protocol|ECG|gluconate|target|courier|storage monitor|LOINC|tube|barcode|critical high/i);
  for (const [tab, n] of [['Critical (1)', 1], ['Sample taken (3)', 3], ['Waiting for sample (1)', 1], ['Bedside blood sugar (2)', 2]] as const) {
    await filter(page).getByRole('button', { name: tab, exact: true }).click();
    await expect(page.getByRole('list', { name: 'Lab records' }).getByRole('listitem')).toHaveCount(n);
  }
  await filter(page).getByRole('button', { name: 'Result back (0)' }).click();
  await expect(page.getByText('No lab records here')).toBeVisible();
});

test('ward: search by name, MRN, bed and test; the hospital list keeps its own printed range', async ({ page }) => {
  await signIn(page, '/labs');
  const list = page.getByRole('list', { name: 'Lab records' }).getByRole('listitem');
  for (const [q, n] of [['Tom', 2], ['dk-004527', 2], ['bed 4c', 2], ['blood count', 1]] as const) {
    await page.getByRole('searchbox').fill(q);
    await expect(list).toHaveCount(n);
  }
  await page.getByRole('searchbox').fill('');
  await filter(page).getByRole('button', { name: 'Hospital list (9)' }).click();
  const hosp = page.getByRole('list', { name: 'Hospital list lab results' }).getByRole('listitem');
  await expect(hosp).toHaveCount(9);
  await expect(hosp.filter({ hasText: 'Arjun Mehta' }).filter({ hasText: 'Potassium' })).toContainText('Range on the list 3.5 – 5.1');
});

test('ward: every way into a patient goes through the patient check', async ({ page }) => {
  await signIn(page, '/labs');
  await row(page, 'e-026').getByRole('link', { name: 'Open', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Is this the right patient?' })).toContainText('Arjun Mehta');
  await goTo(page, '/labs');
  await page.getByLabel('Record a lab for').selectOption({ label: '6A Tom Hale' });
  await expect(page).toHaveURL(/pt-05\/labs\/record$/);
  await expect(page.getByRole('dialog', { name: 'Is this the right patient?' })).toContainText('Tom Hale');
});

test('record a result for a waiting sample: only the test and sample time are filled; the old record stays', async ({ page }) => {
  await signIn(page, '/patients/pt-05/labs');
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await row(page, 'e-014').getByRole('link', { name: 'Record result' }).click();
  await expect(page.getByLabel('Test')).toHaveValue('aPTT (clotting time)');
  await expect(page.getByLabel('Sample taken at (optional)')).toHaveValue('2026-11-14T06:10');
  await expect(page.locator('[aria-pressed="true"]')).toHaveCount(0); // no status is chosen for the nurse
  await page.getByRole('button', { name: 'Result back' }).click();
  await expect(page.getByLabel('Result (as given by the lab)')).toHaveValue(''); // and no result
  await page.getByLabel('Result (as given by the lab)').fill('64');
  await page.getByLabel('Unit').fill('s');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved on this laptop.')).toBeVisible();
  await expect(filter(page)).toContainText('Result back (1)');
  await expect(row(page, 'e-014')).toContainText('Sample taken');
  await expect(page.getByRole('list', { name: 'Lab records' })).toContainText('64 s');
});

test('another patient\'s record never fills the form', async ({ page }) => {
  await signIn(page, '/patients/pt-01/labs/record?from=e-014'); // e-014 is Tom Hale's
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(page.getByLabel('Test')).toHaveValue('');
  await expect(page.getByLabel('Sample taken at (optional)')).toHaveValue('');
});

test('patient labs: own critical card, order, hospital list; nothing of other patients', async ({ page }) => {
  await signIn(page, '/patients/pt-03/labs');
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(page.getByRole('region', { name: 'Critical result: Potassium' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Hospital list' })).toContainText('Creatinine');
  await page.getByRole('link', { name: 'Record for this order' }).click();
  await expect(page.getByLabel('Test')).toHaveValue(/Basic metabolic panel/);
  await expect(page.getByRole('main')).not.toContainText(/aPTT|Tom Hale|Lena Ortiz/);
});

test('an admin can read labs but not record one', async ({ page }) => {
  await signIn(page, '/labs', /Kim Ellis/);
  await goTo(page, '/labs');
  await expect(page.getByRole('heading', { name: 'Ward labs' })).toBeVisible();
  await expect(page.getByLabel('Record a lab for')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Record result' })).toHaveCount(0);
});

test('the printed ward list names the patient and MRN on every line', async ({ page }) => {
  await signIn(page, '/labs');
  await expect(row(page, 'e-026')).toBeVisible();
  const pages = (await pdfPageTexts(await page.pdf({ format: 'A4' }))).map(squash);
  const all = pages.join('');
  expect(all.split('mrndk-').length - 1).toBe(8); // seven lines and the critical card
  for (const t of ['Ward labs, All lab records', 'printed by Daniel Okafor', 'Fake practice data, not a clinical record', '6.2 mmol/L']) expect(all).toContain(squash(t));
  for (const t of ['Record result', 'pick a patient', 'Print list']) expect(all).not.toContain(squash(t));
  for (const p of pages) expect(p).not.toBe('');
});

for (const width of [1440, 1280, 1024, 768, 390, 360]) {
  test(`${width}px: lab pages fit; nothing is cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await signIn(page, '/labs');
    for (const path of ['/labs', '/patients/pt-03/labs', '/patients/pt-03/labs/record']) {
      await goTo(page, path);
      const yes = page.getByRole('button', { name: 'Yes, open' });
      if (path.includes('pt-03') && await yes.waitFor({ timeout: 1500 }).then(() => true, () => false)) await yes.click();
      await expect(page.getByRole('heading', { level: 1, name: /labs|Record lab/i })).toBeVisible();
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const seen = Array.from(document.querySelectorAll('main button, main a, main dd, main li, main select, main label')).filter((e) => e.getBoundingClientRect().width > 1 && !e.closest('[aria-label="Patient pages"]'));
        const out = seen.filter((e) => { const b = e.getBoundingClientRect(); return b.right > W + 1 || b.left < -1; }).map((e) => e.textContent?.slice(0, 30));
        const cut = seen.filter((e) => e.tagName !== 'SELECT' && (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1 && getComputedStyle(e).display !== 'inline').map((e) => e.textContent?.slice(0, 30));
        return { scroll: document.documentElement.scrollWidth > W, out, cut };
      });
      expect(r, `${path} at ${width}`).toEqual({ scroll: false, out: [], cut: [] });
    }
  });
}
