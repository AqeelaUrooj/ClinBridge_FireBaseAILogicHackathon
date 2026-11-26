import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

/**
 * Medication record (MAR) and two-nurse page, rebuilt after the Stitch designs. Every control is used here, or shown
 * to be switched off with its reason on the page. Fictional Practice data only.
 */
async function open(page: Page, path: string, who = /Daniel Okafor/) {
  await page.goto(path);
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  await pin(page, '2468');
  await page.getByRole('button', { name: 'Yes, open' }).click();
}
async function pin(page: Page, digits: string) {
  for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click();
}
const order = (page: Page, id: string) => page.getByTestId(`order-${id}`);
const panel = (page: Page, id: string) => page.getByRole('region', { name: `Order details ${id}` });

test('MAR: tabs, search, hour strip, dose difference, order panel', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, '/patients/pt-01/meds');
  await expect(page.getByRole('heading', { level: 1, name: /Medicines/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Patient pages' }).getByRole('link')).toHaveCount(9); // + Stay and admission

  // 50 mg recorded against a 5 mg order is said in words, with the way to the record.
  await expect(order(page, 'ord-01').getByRole('note')).toContainText('Recorded 50 mg · order says 5 mg');
  await expect(order(page, 'ord-02').getByRole('note')).toHaveCount(0);
  await expect(panel(page, 'ord-01')).toContainText('amLODIPine 5 mg by mouth once daily');
  await expect(panel(page, 'ord-01')).toContainText('amlodipine 5.0 mg PO 0900'); // the kept paper line
  await expect(panel(page, 'ord-01')).toContainText('134/80');
  await expect(page.getByRole('main')).not.toContainText(/hold if|mean arterial|confidence|overdue|maximum/i);

  // Hour strip: now is marked; times outside the strip are still listed.
  const strip = page.getByRole('region', { name: "Today's hours" });
  await expect(strip.locator('[aria-current="time"]')).toContainText('13:00');
  await expect(strip).toContainText('21:00');

  const tabs = page.getByRole('group', { name: 'Order type' });
  for (const [name, n] of [['Scheduled', 2], ['PRN', 0], ['Continuous', 0], ['Stopped', 0], ['All orders', 2]] as const) {
    const t = tabs.getByRole('button', { name: new RegExp(name) });
    await expect(t).toContainText(String(n));
    await t.click();
    await expect(t).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-testid^="order-"]')).toHaveCount(n);
  }
  await tabs.getByRole('button', { name: /Stopped/ }).click();
  await expect(page.getByText('No stopped or held orders in the patient list.')).toBeVisible();
  await page.getByRole('button', { name: 'Show all orders' }).click();
  await page.getByLabel('Search orders').fill('metop');
  await expect(page.locator('[data-testid^="order-"]')).toHaveCount(1);
  await page.getByLabel('Search orders').fill('zzz');
  await expect(page.getByText('No orders match.')).toBeVisible();
  await page.getByRole('button', { name: 'Show all orders' }).click();
  await page.screenshot({ path: info.outputPath('screens/mar.png'), fullPage: true });

  // Choosing a card changes the panel and the address.
  await order(page, 'ord-02').getByRole('link', { name: 'metoprolol tartrate', exact: true }).click();
  await expect(page).toHaveURL(/\/meds\/ord-02$/);
  await expect(panel(page, 'ord-02')).toContainText('metoprolol tartrate');
  await expect(panel(page, 'ord-01')).toHaveCount(0);
  await expect(panel(page, 'ord-02').getByRole('link', { name: 'Print MAR schedule' })).toHaveAttribute('href', '/print/mar/pt-01');
  await panel(page, 'ord-02').getByRole('link', { name: /Record dose/ }).click();
  await expect(page).toHaveURL(/ord-02\/record\?slot=2026-11-14T21%3A00/);
});

test('MAR: what cannot be done is switched off and says why; links go to this patient only', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, '/patients/pt-01/meds');
  await expect(page.getByRole('button', { name: 'Record non-MAR med' })).toBeDisabled();
  await expect(page.getByText('A medicine without an order cannot be recorded here yet.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Flag time conflict' })).toBeDisabled();
  await expect(page.getByText(/no medicine timing rule has been approved/)).toBeVisible();

  const hrefs = await page.getByRole('main').getByRole('link').evaluateAll((els) => els.map((e) => e.getAttribute('href')!));
  for (const h of hrefs.filter((x) => x.startsWith('/patients/') || x.startsWith('/print/'))) expect(h).toContain('pt-01');
  await expect(page.getByRole('main')).not.toContainText(/HYDROmorphone|insulin|Lena Ortiz|Daniel Okoye/);

  const go = async (name: string, url: RegExp) => {
    await page.getByRole('main').getByRole('link', { name }).first().click();
    await expect(page).toHaveURL(url);
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1, name: /Medicines/ })).toBeVisible();
  };
  await go('All orders from the patient list', /pt-01\/orders$/);
  await go('Write a note', /pt-01\/notes$/);
  await go('Check dose record from 09:00', /\/entries\/e-029$/);
  await go('View record of metoprolol tartrate', /\/entries\/e-030$/);
  await go('Paper photo record from 09:00', /\/entries\/e-029$/);
  await go('Start metoprolol tartrate for 21:00', /ord-02\/record\?slot=/);
  for (const [tab, url] of [['Summary', /pt-01$/], ['History', /timeline$/], ['Vitals', /vitals$/], ['Intake / Output', /io$/], ['Clinical notes', /notes$/], ['Body map and sites', /body$/]] as const) await go(tab, url);

  // An order of another patient does not open here.
  await page.goto('/patients/pt-01/meds/ord-18');
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  await pin(page, '2468');
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(page.getByText('This medicine order was not found.')).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('HYDROmorphone');
});

test('MAR for as-needed, infusion and a system admin', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, '/patients/pt-07/meds');
  await expect(order(page, 'ord-18')).toContainText('Last given: 04:30 by Maria Alvarez');
  await expect(order(page, 'ord-18').getByRole('link', { name: 'Record PRN dose of HYDROmorphone' })).toHaveAttribute('href', '/patients/pt-07/meds/ord-18/record');
  await expect(order(page, 'ord-17').getByRole('link', { name: 'New rate for sodium chloride 0.9%' })).toHaveAttribute('href', '/patients/pt-07/meds/ord-17/record?event=rate_changed');
  await order(page, 'ord-17').getByRole('link', { name: 'sodium chloride 0.9%', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Change rate' })).toBeVisible();

  await open(page, '/patients/pt-07/meds/ord-18', /Kim Ellis/);
  await expect(page.getByText('Only nurses can record medicines')).toBeVisible();
  await expect(page.getByRole('link', { name: /Give now|Record PRN|New rate|^Start / })).toHaveCount(0);
  await open(page, '/patients/pt-07/meds/ord-18/record', /Kim Ellis/);
  await expect(page.getByText('Only nurses can record medicines.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Review' })).toHaveCount(0);
});

test('two-nurse page: facts, own PIN only, Go back throws the check away, Cancel records nothing', async ({ page }, info) => {
  await open(page, '/patients/pt-07/meds/ord-18/record');
  const med = page.getByRole('region', { name: 'Medicine', exact: true });
  await expect(med).toContainText('Allergy: Morphine');
  await expect(med).toContainText('Last dose of this order: 0.5 mg at 04:30');
  await expect(med).toContainText('8 h 50 min ago, by Maria Alvarez');
  await expect(med).toContainText('A record for this order at 12:20 is waiting to be checked');
  await expect(med).toContainText('ClinBridge does not clear or approve a dose');
  await expect(page.getByRole('region', { name: 'Preparation and waste' })).toContainText('Not recorded here');
  await expect(page.getByRole('main')).not.toContainText(/RFID|mesh|broadcast|cleared\b|stable/i);
  await expect(page.locator('[aria-current="step"]')).toContainText('Dose details');
  const logBefore = await page.getByText(/change-log rows now/).innerText();

  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.locator('[aria-current="step"]')).toContainText('Second nurse check');
  const verify = page.getByRole('region', { name: 'Independent verification' });
  const save = page.getByRole('button', { name: 'Save dose record' });
  await expect(save).toBeDisabled();
  await expect(verify.getByRole('checkbox')).toHaveCount(0); // no ticks that are not kept
  await expect(verify.getByRole('button', { name: /Daniel Okafor|Kim Ellis/ })).toHaveCount(0);
  await verify.getByRole('button', { name: /Jordan Park/ }).click();
  await pin(page, '1111');
  await expect(verify.getByText(/Wrong PIN/)).toBeVisible();
  await expect(save).toBeDisabled();
  await page.screenshot({ path: info.outputPath('screens/two-nurse-pin.png'), fullPage: true });
  await verify.getByRole('button', { name: 'Pick a different nurse' }).click();
  await verify.getByRole('button', { name: /Maria Alvarez/ }).click();
  await page.keyboard.type('2468'); // a keyboard works too
  await expect(verify.getByText('Checked by Maria Alvarez')).toBeVisible();
  await expect(verify).toContainText('Co-signed');
  await expect(page.locator('[aria-current="step"]')).toContainText('Save on this laptop');
  await expect(save).toBeEnabled();

  // Changing the record throws the second check away.
  await page.getByRole('button', { name: 'Go back' }).click();
  await page.getByLabel('Dose given').fill('1');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(verify.getByText(/Checked by/)).toHaveCount(0);
  await expect(page.getByText('Dose 1 mg is different from the order (0.5 mg)')).toBeVisible();
  await verify.getByRole('button', { name: /Maria Alvarez/ }).click();
  await pin(page, '2468');
  await expect(save).toBeDisabled(); // the dose warning still has to be ticked
  await page.getByLabel('I checked this and it is right').check();
  await expect(save).toBeEnabled();

  await page.getByRole('button', { name: 'Cancel, nothing is recorded' }).click();
  await expect(page).toHaveURL(/\/pt-07\/meds\/ord-18$/);
  await page.getByRole('link', { name: 'Give now' }).click();
  expect(await page.getByText(/change-log rows now/).innerText()).toBe(logBefore);
});

test('two-nurse page: five wrong PINs lock the keypad, and Go back does not unlock it', async ({ page }) => {
  await open(page, '/patients/pt-07/meds/ord-18/record');
  await page.getByRole('button', { name: 'Review' }).click();
  const verify = page.getByRole('region', { name: 'Independent verification' });
  await verify.getByRole('button', { name: /Ana Reyes/ }).click();
  for (const left of [4, 3, 2, 1]) {
    await pin(page, '1111');
    await expect(verify.getByText(`Wrong PIN · ${left} tries left`)).toBeVisible();
  }
  await pin(page, '1111');
  await expect(verify.getByText('Too many wrong tries. Wait 1 minute.')).toBeVisible();
  await page.getByRole('button', { name: 'Go back' }).click();
  await page.getByRole('button', { name: 'Review' }).click();
  await verify.getByRole('button', { name: /Maria Alvarez/ }).click();
  await expect(verify.getByRole('button', { name: '1', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Save dose record' })).toBeDisabled();
});

test('two-nurse page: a held dose needs no second nurse; a given dose keeps both names', async ({ page }) => {
  await open(page, '/patients/pt-07/meds/ord-18/record');
  const verify = page.getByRole('region', { name: 'Independent verification' });
  await page.getByRole('button', { name: 'Held', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Independent verification' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByText('Say why it was held')).toBeVisible();
  await page.getByLabel('Why was it held?').fill('patient asleep');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByText('No second nurse is asked for on this record.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Go back' }).click();

  // Give it, with a second nurse: the saved record names them.
  await page.getByRole('button', { name: 'Given', exact: true }).click();
  await page.getByRole('button', { name: 'Review' }).click();
  await verify.getByRole('button', { name: /Maria Alvarez/ }).click();
  await pin(page, '2468');
  await page.getByRole('button', { name: 'Save dose record' }).click();
  await expect(page.getByText('Saved on this laptop.')).toBeVisible();
  await order(page, 'ord-18').getByRole('link', { name: 'HYDROmorphone', exact: true }).click();
  await page.getByRole('region', { name: 'Order history' }).getByRole('link', { name: /13:20/ }).click();
  await expect(page.getByText('Second nurse')).toBeVisible();
  await expect(page.getByText('Maria Alvarez')).toBeVisible();
});

for (const width of [1440, 1024, 768, 390, 360]) {
  test(`${width}px: MAR, order and two-nurse pages fit and stay usable`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page, '/patients/pt-07/meds');
    const fits = async (where: string) => {
      const o = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth] as const);
      expect(o[0], `${where} at ${width}`).toBeLessThanOrEqual(o[1]);
      await page.screenshot({ path: info.outputPath(`screens/${where}-${width}.png`), fullPage: true });
    };
    await expect(order(page, 'ord-18')).toBeVisible();
    await fits('mar');
    if (width < 1280) await expect(panel(page, 'ord-18')).toBeHidden(); // list and detail are separate pages
    await order(page, 'ord-18').getByRole('link', { name: 'HYDROmorphone', exact: true }).click();
    await expect(panel(page, 'ord-18')).toBeVisible();
    await fits('mar-order');
    if (width < 1280) {
      await expect(order(page, 'ord-18')).toBeHidden();
      await page.getByRole('link', { name: 'Back to the medication list' }).click();
      await expect(order(page, 'ord-18')).toBeVisible();
      await order(page, 'ord-18').getByRole('link', { name: 'HYDROmorphone', exact: true }).click();
    }
    await page.getByRole('link', { name: 'Give now' }).click();
    await expect(page.getByRole('button', { name: 'Review' })).toBeVisible();
    await fits('two-nurse-fill');
    await page.getByRole('button', { name: 'Review' }).click();
    await page.getByRole('button', { name: /Jordan Park/ }).click();
    const key = page.getByRole('button', { name: '9', exact: true });
    await key.scrollIntoViewIfNeeded();
    const box = (await key.boundingBox())!;
    expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
    await fits('two-nurse-pin');
  });
}

test('MAR and two-nurse save work offline', async ({ page, context }) => {
  await open(page, '/patients/pt-02/meds');
  await context.setOffline(true);
  await order(page, 'ord-04').getByRole('link', { name: 'insulin lispro', exact: true }).click();
  await page.getByRole('link', { name: /Record dose/ }).click();
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: /Jordan Park/ }).click();
  await pin(page, '2468');
  await page.getByRole('button', { name: 'Save dose record' }).click();
  await expect(page.getByText('Saved on this laptop.')).toBeVisible();
  await context.setOffline(false);
});
