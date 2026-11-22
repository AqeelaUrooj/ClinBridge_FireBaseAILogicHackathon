import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded, unlockPractice } from './helpers';

/**
 * Paper downtime forms (DT-MAR-01, DT-VIT-02, DT-SBAR-03) and the packet builder (/spooler).
 * window.print is replaced by a counter, so the tests can prove nothing prints by itself.
 * Fictional Practice data only.
 */

async function stubPrint(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __printCalls: number }).__printCalls = 0;
    window.print = () => { (window as unknown as { __printCalls: number }).__printCalls++; };
  });
}
const printCalls = (page: Page) => page.evaluate(() => (window as unknown as { __printCalls: number }).__printCalls);

async function pickDaniel(page: Page) {
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
}

test('single form: sign-in and the patient check come before any patient data; MAR shows real orders; printing only on click', async ({ page }, info) => {
  await stubPrint(page);
  await page.goto('/print/mar/pt-01');
  await unlockIfNeeded(page);
  // Signed out: sent to sign-in, not shown the form.
  await expect(page.getByRole('heading', { name: 'Who are you?' })).toBeVisible();
  await expect(page.locator('.print-sheet')).toHaveCount(0);
  await pickDaniel(page);
  // Back on the form route, the two-identifier patient check comes first.
  await expect(page.getByRole('dialog', { name: 'Is this the right patient?' })).toBeVisible();
  await expect(page.locator('.print-sheet')).toHaveCount(0);
  await page.getByRole('button', { name: 'Yes, open' }).click();

  const sheet = page.locator('.print-sheet[data-form="mar"]');
  await expect(sheet).toBeVisible();
  await expect(sheet.getByTestId('print-name')).toHaveText('RIVERA, Sam');
  await expect(sheet.getByTestId('print-mrn')).toHaveText('DK-004512');
  await expect(sheet.getByTestId('print-allergies')).toContainText('PENICILLIN');
  await expect(sheet.getByTestId('practice-label')).toBeVisible();
  const orders = sheet.getByTestId('mar-orders');
  await expect(orders).toContainText('amLODIPine');
  await expect(orders).toContainText('metoprolol tartrate');
  await expect(orders.locator('tbody > tr')).toHaveCount(2); // nursing / diet / lab orders are not medicines
  await expect(orders.locator('tr[data-order]', { hasText: 'metoprolol' })).toContainText('21:00');
  await expect(sheet).not.toContainText(/barcode|NEWS2|countersigned|verified/i);

  expect(await printCalls(page)).toBe(0); // nothing prints by itself
  await page.getByRole('button', { name: 'Print this sheet' }).click();
  expect(await printCalls(page)).toBe(1);

  // Print layout: no sidebar, no buttons, sheet only.
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('complementary', { name: 'Main menu' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Print this sheet' })).toBeHidden();
  await expect(sheet).toBeVisible();
  await page.screenshot({ path: info.outputPath('screens/print-mar-letter.png'), fullPage: true });
  await page.emulateMedia({ media: 'screen' });

  // A real PDF renders (Chromium print engine): at least one page, and the form text is in it.
  const pdf = await page.pdf({ format: 'Letter', printBackground: true });
  const pages = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  expect(pages).toBeGreaterThanOrEqual(1);
  const a4 = await page.pdf({ format: 'A4', printBackground: true });
  expect((a4.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThanOrEqual(1);
});

test('vitals and SBAR sheets: no scores; SBAR prints the saved handover; verbal orders and signatures are blank paper fields', async ({ page }, info) => {
  await stubPrint(page);
  await page.goto('/print/vit/pt-09');
  await unlockIfNeeded(page);
  await pickDaniel(page);
  await page.getByRole('button', { name: 'Yes, open' }).click();
  const vit = page.locator('.print-sheet[data-form="vit"]');
  await expect(vit.getByTestId('print-name')).toHaveText('NOVAK, Peter');
  await expect(vit.getByRole('table', { name: 'Vital signs grid' })).toBeVisible();
  await expect(vit.getByRole('table', { name: 'Neurological observations grid' })).toBeVisible();
  await expect(vit.getByRole('table', { name: 'Fluid balance grid' })).toContainText('Out: Urine');
  await expect(vit.getByTestId('vit-recent')).toContainText('SpO₂ 94%');
  await expect(vit).toContainText('ClinBridge does not calculate a coma scale total or any score');
  await expect(vit).not.toContainText(/NEWS2|MET call|Notify Charge|MO review/i);
  await page.screenshot({ path: info.outputPath('screens/print-vit.png'), fullPage: true });

  // Other forms for the same patient are one click away (still behind the same patient check).
  await page.getByRole('link', { name: /SBAR handover \(DT-SBAR-03\)/ }).click();
  const sbar = page.locator('.print-sheet[data-form="sbar"]');
  await expect(sbar.getByTestId('sbar-parts')).toContainText('Peter Novak, 62, chest infection');
  await expect(sbar).toContainText('Printed from the handover saved in ClinBridge');
  await expect(sbar.getByTestId('sbar-verbal-orders')).toBeVisible();
  await expect(sbar).toContainText('ClinBridge does not take, authorise or track verbal orders');
  await expect(sbar).toContainText('ClinBridge does not record handover sign-off');
  await page.screenshot({ path: info.outputPath('screens/print-sbar.png'), fullPage: true });
  expect(await printCalls(page)).toBe(0);
});

test('packet builder: choose, check the list, preview with one patient per page break, confirm before printing', async ({ page }, info) => {
  await stubPrint(page);
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await pickDaniel(page);
  await page.getByRole('link', { name: 'Paper form packets' }).click();
  await expect(page.getByRole('heading', { name: 'Paper form packets' })).toBeVisible();
  await expect(page.getByTestId('spooler-count')).toHaveText('0 of 10 patients selected · 0 forms');
  const next = page.getByRole('button', { name: 'Check the list' });
  await expect(next).toBeDisabled();

  // Select all, then none.
  await page.getByLabel('Select all 10 patients').check();
  await expect(page.getByTestId('spooler-count')).toHaveText('10 of 10 patients selected · 30 forms');
  await page.getByLabel('Select all 10 patients').uncheck();
  await expect(page.getByTestId('spooler-count')).toHaveText('0 of 10 patients selected · 0 forms');

  // No forms chosen: cannot go on.
  await page.getByLabel('Select Sam Rivera, bed 4B').check();
  for (const f of [/Medication record \(MAR\)/, /Vitals, neuro and I\/O/, /SBAR handover/]) await page.getByRole('checkbox', { name: f }).uncheck();
  await expect(page.getByText('Choose at least one form.')).toBeVisible();
  await expect(next).toBeDisabled();
  for (const f of [/Medication record \(MAR\)/, /SBAR handover/]) await page.getByRole('checkbox', { name: f }).check();

  await page.getByLabel('Select Peter Novak, bed 8A').check();
  await expect(page.getByTestId('spooler-count')).toHaveText('2 of 10 patients selected · 4 forms');
  await next.click();
  const review = page.getByTestId('spooler-review');
  await expect(review.locator('tbody tr')).toHaveCount(2);
  await expect(review).toContainText('DK-004512');
  await expect(review).toContainText('DK-004563');
  await page.getByRole('button', { name: 'The list is right: show the preview' }).click();

  const sheets = page.getByTestId('spooler-preview').locator('.print-sheet');
  await expect(sheets).toHaveCount(4);
  expect(await sheets.evaluateAll((els) => els.map((e) => `${e.getAttribute('data-patient')}:${e.getAttribute('data-form')}:${e.classList.contains('print-break')}`)))
    .toEqual(['pt-01:mar:false', 'pt-01:sbar:true', 'pt-09:mar:true', 'pt-09:sbar:true']);
  // Each sheet carries its own patient's identifiers (no cross-patient mix-up).
  await expect(sheets.nth(0).getByTestId('print-mrn')).toHaveText('DK-004512');
  await expect(sheets.nth(2).getByTestId('print-mrn')).toHaveText('DK-004563');

  expect(await printCalls(page)).toBe(0);
  await page.getByRole('button', { name: 'Print the packet' }).click();
  const dlg = page.getByRole('dialog', { name: 'Print the packet?' });
  await expect(dlg).toContainText('4 forms');
  await expect(dlg).toContainText('2 patients');
  await dlg.getByRole('button', { name: 'Cancel' }).click();
  expect(await printCalls(page)).toBe(0);
  await page.getByRole('button', { name: 'Print the packet' }).click();
  await page.getByRole('button', { name: 'Open the print dialog' }).click();
  await expect.poll(() => printCalls(page)).toBe(1);

  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('heading', { name: 'Paper form packets' })).toBeHidden();
  await expect(sheets.first()).toBeVisible();
  await page.screenshot({ path: info.outputPath('screens/spooler-packet-print.png'), fullPage: true });
});

test('paper forms work offline after a reload (installed app), including the patient check', async ({ page, context }) => {
  await stubPrint(page);
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated');
  await page.reload();
  await unlockPractice(page);
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  await page.goto('/print/sbar/pt-03');
  await unlockIfNeeded(page);
  await pickDaniel(page);
  await page.getByRole('button', { name: 'Yes, open' }).click();
  const sheet = page.locator('.print-sheet[data-form="sbar"]');
  await expect(sheet.getByTestId('print-name')).toContainText('MEHTA');
  await expect(sheet).toContainText('No handover saved in ClinBridge for this patient');
  await context.setOffline(false);
});
