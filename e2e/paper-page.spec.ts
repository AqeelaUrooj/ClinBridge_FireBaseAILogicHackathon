import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

/** The pages around the paper forms (Stitch "printable …", "Batch census spooler"). Fictional Practice data only. */
test.use({ serviceWorkers: 'block' });

async function open(page: Page, path: string) {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page).not.toHaveURL(/sign-in/);
  await page.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')); }, path);
  const yes = page.getByRole('button', { name: 'Yes, open' });
  await expect(yes.or(page.getByRole('heading', { level: 1 })).first()).toBeVisible();
  if (await yes.isVisible()) await yes.click();
}
const order = (page: Page) => page.getByTestId('spooler-preview').locator('.print-sheet').evaluateAll((els) => els.map((e) => `${e.getAttribute('data-patient')}:${e.getAttribute('data-form')}:${e.classList.contains('print-break')}`));
async function pick(page: Page) {
  await page.getByLabel('Select Sam Rivera, bed 4B').check();
  await page.getByLabel('Select Peter Novak, bed 8A').check();
  await page.getByRole('checkbox', { name: /Vitals, neuro and I\/O/ }).uncheck();
}

test('form tabs show which form is open and lead to the others; no printer, barcode or scan claim', async ({ page }) => {
  await open(page, '/print/mar/pt-09');
  const tabs = page.getByRole('navigation', { name: 'Other paper forms for this patient' });
  await expect(tabs.getByRole('link')).toHaveCount(3);
  await expect(tabs.getByRole('link', { name: /Medication record/ })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('main')).toContainText('Bed 8A, Peter Novak');
  await tabs.getByRole('link', { name: /Vitals, neuro and I\/O/ }).click();
  await expect(page).toHaveURL(/\/print\/vit\/pt-09/);
  await expect(tabs.locator('[aria-current="page"]')).toHaveText(/DT-VIT-02/);
  await expect(page.getByRole('main')).not.toContainText(/laserjet|toner|tray|\bOCR\b|fiducial|provenance|barcode|QR\b|\bhash\b|online \/ ready/i);
  await page.getByRole('link', { name: 'Forms for more patients' }).click();
  await expect(page.getByRole('heading', { name: 'Paper form packets' })).toBeVisible();
});

test('the packet goes by patient first; by form changes the order of the sheets and warns', async ({ page }) => {
  await open(page, '/spooler');
  await pick(page);
  const go = async () => { await page.getByRole('button', { name: 'Check the list' }).click(); await page.getByRole('button', { name: 'The list is right: show the preview' }).click(); await expect(page.getByTestId('spooler-preview').locator('.print-sheet')).toHaveCount(4); };
  await go();
  expect(await order(page)).toEqual(['pt-01:mar:false', 'pt-01:sbar:true', 'pt-09:mar:true', 'pt-09:sbar:true']);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('radio', { name: 'By form' }).click();
  await expect(page.getByText('Check the name and MRN on each sheet')).toBeVisible();
  await go();
  expect(await order(page)).toEqual(['pt-01:mar:false', 'pt-09:mar:true', 'pt-01:sbar:true', 'pt-09:sbar:true']);
  await expect(page.getByTestId('spooler-preview').locator('.print-sheet').nth(1).getByTestId('print-mrn')).toHaveText('DK-004563');
});

test('rows show medicine orders, high-alert names and what is in the packet', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await open(page, '/spooler');
  const row = (name: string) => page.getByRole('row').filter({ hasText: name });
  await expect(row('Tom Hale')).toContainText(/High-alert list: .*heparin/i);
  await expect(row('Sam Rivera').locator('td').last()).toHaveText('—');
  await pick(page);
  await expect(row('Sam Rivera').locator('td').last()).toHaveText('MARSBAR');
  await expect(page.getByRole('main')).toContainText('2 of 10 patients');
});

for (const width of [1440, 1280, 1024, 768, 390, 360]) {
  test(`${width}px: print page and packet page fit; nothing is cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    const measure = async () => {
      await page.evaluate(() => Promise.all([...document.fonts].map((f) => f.load().catch(() => undefined))).then(() => undefined)); // icons are text until their font is there
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const seen = Array.from(document.querySelectorAll('main button, main a, main dd, main label, main p')).filter((e) => e.getBoundingClientRect().width > 1 && !e.closest('.print-preview') && !e.closest('.overflow-x-auto'));
        const out = seen.filter((e) => { const b = e.getBoundingClientRect(); return b.right > W + 1 || b.left < -1; }).map((e) => e.textContent?.slice(0, 30));
        return { scroll: document.documentElement.scrollWidth > W, out };
      });
      expect(r, `at ${width}`).toEqual({ scroll: false, out: [] });
    };
    await open(page, '/spooler');
    await expect(page.getByTestId('spooler-count')).toBeVisible();
    await measure();
    await open(page, '/print/mar/pt-09');
    await expect(page.getByRole('navigation', { name: 'Other paper forms for this patient' })).toBeVisible();
    await measure();
  });
}
