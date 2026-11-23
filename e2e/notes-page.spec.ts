import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';
import { pdfPageTexts } from './pdfText';

/** Notes as cards with a writing panel (Stitch "Nursing notes"). Fictional Practice data only. */
test.use({ serviceWorkers: 'block' });
const squash = (t: string) => t.replace(/\s+/g, '').toLowerCase();

async function open(page: Page, patient: string, who = /Daniel Okafor/) {
  await page.goto(`/patients/${patient}/notes`);
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(page.getByRole('heading', { name: 'Notes', exact: true })).toBeVisible();
}
const goTo = (page: Page, path: string) => page.evaluate((to) => { history.pushState({}, '', to); dispatchEvent(new PopStateEvent('popstate')); }, path);
const note = (page: Page, id: string) => page.getByTestId(`note-${id}`);

test('cards show the kind, the score as written and the whole text, with no judgement of the score', async ({ page }) => {
  await open(page, 'pt-05');
  const tabs = page.getByRole('group', { name: 'Note type' });
  await expect(tabs.getByRole('button')).toHaveText(['All notes (2)', 'Risk score (2)']);
  await expect(note(page, 'e-020')).toContainText('Morse Fall Scale');
  await expect(note(page, 'e-020')).toContainText('Score 65');
  await note(page, 'e-020').getByRole('button').first().click();
  for (const t of ['Morse Fall Scale (0-125, higher is worse)', 'High fall risk. Bed alarm on, call bell in reach.', 'The app does not work out or judge the score.', 'Daniel Okafor', '07:12, 14 Nov 2026']) await expect(note(page, 'e-020')).toContainText(t);
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(note(page, 'e-019')).toContainText('Turning every 2 hours continued.');
  await page.getByRole('button', { name: 'Collapse all' }).click();
  await expect(note(page, 'e-019').getByRole('link')).toHaveCount(0);
  await expect(page.getByRole('main')).not.toContainText(/moderate risk|≥ 45|hx falls|countersign|cosign|dry wt|verbal order|due at|next:/i);
});

test('the side panels show the patient list and paper photos of this patient only, and run no timer', async ({ page }) => {
  await open(page, 'pt-05');
  const orders = page.getByRole('region', { name: 'Nursing and lab orders' });
  await expect(orders).toContainText('aPTT (blood clotting time) every 6 hours while on heparin');
  await expect(orders).toContainText('Times on the order: 06:00, 12:00, 18:00, 00:00');
  await expect(orders).toContainText('ClinBridge runs no timers.');
  await expect(page.getByRole('main')).toContainText('heparin infusion, 25,000 units in 250 mL');
  const photos = page.getByRole('region', { name: 'Paper photos' });
  await expect(photos.getByRole('link')).toHaveCount(2);
  await photos.getByRole('link').first().click();
  await expect(page).toHaveURL(/\/entries\/e-0(04|46)$/);
  await goTo(page, '/patients/pt-02/notes');
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(page.getByText('No notes yet')).toBeVisible();
  await expect(page.getByRole('main')).not.toContainText(/heparin/i);
});

test('write beside the list: review first, saved once, and the box is empty again', async ({ page }) => {
  await open(page, 'pt-09');
  const panel = page.getByRole('region', { name: 'Write a note' });
  await panel.getByRole('button', { name: 'Review' }).click();
  await expect(panel.getByText('Write the note')).toBeVisible(); // nothing can be saved empty
  await panel.getByRole('button', { name: 'Care given' }).click();
  await panel.getByLabel('Note').fill('Sat up in the chair for breakfast.');
  await panel.getByRole('button', { name: 'Clear' }).click();
  await expect(panel.getByLabel('Note')).toHaveValue('');
  await panel.getByRole('button', { name: 'Care given' }).click();
  await panel.getByLabel('Note').fill('Sat up in the chair for breakfast.');
  await panel.getByRole('button', { name: 'Review' }).click();
  await expect(page.getByRole('list', { name: 'Notes' }).getByRole('listitem')).toHaveCount(1); // not saved before Save
  await panel.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText('Saved on this laptop.')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Notes' }).getByRole('listitem')).toHaveCount(2);
  await expect(page.getByRole('group', { name: 'Note type' })).toContainText('Care given (1)');
  await expect(panel.getByLabel('Note')).toHaveValue('');
});

test('words typed for one patient never reach another patient', async ({ page }) => {
  await open(page, 'pt-09');
  await page.getByRole('region', { name: 'Write a note' }).getByLabel('Note').fill('Only for Peter.');
  await goTo(page, '/patients/pt-05/notes');
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(page.getByRole('region', { name: 'Patient', exact: true })).toContainText('Tom Hale');
  await expect(page.getByRole('region', { name: 'Write a note' }).getByLabel('Note')).toHaveValue('');
});

test('a fixed note: the old version stays out until asked for, crossed out', async ({ page }) => {
  await open(page, 'pt-09');
  await note(page, 'e-006').getByRole('button').first().click();
  await note(page, 'e-006').getByRole('link', { name: 'Fix' }).click();
  await page.getByLabel('Note').fill('Oxygen level 90% on 2 L/min. Dr. Castellano told at 04:24.');
  await page.getByLabel('Why are you fixing this?').fill('shorter');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save fix' }).click();
  await expect(page).toHaveURL(/\/entries\/(?!e-006)[^/]+$/);
  await goTo(page, '/patients/pt-09/notes');
  await expect(page.getByRole('list', { name: 'Notes' }).getByRole('listitem')).toHaveCount(1);
  await page.getByRole('checkbox', { name: /Show old versions and mistakes \(1\)/ }).check();
  await expect(page.getByRole('list', { name: 'Notes' }).getByRole('listitem')).toHaveCount(2);
  await expect(note(page, 'e-006')).toContainText('Old version');
});

test('an admin reads notes but has no writing panel, Fix or New note', async ({ page }) => {
  await open(page, 'pt-05', /Kim Ellis/);
  await page.getByRole('button', { name: 'Expand all' }).click();
  await expect(note(page, 'e-019')).toContainText('Skin check done.');
  await expect(page.getByRole('region', { name: 'Write a note' })).toHaveCount(0);
  for (const n of ['Fix', 'New note', 'Photo of paper']) await expect(page.getByRole('main').getByRole('link', { name: n, exact: true })).toHaveCount(0);
});

test('paper holds every word of every note, also when the cards are closed', async ({ page }) => {
  await open(page, 'pt-03');
  await expect(note(page, 'e-027')).toBeVisible(); // printed only after the notes are there
  const paper = (await pdfPageTexts(await page.pdf({ format: 'A4' }))).map(squash).join('');
  for (const t of ['Critical potassium 6.2 mmol/L phoned from the lab at 08:20. Dr. Whitaker reached at 08:55 (35 minutes later, was in a procedure). Read-back done. Heart tracing ordered.', 'Written by', 'MRN DK-004527']) expect(paper).toContain(squash(t));
  for (const t of ['Write a note', 'New note', 'Expand all', 'Open details', 'ClinBridge runs no timers']) expect(paper).not.toContain(squash(t));
});

for (const width of [1440, 1024, 768, 390, 360]) {
  test(`${width}px: notes fit, open and closed; nothing is cut off`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await open(page, 'pt-05');
    for (const name of ['Collapse all', 'Expand all']) {
      await page.getByRole('button', { name }).click();
      const r = await page.evaluate(() => {
        const W = document.documentElement.clientWidth;
        const seen = Array.from(document.querySelectorAll('main button, main a, main dd, main li, main textarea, main input, main label')).filter((e) => e.getBoundingClientRect().width > 1 && !e.closest('[aria-label="Patient pages"]'));
        const out = seen.filter((e) => { const b = e.getBoundingClientRect(); return b.right > W + 1 || b.left < -1; }).map((e) => e.textContent?.slice(0, 30));
        const cut = seen.filter((e) => e.tagName !== 'INPUT' && (e as HTMLElement).scrollWidth > (e as HTMLElement).clientWidth + 1 && getComputedStyle(e).display !== 'inline').map((e) => e.textContent?.slice(0, 30));
        return { scroll: document.documentElement.scrollWidth > W, out, cut };
      });
      expect(r, `${name} at ${width}`).toEqual({ scroll: false, out: [], cut: [] });
    }
  });
}
