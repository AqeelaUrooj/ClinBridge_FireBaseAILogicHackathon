import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

/** Paper capture as two panes (Stitch "Bedside Paper Capture"). Fictional Practice data and a drawn, fictional form only. */
test.use({ serviceWorkers: 'block' });
const TICK = 'I checked every value against the paper.';

async function signIn(page: Page, who = /Daniel Okafor/) {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page).not.toHaveURL(/sign-in/);
}
async function go(page: Page, path: string) {
  await page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);
  await page.waitForTimeout(400); // the page before can have the same heading
  const yes = page.getByRole('button', { name: 'Yes, open' });
  const heading = page.getByRole('heading', { name: /Photo of paper|Check and confirm/ });
  await expect(yes.or(heading).first()).toBeVisible();
  if (await yes.isVisible()) await yes.click();
  await expect(heading).toBeVisible();
}
/** A drawn form, taller than wide, with its own background so the edges can be seen. */
async function formPng(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 900; c.height = 1200; const g = c.getContext('2d')!;
    g.fillStyle = '#c9c4b8'; g.fillRect(0, 0, 900, 1200); g.strokeStyle = '#222'; g.lineWidth = 4;
    for (let y = 60; y < 1200; y += 24) { g.beginPath(); g.moveTo(40, y); g.lineTo(860, y); g.stroke(); }
    return c.toDataURL('image/png').split(',')[1]!;
  });
  return Buffer.from(b64, 'base64');
}
const takePhoto = async (page: Page, id = 'photo-input') => page.getByTestId(id).setInputFiles({ name: 'f.png', mimeType: 'image/png', buffer: await formPng(page) });
const photoCount = (page: Page) => page.evaluate(() => new Promise<number>((ok, no) => {
  void indexedDB.databases().then((l) => {
    const name = l.map((d) => d.name ?? '').find((n) => /photo/i.test(n))!;
    const r = indexedDB.open(name);
    r.onerror = () => no(r.error);
    r.onsuccess = () => { const c = r.result.transaction('photos').objectStore('photos').count(); c.onsuccess = () => { ok(c.result); r.result.close(); }; };
  });
}));

test('both panes are open from the start; photo or form type may come first; nothing can be typed before the photo', async ({ page }) => {
  await signIn(page);
  await go(page, '/patients/pt-09/capture');
  const left = page.getByRole('region', { name: 'Paper photo' }), right = page.getByRole('region', { name: 'Type and check' });
  await expect(left).toBeVisible();
  await expect(right).toContainText('What kind of paper form is it?');
  const [a, b] = [(await left.boundingBox())!, (await right.boundingBox())!];
  expect(Math.abs(a.y - b.y)).toBeLessThan(2);
  expect(b.x).toBeGreaterThan(a.x + a.width - 1);

  await takePhoto(page); // photo first
  await expect(left).toContainText('Photo saved on this laptop');
  await expect(left).toContainText('Photo looks clear');
  await expect(left).toContainText(/Fingerprint [0-9a-f]{8}/);
  await expect(left.getByText('Unchanged since saved')).toBeVisible();
  await expect(right.locator('input')).toHaveCount(0);
  await right.getByRole('button', { name: 'Vitals sheet' }).click();
  await expect(page.getByLabel('Pulse')).toBeVisible();

  await page.reload();
  await unlockIfNeeded(page);
  await signIn(page);
  await go(page, '/patients/pt-09/capture');
  await right.getByRole('button', { name: 'Fluids sheet' }).click(); // type first
  await expect(right).toContainText('Take the photo first.');
  await expect(right.locator('input')).toHaveCount(0);
});

test('zoom and rotate change the view only: the stored photo keeps its fingerprint', async ({ page }) => {
  await signIn(page);
  await go(page, '/patients/pt-09/capture');
  await takePhoto(page);
  const pane = page.getByRole('region', { name: 'Paper photo' }), img = pane.getByAltText('Photo of the paper form'), box = page.getByTestId('photo-box');
  const before = (await img.boundingBox())!, print = await pane.getByText(/Fingerprint/).innerText();
  expect(before.height).toBeGreaterThan(before.width);
  await expect(pane.getByRole('button', { name: 'Zoom out' })).toBeDisabled();
  await pane.getByRole('button', { name: 'Zoom in' }).click();
  await expect(pane.getByRole('status').filter({ hasText: '150%' })).toBeVisible();
  expect((await img.boundingBox())!.width).toBeCloseTo(before.width * 1.5, -1);
  expect(await box.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true); // can be scrolled to every corner
  await box.focus();
  await page.keyboard.press('End');
  await expect.poll(() => box.evaluate((e) => e.scrollTop)).toBeGreaterThan(0);
  for (let i = 0; i < 2; i++) await pane.getByRole('button', { name: 'Zoom in' }).click();
  await expect(pane.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
  for (let i = 0; i < 3; i++) await pane.getByRole('button', { name: 'Zoom out' }).click();
  await pane.getByRole('button', { name: 'Rotate 90°' }).click();
  const turned = (await img.boundingBox())!, frame = (await box.boundingBox())!;
  expect(turned.width).toBeGreaterThan(turned.height);
  expect(turned.x).toBeGreaterThanOrEqual(frame.x - 1);
  expect(turned.x + turned.width).toBeLessThanOrEqual(frame.x + frame.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await pane.getByText(/Fingerprint/).innerText()).toBe(print);
  await expect(pane.getByText('Unchanged since saved')).toBeVisible();
});

test('a stored draft opens on its values: pencil, proposal notes, both ticks, then confirm', async ({ page }) => {
  await signIn(page);
  await go(page, '/capture/e-048/confirm');
  const right = page.getByRole('region', { name: 'Type and check' }), confirm = page.getByRole('button', { name: 'Confirm' });
  await expect(right).toContainText('146 / 88 mmHg');
  await expect(right.getByText('Same as the proposal')).toHaveCount(7);
  await expect(right).not.toContainText(/%\s*match|confidence|critical|tachy|fever|normotensive/i);
  await expect(page.getByText(/simulated, not a model answer/)).toBeVisible();
  await expect(confirm).toBeDisabled();
  await page.getByLabel(TICK).check();
  await expect(confirm).toBeDisabled(); // the unusual-value tick is still needed
  await page.getByLabel('I re-checked these values and they are right').check();
  await expect(confirm).toBeEnabled();

  await right.getByRole('button', { name: 'Edit Pulse' }).click();
  await expect(page.getByLabel('Pulse', { exact: true })).toBeFocused();
  await page.getByLabel('Pulse', { exact: true }).fill('82');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(right).toContainText('Proposal said 84');
  await expect(page.getByLabel(TICK)).not.toBeChecked(); // a changed value must be checked again
  await expect(confirm).toBeDisabled();
  await right.getByRole('button', { name: 'Edit Awake?' }).click();
  await expect(right.getByRole('button', { name: 'Alert', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Review' }).click();
  await right.getByRole('button', { name: 'Edit time' }).click();
  await expect(page.getByLabel('When measured')).toBeFocused();
  await page.getByRole('button', { name: 'Review' }).click();

  await page.getByLabel(TICK).check();
  await page.getByLabel('I re-checked these values and they are right').check();
  await confirm.click();
  await expect(page).toHaveURL(/\/entries\/e-048$/);
  await expect(page.getByText('Confirmed').first()).toBeVisible();
  await expect(page.getByRole('main')).toContainText('82');
});

test('a draft can be left as a draft, and stays in Alerts', async ({ page }) => {
  await signIn(page);
  await go(page, '/capture/e-048/confirm');
  await page.getByRole('link', { name: 'Keep as a draft (stays in Alerts)' }).click();
  await expect(page).toHaveURL(/\/entries\/e-048$/);
  await expect(page.getByText('Check this').first()).toBeVisible();
  await page.getByRole('complementary').getByRole('link', { name: /Alerts/ }).click();
  await expect(page.getByRole('link', { name: /Draft vital sign/ })).toBeVisible();
});

test('fluids, notes and medicines from paper ask for the same tick; a high-alert drug still needs the second nurse', async ({ page }) => {
  await signIn(page);
  await go(page, '/patients/pt-08/capture');
  await page.getByRole('button', { name: 'Fluids sheet' }).click();
  await takePhoto(page);
  await page.getByRole('button', { name: /^Out/ }).click();
  await page.getByRole('button', { name: 'Urine' }).click();
  await page.getByLabel('Amount (mL)').fill('250');
  await page.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled();
  await page.getByLabel(TICK).check();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/entries\//);

  await go(page, '/capture/e-049/confirm');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByLabel(TICK).check();
  const warn = page.getByLabel('I checked this and it is right');
  if (await warn.count()) await warn.check();
  await expect(page.getByRole('button', { name: 'Confirm' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Second nurse check' })).toBeVisible();
});

test('a retake keeps the first photo; changing the form type asks first and keeps the photo', async ({ page }) => {
  await signIn(page);
  await go(page, '/patients/pt-09/capture');
  await page.getByRole('button', { name: 'Vitals sheet' }).click();
  await page.getByRole('button', { name: 'Change form type' }).click(); // before the photo: no question
  await page.getByRole('button', { name: 'Vitals sheet' }).click();
  await takePhoto(page);
  await expect(page.getByText('Photo saved on this laptop')).toBeVisible();
  expect(await photoCount(page)).toBe(1);
  await page.getByLabel('Pulse').fill('88');
  await takePhoto(page, 'retake-input');
  await expect.poll(() => photoCount(page)).toBe(2);
  await expect(page.getByLabel('Pulse')).toHaveValue('88'); // typed values stay
  await page.getByRole('button', { name: 'Change form type' }).click();
  await page.getByRole('button', { name: 'Go back' }).click();
  await expect(page.getByLabel('Pulse')).toHaveValue('88');
  await page.getByRole('button', { name: 'Change form type' }).click();
  await page.getByRole('button', { name: 'Change type', exact: true }).click();
  await page.getByRole('button', { name: 'Nursing note' }).click();
  await expect(page.getByLabel('Note', { exact: true })).toBeVisible();
  await expect(page.getByAltText('Photo of the paper form')).toBeVisible();
});

test('an admin cannot add a paper record or confirm one', async ({ page }) => {
  await signIn(page, /Kim Ellis/);
  await page.evaluate(() => { history.pushState({}, '', '/patients/pt-08/capture'); dispatchEvent(new PopStateEvent('popstate')); });
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(page.getByText('Only nurses can add records.')).toBeVisible();
  await page.evaluate(() => { history.pushState({}, '', '/capture/e-048/confirm'); dispatchEvent(new PopStateEvent('popstate')); });
  await expect(page.getByText('Only nurses can confirm records.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Confirm' })).toHaveCount(0);
});

for (const width of [1440, 1024, 768, 390, 360]) {
  test(`${width}px: capture and confirm fit, values and buttons are not cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await signIn(page);
    for (const path of ['/patients/pt-09/capture', '/capture/e-048/confirm', '/capture/e-049/confirm']) {
      await go(page, path);
      if (path.endsWith('/capture')) { await takePhoto(page); await expect(page.getByText('Photo saved on this laptop')).toBeVisible(); await page.getByRole('button', { name: 'Medicine sheet' }).click(); }
      await page.waitForTimeout(200);
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const out = Array.from(document.querySelectorAll('main button, main a, main dd, main label, main select')).filter((e) => { const b = e.getBoundingClientRect(); return b.width > 1 && (b.right > W + 1 || b.left < -1); }).map((e) => e.textContent?.slice(0, 30));
        const cut = Array.from(document.querySelectorAll('main dd, main button')).filter((e) => (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1 && getComputedStyle(e).display !== 'inline').map((e) => e.textContent?.slice(0, 30));
        return { scroll: document.documentElement.scrollWidth > W, out, cut };
      });
      expect(r, `${path} at ${width}`).toEqual({ scroll: false, out: [], cut: [] });
    }
  });
}
