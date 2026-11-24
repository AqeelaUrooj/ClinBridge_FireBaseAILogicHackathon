import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { expectFits } from './adminHelpers';
import { unlockIfNeeded } from './helpers';
import { pdfPageTexts } from './pdfText';

/** Synthetic handwritten reports (/patients/:id/report). Fictional Practice data only. */
const LABEL = 'PRACTICE — SYNTHETIC REPORT — NOT A MEDICAL RECORD';
const NAMES: Record<string, [string, string]> = { 'pt-01': ['Sam Rivera', 'DK-004512'], 'pt-02': ['Lena Ortiz', 'DK-004518'], 'pt-10': ['Aisha Rahman', 'DK-004570'] };
const sheet = (page: Page) => page.locator('svg[data-look="photo"]');
const go = (page: Page, path: string) => page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path);
const field = async (page: Page, tag: string) => (await sheet(page).locator(`[data-field="${tag}"]`).textContent())!.replace(/\s+/g, ' ').trim();
const bare = (s: string) => s.replace(/\s/g, '');

async function signIn(page: Page, who = /Daniel Okafor/) {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page).not.toHaveURL(/sign-in/);
}
async function open(page: Page, id: string, design?: string) {
  await go(page, `/patients/${id}/report${design ? `?sheet=${design}` : ''}`);
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(sheet(page)).toBeVisible();
}

test('the patient check comes first; the report is reached from the summary and the history', async ({ page }) => {
  await page.goto('/patients/pt-01/report');
  await unlockIfNeeded(page);
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.locator('svg[data-report]')).toHaveCount(0);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Is this the right patient?' })).toBeVisible();
  await expect(page.locator('svg[data-report]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await expect(sheet(page)).toBeVisible();
  await page.getByRole('link', { name: 'Back to patient' }).click();
  await page.getByRole('link', { name: /View handwritten report/ }).click();
  await expect(sheet(page)).toBeVisible();
  await go(page, '/patients/pt-01/timeline');
  await page.getByRole('link', { name: /Handwritten report \(synthetic\)/ }).click();
  await expect(sheet(page)).toBeVisible();
});

test('two patients, all designs: each sheet shows its own patient, also after switching', async ({ page }) => {
  await signIn(page);
  for (const id of ['pt-01', 'pt-02', 'pt-10', 'pt-01']) {
    await open(page, id, 'assessment');
    const [name, mrn] = NAMES[id]!;
    const boxes = new Set<string>();
    for (const design of ['Assessment sheet', 'Shift report', 'Bedside worksheet', 'Pocket notes']) {
      await page.getByRole('button', { name: design }).click();
      await expect(page.getByRole('heading', { name: `Handwritten report · ${design}` })).toBeVisible();
      expect(await field(page, 'name')).toContain(name);
      expect(bare((await sheet(page).textContent())!)).toContain(mrn);
      await expect(sheet(page).getByTestId('synthetic-label')).toHaveText(LABEL);
      for (const [other, [n, m]] of Object.entries(NAMES)) if (other !== id) { expect(bare((await sheet(page).textContent())!)).not.toContain(bare(n)); expect(bare((await sheet(page).textContent())!)).not.toContain(m); }
      boxes.add((await sheet(page).getAttribute('viewBox'))!);
    }
    expect(boxes.size).toBe(4);
    await go(page, '/ward');
  }
});

test('what the sheet shows comes from the records at that moment', async ({ page }) => {
  await signIn(page);
  await open(page, 'pt-02', 'pocket');
  expect(bare((await sheet(page).textContent())!)).toContain('128/80');
  await go(page, '/patients/pt-02/vitals/record');
  await page.getByLabel('Top blood pressure').fill('131');
  await page.getByLabel('Bottom blood pressure').fill('81');
  await page.getByLabel('Pulse').fill('77');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved on this laptop.')).toBeVisible();
  await go(page, '/patients/pt-02/report?sheet=pocket');
  await expect(sheet(page)).toBeVisible();
  expect(bare((await sheet(page).textContent())!)).toContain('131/81');
});

test('zoom, rotate, PNG: the file is this patient’s sheet with the label, and nothing is saved in the records', async ({ page }, info) => {
  await signIn(page);
  const sent: string[] = [];
  page.on('request', (r) => { if (!r.url().startsWith('http://localhost:4173') && !/^(data|blob):/.test(r.url())) sent.push(r.url()); });
  const stored = () => page.evaluate(async () => {
    const out: Record<string, number> = {};
    for (const { name } of await indexedDB.databases()) {
      const db = await new Promise<IDBDatabase>((ok, no) => { const q = indexedDB.open(name!); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
      for (const s of Array.from(db.objectStoreNames)) out[`${name}/${s}`] = await new Promise<number>((ok) => { const q = db.transaction(s).objectStore(s).count(); q.onsuccess = () => ok(q.result); });
      db.close();
    }
    return out;
  });
  await open(page, 'pt-02', 'assessment');
  const before = await stored();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await expect(page.getByRole('group', { name: 'Report tools' }).getByRole('status')).toHaveText('150%');
  const wide = await sheet(page).evaluate((e) => e.getBoundingClientRect().width);
  await page.getByRole('button', { name: 'Zoom out' }).click();
  expect(wide / await sheet(page).evaluate((e) => e.getBoundingClientRect().width)).toBeCloseTo(1.5, 1);
  await page.getByRole('button', { name: 'Rotate 90°' }).click();
  expect(await sheet(page).evaluate((e) => { const b = e.getBoundingClientRect(); return b.width > b.height; })).toBe(true);
  // The picture of two patients in a row: each has its own file name, title and pixels.
  const save = async () => {
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Practice image' }).click()]);
    const path = info.outputPath('screens', d.suggestedFilename());
    await d.saveAs(path);
    return { name: d.suggestedFilename(), bytes: readFileSync(path) };
  };
  const a = await save();
  expect(a.name).toBe('PRACTICE-synthetic-assessment-DK-004518.png');
  expect(a.bytes.subarray(1, 4).toString()).toBe('PNG');
  expect(a.bytes.readUInt32BE(16)).toBe(1600);
  expect(a.bytes.length).toBeGreaterThan(200_000);
  await expect(page.getByText(/Picture of Lena Ortiz.s synthetic report saved/)).toBeVisible();
  // Not blank and the red label is in the pixels.
  const look = await page.evaluate(async (b64) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d')!;
    g.drawImage(img, 0, 0);
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let red = 0, blue = 0;
    for (let i = 0; i < px.length; i += 4) { const r = px[i]!, gr = px[i + 1]!, b = px[i + 2]!; if (r > 130 && gr < 90 && b < 90) red++; if (b > 100 && r < 90 && gr < 100) blue++; }
    return { red, blue };
  }, a.bytes.toString('base64'));
  expect(look.red).toBeGreaterThan(1500);
  expect(look.blue).toBeGreaterThan(5000);
  await go(page, '/ward');
  await open(page, 'pt-01', 'assessment');
  const b = await save();
  expect(b.name).toBe('PRACTICE-synthetic-assessment-DK-004512.png');
  expect(b.bytes.equals(a.bytes)).toBe(false);
  expect(await stored()).toEqual(before);
  expect(sent).toEqual([]);
});

for (const format of ['A4', 'Letter'] as const) {
  test(`print on ${format}: one page per sheet with the right patient and the label, for every design`, async ({ page }) => {
    await signIn(page);
    await open(page, 'pt-02', 'assessment');
    for (const design of ['Assessment sheet', 'Shift report', 'Bedside worksheet', 'Pocket notes']) {
      await page.getByRole('button', { name: design }).click();
      await expect(page.locator('svg[data-look="print"]')).toHaveCount(1);
      const pages = await pdfPageTexts(await page.pdf({ format, preferCSSPageSize: false }));
      expect(pages.length, design).toBe(1);
      const text = bare(pages[0]!);
      expect(text, design).toContain('LenaOrtiz');
      expect(text, design).toContain('DK-004518');
      expect(text, design).toContain(bare(LABEL));
      expect(text, design).not.toContain('DowntimeManagement'); // only the sheet is printed
      // Nothing on the sheet lies outside its own page area.
      await page.emulateMedia({ media: 'print' });
      const out = await page.locator('svg[data-look="print"]').evaluate((svg) => {
        const s = svg.getBoundingClientRect();
        return Array.from(svg.querySelectorAll('text')).filter((t) => { const b = t.getBoundingClientRect(); return b.width > 0 && (b.right > s.right + 1 || b.left < s.left - 1 || b.bottom > s.bottom + 1 || b.top < s.top - 1); }).map((t) => t.textContent);
      });
      expect(out, design).toEqual([]);
      await page.emulateMedia({ media: null });
    }
  });
}

test('printing only on click', async ({ page }) => {
  await page.addInitScript(() => { (window as unknown as { n: number }).n = 0; window.print = () => { (window as unknown as { n: number }).n++; }; });
  await signIn(page);
  await open(page, 'pt-04');
  await expect(page.getByRole('heading', { name: 'Handwritten report · Pocket notes' })).toBeVisible(); // pt-04 opens its own first design
  expect(await page.evaluate(() => (window as unknown as { n: number }).n)).toBe(0);
  await page.getByRole('button', { name: 'Print Practice report' }).click();
  expect(await page.evaluate(() => (window as unknown as { n: number }).n)).toBe(1);
});

test('offline: the report, its handwriting and the PNG work with no network', async ({ page, context }) => {
  await signIn(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  await open(page, 'pt-10');
  expect(await field(page, 'name')).toContain('Aisha Rahman');
  expect(await page.evaluate(() => Array.from(document.fonts as unknown as Iterable<FontFace>).filter((f) => f.family.includes('CB ')).map((f) => f.status))).toEqual(Array(7).fill('loaded'));
  for (const design of ['Assessment sheet', 'Shift report', 'Bedside worksheet']) await page.getByRole('button', { name: design }).click();
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Practice image' }).click()]);
  expect(d.suggestedFilename()).toBe('PRACTICE-synthetic-worksheet-DK-004570.png');
  // Straight from the address, still offline.
  await page.goto('/patients/pt-10/report');
  await unlockIfNeeded(page);
  await expect(page).toHaveURL(/\/sign-in$/);
});

test('Real records: no synthetic report, no link to one', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dtk.dataset', 'live'));
  await page.goto('/patients/pt-01/report');
  await expect(page.getByText(/Opening ClinBridge|First-time setup|Who are you/).first()).toBeVisible();
  await expect(page).not.toHaveURL(/report/);
  await expect(page.locator('svg[data-report]')).toHaveCount(0);
});

test('a synthetic report is never a paper photo: the capture page and a record with a missing photo stay as they are', async ({ page }) => {
  await signIn(page);
  await open(page, 'pt-01');
  await expect(page.getByText(/It is not a photo of paper/)).toBeVisible();
  await go(page, '/entries/e-024');
  await expect(page.getByText(/Photo file is not on this laptop \(vault\/raw\/e-024\.jpg\)/)).toBeAttached();
  await expect(page.locator('svg[data-report]')).toHaveCount(0);
  await go(page, '/patients/pt-01/capture');
  await expect(page.getByRole('heading', { name: 'Photo of paper' })).toBeVisible();
  await expect(page.locator('svg[data-report]')).toHaveCount(0);
  await expect(page.getByText(/synthetic/i)).toHaveCount(0);
});

for (const width of [1440, 1280, 1024, 768, 390, 360]) {
  test(`${width}px: the report page fits`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    await open(page, 'pt-05', 'assessment');
    await expectFits(page, width);
    const s = await sheet(page).boundingBox(), b = await page.getByTestId('report-box').boundingBox();
    expect(s!.x).toBeGreaterThanOrEqual(b!.x - 1);
    expect(s!.x + s!.width).toBeLessThanOrEqual(b!.x + b!.width + 1);
    await page.screenshot({ path: info.outputPath('screens', `handwritten-${width}.png`), fullPage: true });
  });
}
