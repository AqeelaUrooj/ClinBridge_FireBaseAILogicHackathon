import { expect, type Page } from '@playwright/test';

/**
 * Records are encrypted at rest (P-04). A fresh browser creates the Practice vault and opens unlocked; any
 * reload, restart or "Lock records" shows the unlock screen first. Practice uses the PUBLIC practice
 * passphrase (no secrecy, fake data only).
 */
export async function unlockPractice(page: Page) {
  const unlock = page.getByRole('heading', { name: 'Unlock records on this laptop' });
  await expect(unlock).toBeVisible();
  await page.getByRole('button', { name: 'Use practice passphrase' }).click();
  await expect(unlock).toBeHidden({ timeout: 15_000 });
}

/** After a navigation: unlock if the unlock screen is showing, otherwise carry on. */
export async function unlockIfNeeded(page: Page) {
  const unlock = page.getByRole('heading', { name: 'Unlock records on this laptop' });
  const ready = page.getByRole('heading', { name: /Who are you\?|Enter your PIN|First-time setup|Screen locked/ });
  await expect(unlock.or(ready).first()).toBeVisible({ timeout: 15_000 });
  if (await unlock.isVisible()) await unlockPractice(page);
}
