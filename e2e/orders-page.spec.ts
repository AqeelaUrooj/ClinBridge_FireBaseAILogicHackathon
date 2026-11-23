import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';
import { pdfPageTexts } from './pdfText';

/** Orders and allergies (Stitch "Patient orders & allergies"). Fictional Practice data only. */
test.use({ serviceWorkers: 'block' });
const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();

async function open(page: Page, patient: string, who = /Daniel Okafor/) {
  await page.goto(`/patients/${patient}/orders`);
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(page.getByRole('heading', { name: 'Orders and allergies' })).toBeVisible();
}
const goTo = (page: Page, path: string) => page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);
const order = (page: Page, id: string) => page.getByTestId(`order-${id}`);
const tabs = (page: Page) => page.getByRole('group', { name: 'Order type' });

test('orders as cards with the list facts; tabs and search; nothing that is not on the list', async ({ page }) => {
  await open(page, 'pt-05');
  await expect(page.getByRole('note', { name: 'Read only' })).toContainText('Read only, from the patient list of 03:00, 14 Nov 2026.');
  await expect(tabs(page).getByRole('button')).toHaveText(['All orders (3)', 'Medicines and IV (1)', 'Nursing (1)', 'Lab and scans (1)', 'Diet (0)', 'Stopped (0)']);
  for (const t of ['ord-12', 'Active, continuous', 'High-alert', 'heparin infusion, 25,000 units in 250 mL', 'IV (into a vein)', 'Ordered by Dr. P. Lindqvist', 'Last record 05:50: Rate changed']) await expect(order(page, 'ord-12')).toContainText(t);
  await expect(order(page, 'ord-13')).toContainText('06:00, 12:00, 18:00, 00:00');
  await tabs(page).getByRole('button', { name: 'Nursing (1)' }).click();
  await expect(page.getByRole('list', { name: 'Orders' }).getByRole('listitem')).toHaveCount(1);
  await tabs(page).getByRole('button', { name: 'Diet (0)' }).click();
  await expect(page.getByText('No orders here')).toBeVisible();
  await tabs(page).getByRole('button', { name: 'All orders (3)' }).click();
  await page.getByRole('searchbox').fill('clotting');
  await expect(page.getByRole('list', { name: 'Orders' }).getByRole('listitem')).toHaveCount(1);
  await expect(page.getByRole('main')).not.toContainText(/NEWS2|pager|lockout|maximum|max\b|indication|earliest next|overdue|broadcast|mesh|epic/i);
});

test('allergies and precautions are exactly the list: known, none known', async ({ page }) => {
  await open(page, 'pt-05');
  const box = page.getByRole('region', { name: 'Allergies and precautions' });
  for (const t of ['Codeine: Nausea and vomiting (moderate)', 'Shellfish: Throat swelling (severe)', 'Contact', 'DNR', 'Soft, thickened liquids']) await expect(box).toContainText(t);
  await goTo(page, '/patients/pt-09/orders');
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(box).toContainText('No known allergies');
  await expect(box).toContainText('As written on the patient list.');
  await expect(box).not.toContainText(/codeine|shellfish|confirmed/i);
});

test('a patient with no allergy line is never shown as "no known allergies"', async ({ page }) => {
  await page.route(/\/assets\/downtimekit-seed-[^/]+\.js$/, async (route) => {
    const res = await route.fetch();
    const body = await res.text();
    expect(body).toContain('"alg-10"');
    await route.fulfill({ response: res, body: body.replace(/(id:"alg-10",patient_id:")pt-09"/, '$1pt-none"'), headers: { ...res.headers(), 'content-type': 'text/javascript' } });
  });
  await open(page, 'pt-09');
  const box = page.getByRole('region', { name: 'Allergies and precautions' });
  await expect(box).toContainText('Allergies not recorded on the list');
  await expect(box).not.toContainText('No known allergies');
});

test('a dose that differs from its order is said on the order', async ({ page }) => {
  await open(page, 'pt-01');
  await expect(order(page, 'ord-01')).toContainText('Recorded 50 mg · order says 5 mg');
  await expect(order(page, 'ord-01')).toContainText('Last given 09:00: 50 mg');
  await expect(order(page, 'ord-02')).not.toContainText('order says');
  await expect(order(page, 'ord-02')).toContainText('Today 09:00 given, 21:00 not recorded');
});

test('each action opens the right page of this patient; a high-alert drug still needs its own form', async ({ page }) => {
  await open(page, 'pt-05');
  for (const [id, name, url] of [['ord-12', 'Open', /pt-05\/meds\/ord-12$/], ['ord-12', 'Prepare dose', /pt-05\/meds\/ord-12\/record$/], ['ord-13', 'Record lab', /pt-05\/labs\/record\?order=ord-13$/], ['ord-14', 'Write a note', /pt-05\/notes\/new$/]] as const) {
    await order(page, id).getByRole('link', { name, exact: true }).click();
    await expect(page).toHaveURL(url);
    await goTo(page, '/patients/pt-05/orders');
    await expect(order(page, id)).toBeVisible();
  }
  for (const [name, url] of [['Paper medication record', /\/print\/mar\/pt-05$/], ['Paper verbal order form', /\/print\/sbar\/pt-05$/], ['Write what happened', /pt-05\/notes\/new$/]] as const) {
    await page.getByRole('link', { name }).click();
    await expect(page).toHaveURL(url);
    await goTo(page, '/patients/pt-05/orders');
    await expect(order(page, 'ord-12')).toBeVisible();
  }
});

test('an admin reads orders but gets no dose, lab or note buttons', async ({ page }) => {
  await open(page, 'pt-05', /Kim Ellis/);
  await expect(order(page, 'ord-12').getByRole('link', { name: 'Open', exact: true })).toBeVisible();
  for (const n of ['Prepare dose', 'Record lab', 'Write a note', 'Write what happened']) await expect(page.getByRole('link', { name: n })).toHaveCount(0);
});

test('paper holds the allergies and every order shown, without buttons', async ({ page }) => {
  await open(page, 'pt-05');
  await expect(order(page, 'ord-14')).toBeVisible();
  const paper = (await pdfPageTexts(await page.pdf({ format: 'A4' }))).map(squash).join('');
  for (const t of ['MRN DK-004541', 'Codeine', 'Shellfish', 'heparin infusion', 'Turn patient every 2 hours', 'Read only, from the patient list']) expect(paper).toContain(squash(t));
  for (const t of ['Prepare dose', 'Print orders', 'Counts for the whole ward', 'Write what happened']) expect(paper).not.toContain(squash(t));
});

for (const width of [1440, 1280, 1024, 768, 390, 360]) {
  test(`${width}px: orders fit; nothing is cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const patient of ['pt-05', 'pt-01']) {
      await open(page, patient);
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const seen = Array.from(document.querySelectorAll('main button, main a, main dd, main li, main p, main label')).filter((e) => e.getBoundingClientRect().width > 1 && !e.closest('[aria-label="Patient pages"]'));
        const out = seen.filter((e) => { const b = e.getBoundingClientRect(); return b.right > W + 1 || b.left < -1; }).map((e) => e.textContent?.slice(0, 30));
        const cut = seen.filter((e) => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1 && getComputedStyle(e).display !== 'inline').map((e) => e.textContent?.slice(0, 30));
        return { scroll: document.documentElement.scrollWidth > W, out, cut };
      });
      expect(r, `${patient} at ${width}`).toEqual({ scroll: false, out: [], cut: [] });
    }
  });
}
