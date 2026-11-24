import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';
import { pdfPageTexts } from './pdfText';

/** SBAR handover as four letter cards (Stitch "Clinical SBAR Handover"). Fictional Practice data only. */
test.use({ serviceWorkers: 'block' });
const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();

async function open(page: Page, path: string, who = /Daniel Okafor/) {
  await page.goto(path);
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
}
const goTo = (page: Page, path: string) => page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);

test('the newest handover opens as S, B, A, R with the saved words, and keeps facts of now apart', async ({ page }) => {
  await open(page, '/patients/pt-09/handoff');
  await expect(page.getByRole('heading', { name: 'SBAR handover' })).toBeVisible();
  const main = page.getByRole('main');
  for (const h of ['Situation', 'Background', 'Assessment', 'Recommendation, open items']) await expect(main.getByRole('heading', { name: h, exact: true })).toBeVisible();
  for (const t of ['Oxygen level dropped to 90% at 04:20.', 'Admitted 13 Nov. Droplet isolation.', 'Oxygen raised from 2 to 4 L/min at 04:25', 'Azithromycin due 10:00', 'Written by Jordan Park', 'save time not stored']) await expect(main).toContainText(t);
  const list = main.getByRole('region', { name: 'Patient list' }), meds = main.getByRole('region', { name: 'Medicine orders' }), vitals = main.getByRole('region', { name: 'Vital signs', exact: true });
  for (const box of [list, meds, vitals]) await expect(box).toContainText('Not part of the saved words.');
  await expect(list).toContainText('Droplet');
  await expect(meds).toContainText('Last given 10:00: 500 mg');
  await expect(meds).toContainText('Today 10:00 given');
  await expect(vitals.getByRole('row')).toHaveCount(4); // header, hospital list, 04:20, 04:55
  await expect(vitals.getByRole('row').nth(3)).toContainText('Linked here');
  await expect(main).not.toContainText(/NEWS2|hypoxic|bedside verified|target ≥|custody (transfer|accepted)|counter-sign handoff|tap badge/i);
});

test('no sign-off is faked: no PIN, tick or counter-sign button; the sheet to sign opens', async ({ page }) => {
  await open(page, '/patients/pt-09/handoff');
  const sign = page.getByRole('region', { name: 'Sign-off' });
  await expect(sign).toContainText('ClinBridge does not record a counter-signature or a transfer of care.');
  await expect(page.getByRole('main').locator('input')).toHaveCount(0);
  await expect(sign.getByRole('button')).toHaveCount(0);
  await sign.getByRole('link', { name: 'Sheet to sign' }).click();
  await expect(page).toHaveURL(/\/print\/sbar\/pt-09$/);
  await expect(page.locator('.print-sheet').first()).toContainText('Incoming nurse');
});

test('a linked record that is fixed later is crossed out, with the new version beside it, on screen and on paper', async ({ page }) => {
  await open(page, '/entries/e-007/correct');
  await page.getByLabel('Oxygen level').fill('96');
  await page.getByLabel('Why are you fixing this?').fill('typed oxygen level wrong');
  await page.getByRole('button', { name: 'Review' }).click();
  const warn = page.getByLabel('I re-checked these values and they are right');
  if (await warn.count()) await warn.check();
  await page.getByRole('button', { name: 'Save fix' }).click();
  await expect(page.getByText('Fix reason')).toBeVisible();
  await goTo(page, '/patients/pt-09/handoff/ho-01');
  const trail = page.getByRole('region', { name: 'Linked records' });
  await expect(trail.getByRole('note')).toContainText('One linked record was changed after this handover was written.');
  await expect(trail).toContainText('Old version');
  await expect(trail.getByRole('link', { name: /Now: Pulse 100 · O₂ 96%/ })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('level 94% at 04:55'); // the saved words stay as they were
  const paper = (await pdfPageTexts(await page.pdf({ format: 'A4' }))).map(squash).join('');
  for (const t of ['One linked record was changed', 'Old version', 'Now: Pulse 100']) expect(paper).toContain(squash(t));
  await trail.getByRole('link', { name: /Now: Pulse 100/ }).click();
  await expect(page).toHaveURL(/\/entries\//);
  await expect(page.getByRole('main')).toContainText('96');
});

test('a linked record marked as a mistake says do not use', async ({ page }) => {
  await open(page, '/entries/e-006');
  await page.getByRole('button', { name: 'Wrong patient or mistake' }).click();
  await page.getByLabel('Reason').fill('recorded on the wrong patient');
  await page.getByRole('button', { name: 'Mark as mistake' }).click();
  await expect(page.getByText('Mistake', { exact: false }).first()).toBeVisible();
  await goTo(page, '/patients/pt-09/handoff/ho-01');
  await expect(page.getByRole('region', { name: 'Linked records' })).toContainText('Do not use: marked as a mistake');
});

test('paper holds the saved words and linked records only; buttons and facts of now stay off it', async ({ page }) => {
  await open(page, '/patients/pt-09/handoff');
  await expect(page.getByRole('heading', { name: 'SBAR handover' })).toBeVisible();
  const paper = (await pdfPageTexts(await page.pdf({ format: 'A4' }))).map(squash).join('');
  for (const t of ['SBAR handover', 'Night to day, 14 Nov 07:00', 'Written by Jordan Park', 'Situation', 'Azithromycin due 10:00', 'Linked confirmed records', 'Pulse 100']) expect(paper, t).toContain(squash(t));
  for (const t of ['Not part of the saved words', 'New handover', 'All handovers', 'Sheet to sign', 'Back to ward', 'Last given']) expect(paper, t).not.toContain(squash(t));
});

test('the list opens older handovers; a patient with none gets an empty page and a New handover button', async ({ page }) => {
  await open(page, '/patients/pt-09/handoff/new');
  await page.getByLabel('Situation').fill('S text');
  await page.getByLabel('Background').fill('B text');
  await page.getByLabel('Assessment').fill('A text');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('region', { name: 'Linked records' })).toContainText('None linked');
  await page.getByRole('button', { name: 'I reviewed it — save' }).click();
  await expect(page.getByText('Handover saved on this laptop.')).toBeVisible();
  const all = page.getByRole('region', { name: 'All handovers' });
  await expect(all.getByRole('link')).toHaveCount(2);
  await expect(all.locator('[aria-current="page"]')).toContainText('Handover 13:2');
  await expect(page.getByRole('region', { name: 'Sign-off' })).toContainText(/Saved 13:2\d/);
  await all.getByRole('link', { name: /Night to day/ }).click();
  await expect(page).toHaveURL(/ho-01$/);
  await expect(page.getByRole('main')).toContainText('Oxygen level dropped to 90%');
  await page.getByRole('navigation', { name: 'Patient pages' }).getByRole('link', { name: 'SBAR handover' }).click();
  await expect(page).toHaveURL(/handoff$/);

  await goTo(page, '/patients/pt-06/handoff');
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(page.getByText('No handovers yet')).toBeVisible();
  await expect(page.getByRole('button', { name: /Print/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'New handover' })).toBeVisible();
});

test('an admin can read a handover but not write one; another patient\'s handover does not open here', async ({ page }) => {
  await open(page, '/patients/pt-09/handoff', /Kim Ellis/);
  await expect(page.getByRole('main')).toContainText('Oxygen level dropped to 90%');
  await expect(page.getByRole('link', { name: 'New handover' })).toHaveCount(0);
  await goTo(page, '/patients/pt-09/handoff/ho-02'); // Tom Hale's
  await expect(page.getByText('Handover not found.')).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText('Tom Hale');
});

for (const width of [1440, 1024, 768, 390, 360]) {
  test(`${width}px: handover and new handover fit; nothing is cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page, '/patients/pt-09/handoff');
    for (const path of ['/patients/pt-09/handoff', '/patients/pt-09/handoff/new']) {
      await goTo(page, path);
      await expect(page.getByRole('heading', { name: path.endsWith('new') ? 'New handover' : 'SBAR handover' })).toBeVisible();
      await page.evaluate(() => Promise.all(Array.from(document.fonts as unknown as Iterable<FontFace>).map((f) => f.load().catch(() => undefined))).then(() => undefined)); // icons are text until their font is there
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const skip = (e: Element) => !!e.closest('[aria-label="Patient pages"], [aria-label^="Vital signs table"]');
        const out = Array.from(document.querySelectorAll('main button, main a, main dd, main li, main textarea, main input')).filter((e) => { const b = e.getBoundingClientRect(); return b.width > 1 && (b.right > W + 1 || b.left < -1) && !skip(e); }).map((e) => e.textContent?.slice(0, 30));
        const cut = Array.from(document.querySelectorAll('main dd, main button, main li')).filter((e) => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1 && getComputedStyle(e).display !== 'inline' && !skip(e)).map((e) => e.textContent?.slice(0, 30));
        return { scroll: document.documentElement.scrollWidth > W, out, cut };
      });
      expect(r, `${path} at ${width}`).toEqual({ scroll: false, out: [], cut: [] });
    }
  });
}
