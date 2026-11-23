import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

/**
 * Ward board and patient summary, rebuilt after the Stitch designs. Every control on these two pages is used here:
 * a button that does nothing is a failure. Fictional Practice data only.
 */
async function signIn(page: Page, who: RegExp, path = '/sign-in') {
  await page.goto(path);
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
}

const card = (page: Page, id: string) => page.getByTestId(`ward-card-${id}`);
const menuPatients = (page: Page) => page.getByRole('complementary', { name: 'Main menu' }).getByRole('link', { name: /My Patients/ });
const beds = (page: Page) => page.getByRole('article').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')!.match(/^Bed (\S+),/)![1]));

test('ward board: tiles, filters, search, sort, expand, refresh', async ({ page }, info) => {
  await signIn(page, /Daniel Okafor/);
  await expect(page.getByRole('heading', { level: 1, name: /My patients/ })).toBeVisible();
  await expect(page.getByTestId('stat-census')).toContainText('10');
  await expect(page.getByTestId('stat-critical')).toContainText('Potassium 6.2 mmol/L (Bed 5A)');
  await expect(page.getByRole('article')).toHaveCount(10);

  // The critical lab starts open; the warning says what is and is not recorded.
  await expect(card(page, 'pt-03').getByRole('note')).toContainText('told by phone at 08:55');
  await expect(card(page, 'pt-03').getByRole('note')).toContainText('Read-back recorded');
  // A recorded dose that is not the ordered dose is said on the closed card.
  await expect(card(page, 'pt-01')).toContainText('amLODIPine: Recorded 50 mg · order says 5 mg');
  // Latest values keep their own times (a glucose-only record at 11:30 does not blank the 04:05 vitals).
  await expect(card(page, 'pt-02')).toContainText('128/80');
  await expect(card(page, 'pt-02')).toContainText('11:30');
  // No scores or timing judgements anywhere on the board.
  await expect(page.getByRole('main')).not.toContainText(/\bNEWS|acuity|overdue|\blate\b/i);

  const filter = page.getByRole('group', { name: 'Filter' });
  for (const f of ['Due meds', 'Critical lab', 'Drafts']) {
    const b = filter.getByRole('button', { name: new RegExp(f) });
    const n = Number((await b.innerText()).match(/\((\d+)\)/)![1]);
    await b.click();
    await expect(b).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('article')).toHaveCount(n);
  }
  await filter.getByRole('button', { name: /^All/ }).click();

  const search = page.getByLabel('Search by name, MRN or bed');
  await search.fill('DK-004563');
  expect(await beds(page)).toEqual(['8A']);
  await search.fill('nobody here');
  await expect(page.getByText('No patients match.')).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters' }).click();
  await expect(page.getByRole('article')).toHaveCount(10);

  await page.getByLabel('Sort patients').selectOption('name');
  expect((await beds(page))[0]).toBe('5C'); // Bell
  await page.getByLabel('Sort patients').selectOption('oldest-obs');
  expect(await beds(page)).toHaveLength(10);
  await page.getByLabel('Sort patients').selectOption('bed');
  expect((await beds(page))[0]).toBe('4B');

  const detail = card(page, 'pt-02').getByRole('button', { name: 'Show details for Lena Ortiz' });
  await expect(detail).toHaveAttribute('aria-expanded', 'false');
  await detail.click();
  await expect(card(page, 'pt-02').getByRole('button', { name: 'Show less for Lena Ortiz' })).toHaveAttribute('aria-expanded', 'true');
  await expect(card(page, 'pt-02')).toContainText('insulin lispro');
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.getByRole('button', { name: 'Open record' })).toHaveCount(10);
  await page.screenshot({ path: info.outputPath('screens/ward-expanded.png'), fullPage: true });
  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(page.getByRole('button', { name: 'Open record' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Refresh census' }).click();
  await expect(page.getByRole('article')).toHaveCount(10);
  await expect(page.getByRole('link', { name: 'Paper form packets' })).toHaveAttribute('href', '/spooler');
  await page.getByRole('link', { name: 'Prepare SBAR handover' }).click();
  await expect(page).toHaveURL(/\/handover$/);
});

test('ward card buttons: the patient check always comes first, and Cancel stays on the board', async ({ page }) => {
  await signIn(page, /Daniel Okafor/);
  const c = card(page, 'pt-03');
  const go = async (press: () => Promise<void>, url: RegExp) => {
    await press();
    await expect(page.getByRole('heading', { name: 'Is this the right patient?' })).toBeVisible();
    await expect(page.getByRole('dialog')).toContainText('Arjun Mehta');
    await page.getByRole('dialog').getByRole('button', { name: /^(No|Cancel)/ }).click();
    await expect(page).toHaveURL(/\/ward$/);
    await press();
    await page.getByRole('button', { name: 'Yes, open' }).click();
    await expect(page).toHaveURL(url);
    await menuPatients(page).click();
    await expect(page).toHaveURL(/\/ward$/);
  };
  await go(() => page.getByTestId('patient-pt-03').click(), /\/patients\/pt-03$/);
  await go(() => c.getByRole('button', { name: 'Labs', exact: true }).click(), /\/patients\/pt-03\/labs$/);
  await go(() => c.getByRole('button', { name: 'Vitals', exact: true }).click(), /\/patients\/pt-03\/vitals$/);
  await go(() => c.getByRole('button', { name: 'Give med' }).click(), /\/patients\/pt-03\/meds$/);
  await go(() => c.getByRole('button', { name: 'Body map' }).click(), /\/patients\/pt-03\/body$/);

  // A draft opens its own check page, for its own patient.
  await card(page, 'pt-07').getByRole('button', { name: /Show details/ }).click();
  await card(page, 'pt-07').getByRole('button', { name: 'Check draft' }).click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(page).toHaveURL(/\/capture\/.+\/confirm$/);
  await expect(page.getByText('Daniel Okoye').first()).toBeVisible();
});

test('a system admin sees the board but cannot give medicines or check drafts', async ({ page }) => {
  await signIn(page, /Kim Ellis/, '/ward');
  await expect(menuPatients(page)).toHaveCount(0); // not in the admin menu; only the address opens it
  await expect(page.getByRole('article')).toHaveCount(10);
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(page.getByRole('button', { name: 'Give med' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Check draft' })).toHaveCount(0);
  await page.getByTestId('patient-pt-03').click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(page.getByRole('region', { name: 'Record dose' })).toContainText('Nurses only');
  await expect(page.getByRole('link', { name: 'Give medicine' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^Start / })).toHaveCount(0);
});

test('patient summary: warnings, every action link, and only this patient', async ({ page }, info) => {
  await signIn(page, /Daniel Okafor/, '/patients/pt-01');
  await page.getByRole('button', { name: 'Yes, open' }).click();
  const main = page.getByRole('main');
  await expect(main.getByRole('note').filter({ hasText: 'amLODIPine' })).toContainText('Recorded 50 mg · order says 5 mg');
  for (const t of ['Record dose', 'Vital signs', 'Fluid I / O', 'Notes and SBAR', 'Doses and care orders', 'Recent bedside entries', 'Body sites and lines', 'Paper sheets', 'Shift handover']) {
    await expect(main.getByRole('region', { name: t, exact: true })).toBeVisible();
  }
  await page.screenshot({ path: info.outputPath('screens/summary.png'), fullPage: true });
  const base = '/patients/pt-01';
  const links: [string, string][] = [
    ['Give medicine', `${base}/meds`], ['All orders', `${base}/orders`], ['Record vitals', `${base}/vitals/record`], ['Vital signs flowsheet', `${base}/vitals`],
    ['Log Fluids', `${base}/io`], ['Add a fluid record', `${base}/io/record`], ['Add Note', `${base}/notes`], ['Paper SBAR slip', '/print/sbar/pt-01'],
    ['View details', `${base}/timeline`], ['OPEN FULL MAP', `${base}/body`], ['Photo of paper', `${base}/capture`], ['View full handover', `${base}/handoff`],
  ];
  for (const [name, href] of links) {
    const l = main.getByRole('link', { name: new RegExp(name) });
    await expect(l).toHaveAttribute('href', href);
    await l.click();
    await expect(page).toHaveURL(new RegExp(`${href}$`));
    await expect(page.getByRole('heading').first()).toBeVisible();
    await page.goBack();
    await expect(main.getByRole('region', { name: 'Record dose' })).toBeVisible();
  }
  // Nothing of another patient on the page.
  await expect(main).not.toContainText(/Lena Ortiz|Arjun Mehta|Potassium|DK-004527/);
  await main.getByRole('button', { name: 'Quick lock' }).click();
  await expect(page).toHaveURL(/\/lock$/);
});

test('a due dose on the summary starts that order at that slot', async ({ page }) => {
  await signIn(page, /Daniel Okafor/, '/patients/pt-04');
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await page.getByRole('link', { name: 'Start ceFAZolin due 14:00' }).click();
  await expect(page).toHaveURL(/\/patients\/pt-04\/meds\/.+\/record\?slot=/);
  await expect(page.getByRole('main')).toContainText(/ceFAZolin/i);
});

for (const width of [1440, 1024, 768, 390, 360]) {
  test(`${width}px: ward and summary fit; MRN, allergy and warnings are never cut off`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page, /Daniel Okafor/);
    await expect(page.getByRole('article')).toHaveCount(10);
    const fits = async (where: string) => {
      const o = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth] as const);
      expect(o[0], `${where} at ${width}`).toBeLessThanOrEqual(o[1]);
    };
    const whole = async (text: RegExp) => {
      const l = page.getByText(text).first();
      await l.scrollIntoViewIfNeeded();
      const r = await l.evaluate((e) => ({ inner: e.scrollWidth, outer: e.clientWidth, right: e.getBoundingClientRect().right }));
      expect(r.right, `${text} at ${width}`).toBeLessThanOrEqual(width);
      if (r.outer) expect(r.inner, `${text} cut off at ${width}`).toBeLessThanOrEqual(r.outer + 1);
    };
    await fits('ward');
    await whole(/MRN: DK-004512/);
    await whole(/amLODIPine: Recorded 50 mg/);
    await whole(/Sulfa antibiotics/);
    await page.getByRole('button', { name: 'Expand all' }).click();
    await fits('ward expanded');
    await page.screenshot({ path: info.outputPath(`screens/ward-${width}.png`), fullPage: true });
    await page.getByTestId('patient-pt-01').click();
    await page.getByRole('button', { name: 'Yes, open' }).click();
    await expect(page.getByRole('region', { name: 'Record dose' })).toBeVisible();
    await fits('summary');
    await page.screenshot({ path: info.outputPath(`screens/summary-${width}.png`), fullPage: true });
  });
}

test('ward and summary work offline, and nothing is sent anywhere', async ({ page, context }) => {
  await signIn(page, /Daniel Okafor/);
  await expect(page.getByRole('article')).toHaveCount(10);
  await context.setOffline(true);
  const sent: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173') && !/^(data|blob):/.test(r.url())) sent.push(r.url()); });
  await page.getByRole('button', { name: 'Refresh census' }).click();
  await page.getByRole('button', { name: 'Expand all' }).click();
  await page.getByTestId('patient-pt-02').click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(page.getByRole('region', { name: 'Record dose' })).toBeVisible();
  expect(sent).toEqual([]);
  await context.setOffline(false);
});
