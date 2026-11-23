import { expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

/** Words from the Stitch admin screens that ClinBridge cannot claim. */
export const NOT_REAL = /\bmesh\b|escrow|\bTPM\b|argon2|\bUPS\b|battery|peer|\bCOW\b|enclave|badge|RFID|yubikey|\bNTP\b|\bPTP\b|IEEE|Epic|Cerner|SQLite|merkle|FIPS|HIPAA|Joint Commission|tamper-proof|synced|broadcast|toner|zebra|laserjet/i;

export async function openAdmin(page: Page, path: string, who = /Kim Ellis/) {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page).not.toHaveURL(/sign-in/);
  await page.evaluate((x) => { history.pushState({}, '', x); dispatchEvent(new PopStateEvent('popstate')); }, path);
}
/** Nothing scrolls sideways, leaves the page or is cut off. */
export async function expectFits(page: Page, width: number) {
  await page.evaluate(() => Promise.all(Array.from(document.fonts as unknown as Iterable<FontFace>).map((f) => f.load().catch(() => undefined))).then(() => undefined)); // icons are text until their font is there
  const r = await page.evaluate(() => {
    const W = document.documentElement.clientWidth;
    const seen = Array.from(document.querySelectorAll('main button, main a, main dd, main li, main select, main input, main p, main h2, main h3, main th, main td')).filter((e) => e.getBoundingClientRect().width > 1);
    const out = seen.filter((e) => { const b = e.getBoundingClientRect(); return b.right > W + 1 || b.left < -1; }).map((e) => e.textContent?.slice(0, 30));
    const cut = seen.filter((e) => !['SELECT', 'INPUT'].includes(e.tagName) && (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1 && getComputedStyle(e).display !== 'inline').map((e) => e.textContent?.slice(0, 30));
    return { scroll: document.documentElement.scrollWidth > W, out, cut };
  });
  expect(r, `at ${width}`).toEqual({ scroll: false, out: [], cut: [] });
}
