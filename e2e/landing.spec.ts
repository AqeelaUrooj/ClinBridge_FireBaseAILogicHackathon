import { expect, test } from '@playwright/test';

for (const width of [1440, 1024, 768, 390, 360]) {
  test(`public landing navigation, privacy and layout at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const external: string[] = [];
    page.on('request', request => { if (new URL(request.url()).origin !== 'http://localhost:4173') external.push(request.url()); });
    await page.goto('/landing');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('When the EHR goes down');
    for (const id of ['overview', 'workflow', 'features', 'hybrid-ai', 'recovery', 'faq']) {
      await expect(page.locator('#' + id)).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    expect(await page.evaluate(async () => (await indexedDB.databases()).map(db => db.name))).toEqual([]);
    await expect(page.locator('body')).not.toContainText(/Daniel Okafor|Lena Ortiz|DT-4W-01|SOC 2|HIPAA certified|zero data loss/i);
    const nav = page.getByRole('navigation', { name: 'Public navigation' });
    const menu = page.getByRole('button', { name: 'Menu', exact: true });
    if (width <= 1050) {
      await menu.click();
      await nav.getByRole('link', { name: 'Features', exact: true }).focus();
      await page.keyboard.press('Escape');
      await expect(menu).toBeFocused();
      await page.keyboard.press('Enter');
      await page.keyboard.press('Tab');
      await expect(nav.getByRole('link', { name: 'Overview' })).toBeFocused();
    }
    await nav.getByRole('link', { name: 'FAQ', exact: true }).click();
    await expect(page).toHaveURL(/#faq$/);
    const faq = page.locator('summary').first();
    await faq.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('details[open]')).toHaveCount(1);
    await page.keyboard.press('Space');
    await expect(page.locator('details[open]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Patient history' }).click();
    await expect(page.getByAltText(/Oxygen saturation trend/)).toBeVisible();
    await page.getByRole('button', { name: 'Paper forms' }).click();
    await expect(page.getByAltText(/paper-form selector/)).toBeVisible();
    await page.getByRole('button', { name: 'Bedside charting' }).click();
    await expect(page.locator('.lp-metrics > li')).toHaveCount(4);
    await expect(page.locator('.lp-steps > li')).toHaveCount(3);
    await expect(page.getByRole('img', { name: /Illustrative front view/ })).toBeVisible();
    await expect.poll(() => page.locator('.landing img').evaluateAll(imgs =>
      imgs.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0),
    )).toBe(true);
    expect(external).toEqual([]);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: info.outputPath('screens', `landing-${width}.png`), fullPage: true });
    const footer = page.getByRole('contentinfo');
    await expect(footer.getByRole('link', { name: 'GitHub source' })).toHaveAttribute('href', 'https://github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon');
    await expect(footer.getByRole('link', { name: 'Apache-2.0 license' })).toHaveAttribute('href', /\/blob\/main\/LICENSE$/);
  });
}

test('Practice CTA enters the existing PIN flow with a prior Real preference', async ({ page }) => {
  await page.goto('/landing');
  await page.evaluate(() => localStorage.setItem('dtk.dataset', 'live'));
  await page.getByRole('main').getByRole('link', { name: /Launch Practice Demo/ }).first().click();
  await expect(page).toHaveURL(/\/sign-in\?demo=practice$/);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  await expect(page.getByRole('heading', { name: /Enter your PIN/ })).toBeVisible();
});

test('installed public page reloads offline without opening a vault', async ({ page, context }) => {
  await page.goto('/landing');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect.poll(() => page.locator('.lp-photo img').evaluateAll(imgs =>
    imgs.length === 4 && imgs.every(img => (img as HTMLImageElement).complete && (img as HTMLImageElement).naturalWidth > 0),
  )).toBe(true);
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
});

for (const route of ['/', '/ward', '/admin', '/patients/pt-01', '/entries/e-022', '/spooler', '/print/mar/pt-01']) {
  test(`unauthenticated ${route} still requires sign-in`, async ({ page }) => {
    await page.goto(route);
    await expect(page).toHaveURL(/\/sign-in$/);
  });
}
