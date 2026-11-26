import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

/** Sign-in and lock screens (Stitch "Staff sign-in" and "Terminal auto-lock"). Fictional Practice data only. */
test.use({ serviceWorkers: 'block' });
const PATIENTS = /Rivera|Novak|Ortiz|Santos|Chen|DK-00/;
const digits = async (page: Page, d: string) => { for (const x of d) await page.getByRole('button', { name: x, exact: true }).click(); };
async function open(page: Page) {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await expect(page.getByRole('heading', { name: 'Who are you?' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Daniel Okafor/ })).toBeVisible();
}
async function signIn(page: Page, who = /Daniel Okafor/) {
  await open(page);
  await page.getByRole('button', { name: who }).click();
  await digits(page, '2468');
  await expect(page).not.toHaveURL(/sign-in/);
}
const goTo = (page: Page, path: string) => page.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')); }, path);

test('the keypad is on the same page and waits for a name; choosing another person clears the PIN', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('button', { name: '1', exact: true })).toBeDisabled();
  await page.keyboard.type('2468');
  await expect(page).toHaveURL(/sign-in/);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  await expect(page.getByRole('button', { name: /Daniel Okafor/ })).toHaveAttribute('aria-pressed', 'true');
  await digits(page, '24');
  await expect(page.getByLabel('2 of 4 digits entered')).toBeVisible();
  await page.getByRole('button', { name: /Maria Alvarez/ }).click();
  await expect(page.getByLabel('0 of 4 digits entered')).toBeVisible();
  await page.getByRole('button', { name: 'Not you?' }).click();
  await expect(page.getByRole('heading', { name: 'Who are you?' })).toBeVisible();
  await expect(page.getByRole('button', { name: '1', exact: true })).toBeDisabled();
});

test('the physical keyboard signs in; an admin lands on Admin', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: /Kim Ellis/ }).click();
  await expect(page.getByText('can manage this laptop, cannot chart')).toBeVisible();
  await page.keyboard.type('2468');
  await expect(page).toHaveURL(/\/admin$/);
});

test('this laptop: real facts only; no badge, mesh, power, drift, escrow or AI claim; no patient before sign-in', async ({ page }) => {
  await open(page);
  const box = page.getByRole('region', { name: 'This laptop' });
  for (const t of ['4 West', 'Network cleared at 12:40', 'Downtime started 03:40, not ended yet', 'Encrypted (AES-256-GCM)', '10 patients on the list', '5 min', '5 tries']) await expect(box).toContainText(t);
  await expect(page.getByRole('main')).toContainText('DT-4W-01');
  await expect(page.getByRole('main')).toContainText('7 people on this laptop'); // incl. the fictional Admission Staff account
  await expect(page.getByRole('main')).not.toContainText(/badge|\bmesh\b|enclave|escrow|\bMAC\b|\bUPS\b|drift|\bViT\b|SQLite|Epic|air-gapped|signed/i);
  await expect(page.locator('body')).not.toContainText(PATIENTS);
  await page.getByText('Forgot your PIN? Ask an admin.').click();
  await expect(page.getByText('no emergency code')).toBeVisible();
});

test('network state follows the browser and sign-in works with no network', async ({ page, context }) => {
  await open(page);
  const box = page.getByRole('region', { name: 'This laptop' });
  await expect(box).toContainText('Connected');
  await context.setOffline(true);
  await expect(box).toContainText('None');
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  await digits(page, '2468');
  await expect(page).toHaveURL(/\/ward$/);
});

test('lock screen: who, when and why; counts only; no patient; a wrong PIN stays out', async ({ page }) => {
  await signIn(page);
  await goTo(page, '/labs');
  await page.getByRole('button', { name: 'Lock screen' }).click();
  await expect(page.getByRole('heading', { name: 'Screen locked' })).toBeVisible();
  const main = page.getByRole('main');
  for (const t of ['Locked by the person signed in', 'Daniel Okafor', 'Patients on the list', 'Records on this laptop', 'No patient is shown']) await expect(main).toContainText(t);
  await expect(main).toContainText(/Locked at \d\d:\d\d/);
  await expect(page.locator('body')).not.toContainText(PATIENTS);
  await expect(main).not.toContainText(/override|badge|RFID|critical|code blue|\bTPM\b|mesh/i);
  await digits(page, '1111');
  await expect(page.getByRole('alert')).toContainText('Wrong PIN · 4 tries left');
  await expect(page).toHaveURL(/lock/);
  await digits(page, '2468');
  await expect(page).not.toHaveURL(/lock/);
});

test('five minutes without use locks the screen and the lock screen says so', async ({ page }) => {
  await signIn(page);
  await page.clock.install();
  await page.keyboard.press('Shift'); // starts the idle timer again, on the test clock
  await page.clock.fastForward('05:10');
  await expect(page.getByRole('heading', { name: 'Screen locked' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Locked because nobody used it');
});

test('a locked screen cannot be passed by the address; Switch user ends the session', async ({ page }) => {
  await signIn(page);
  await page.getByRole('button', { name: 'Lock screen' }).click();
  await goTo(page, '/patients/pt-01');
  await expect(page.getByRole('heading', { name: 'Screen locked' })).toBeVisible();
  await page.getByRole('button', { name: 'Switch user' }).click();
  await expect(page.getByRole('heading', { name: 'Who are you?' })).toBeVisible();
  await goTo(page, '/ward');
  await expect(page).toHaveURL(/sign-in/);
});

for (const width of [1440, 1280, 1024, 768, 390, 360]) {
  test(`${width}px: sign-in and lock fit; nothing is cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page);
    const measure = async () => {
    await page.evaluate(() => Promise.all(Array.from(document.fonts as unknown as Iterable<FontFace>).map((f) => f.load().catch(() => undefined))).then(() => undefined)); // icons are text until their font is there
    return page.evaluate(() => {
      const W = document.documentElement.clientWidth;
      const seen = Array.from(document.querySelectorAll('main button, main p, main h1, main span, main summary')).filter((e) => e.getBoundingClientRect().width > 1);
      const out = seen.filter((e) => { const b = e.getBoundingClientRect(); return b.right > W + 1 || b.left < -1; }).map((e) => e.textContent?.slice(0, 30));
      const cut = seen.filter((e) => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1 && getComputedStyle(e).display !== 'inline').map((e) => e.textContent?.slice(0, 30));
      return { scroll: document.documentElement.scrollWidth > W, out, cut };
    });
    };
    expect(await measure(), `names at ${width}`).toEqual({ scroll: false, out: [], cut: [] });
    await page.getByRole('button', { name: /Daniel Okafor/ }).click();
    expect(await measure(), `PIN at ${width}`).toEqual({ scroll: false, out: [], cut: [] });
    if (width < 768) await expect(page.getByRole('button', { name: '0', exact: true })).toBeInViewport();
    await digits(page, '2468');
    await page.getByRole('button', { name: 'Lock screen' }).click();
    await expect(page.getByRole('heading', { name: 'Screen locked' })).toBeVisible();
    expect(await measure(), `lock at ${width}`).toEqual({ scroll: false, out: [], cut: [] });
  });
}
