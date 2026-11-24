import { test, expect, type Page, type Route } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expectFits, openAdmin } from './adminHelpers';

/**
 * Device vs Cloud drill (Stitch "Device vs cloud comparison") with the four handwritten Practice reports. Fictional data
 * only. Every answer in these tests is a MOCK: the Chrome Prompt API is replaced in the page and the cloud is a local
 * stand-in. No real model runs and nothing reaches Google. They prove wiring, not how well a model reads.
 */
test.use({ serviceWorkers: 'block', baseURL: 'http://localhost:4174' }); // the build with FAKE Firebase values, as in ai.spec.ts
test.setTimeout(120_000);
const DRAWN = { timeout: 20_000 }; // a report picture takes about three seconds to draw, more on a busy machine

const LABEL = 'PRACTICE — SYNTHETIC REPORT — NOT A MEDICAL RECORD';
const DESIGNS = [['assessment', 'Assessment sheet'], ['shift', 'Shift report'], ['worksheet', 'Bedside worksheet'], ['pocket', 'Pocket notes']] as const;
// Sam Rivera 08:00 holds 134/80, 74, 16, 97, 36.8, 0, Alert. The mock changes breathing, leaves out pain and adds blood sugar.
const MOCK = '{"bp_systolic":134,"bp_diastolic":80,"heart_rate":74,"resp_rate":61,"temp_c":36.8,"spo2":97,"glucose_mgdl":110,"consciousness":"Alert"}';
// Tom Hale 12:00 holds 114/66, 72, 18, 95, 36.6, O2 2 L/min, pain 2, Alert.
const TOM = '{"bp_systolic":114,"bp_diastolic":66,"heart_rate":72,"resp_rate":18,"temp_c":36.6,"spo2":95,"pain_0_10":2,"o2_flow_lpm":2,"consciousness":"Alert"}';

type Seen = { text: string; sha: string };
/** MOCK of the on-device model. Notes the text and the picture bytes that the SDK gave it. `hold` answers only after release(). */
async function mockDevice(page: Page, answer = MOCK, o: { availability?: string; hold?: boolean } = {}) {
  await page.addInitScript(({ answer, o }) => {
    const w = window as unknown as { LanguageModel: unknown; seen: { text: string; sha: string }[]; release: () => void };
    w.seen = [];
    let sha = '';
    const real = window.fetch;
    window.fetch = async (input, init) => { // the SDK decodes the picture with fetch('data:image/…')
      const r = await real(input, init);
      if (typeof input === 'string' && input.startsWith('data:image/')) sha = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await r.clone().arrayBuffer())), (b) => b.toString(16).padStart(2, '0')).join('');
      return r;
    };
    const wait = new Promise<void>((ok) => { w.release = ok; });
    w.LanguageModel = {
      availability: async () => o.availability ?? 'available',
      create: async () => ({
        prompt: async (messages: { content: { type: string; value: unknown }[] }[]) => {
          w.seen.push({ text: messages.flatMap((m) => m.content).filter((c) => c.type === 'text').map((c) => String(c.value)).join('\n'), sha });
          if (o.hold) await wait;
          return answer;
        },
        promptStreaming: () => new ReadableStream(), destroy: () => {},
      }),
    };
  }, { answer, o });
}
/** Local stand-in for App Check and the cloud model. Notes what would have been sent. */
async function mockCloud(page: Page, answer = TOM): Promise<Seen[]> {
  const seen: Seen[] = [];
  const ctx = page.context();
  await ctx.route('https://www.google.com/recaptcha/**', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.grecaptcha={enterprise:{ready:function(cb){cb()},render:function(){return "w1"},execute:function(){return Promise.resolve("fake-recaptcha")}}};' }));
  await ctx.route('https://content-firebaseappcheck.googleapis.com/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: 'fake-app-check-token', ttl: '3600s' }) }));
  await ctx.route(/generateContent/, async (r: Route) => {
    if (r.request().method() !== 'POST') return r.fulfill({ status: 204 });
    const parts = (r.request().postDataJSON() as { contents: { parts: { text?: string; inlineData?: { data: string } }[] }[] }).contents.flatMap((c) => c.parts);
    const img = parts.find((p) => p.inlineData)?.inlineData;
    seen.push({ text: parts.map((p) => p.text ?? '').join(''), sha: img ? createHash('sha256').update(Buffer.from(img.data, 'base64')).digest('hex') : '' });
    await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: answer }] }, finishReason: 'STOP', index: 0 }] }) });
  });
  return seen;
}
function outside(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (r) => { if (!/^(https?:\/\/localhost|data:|blob:)/.test(r.url())) urls.push(r.url()); });
  return urls;
}
/** Number of rows in every store of every database: nothing may be added. (The Firebase SDK keeps a usage counter of its own.) */
const stored = (page: Page) => page.evaluate(async () => {
  const out: Record<string, number> = {};
  for (const { name } of (await indexedDB.databases()).filter((d) => !d.name!.startsWith('firebase-'))) {
    const db = await new Promise<IDBDatabase>((ok, no) => { const q = indexedDB.open(name!); q.onsuccess = () => ok(q.result); q.onerror = () => no(q.error); });
    for (const s of Array.from(db.objectStoreNames)) out[`${name}/${s}`] = await new Promise<number>((ok) => { const q = db.transaction(s).objectStore(s).count(); q.onsuccess = () => ok(q.result); });
    db.close();
  }
  return out;
});

const go = (page: Page, path: string) => page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path);
const open = async (page: Page, who?: RegExp) => { await openAdmin(page, '/drill/compare', who); await expect(page.getByRole('heading', { name: 'One input, two models' })).toBeVisible(); };
const row = (page: Page, name: string) => page.getByRole('region', { name: 'Field by field' }).getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) });
const choose = (page: Page, id: string) => page.getByLabel('Fictional patient').selectOption(id);
const design = (page: Page, name: string) => page.getByRole('radiogroup', { name: 'Report design' }).getByRole('radio', { name: new RegExp(name) });
const text = (page: Page) => page.getByRole('radio', { name: 'Synthetic note (text)' }).click();
const device = (page: Page) => page.getByRole('region', { name: 'On-device model' });
const cloud = (page: Page) => page.getByRole('region', { name: 'Cloud model' });
const picture = (page: Page, name: string, patient: string, mrn: string) => page.getByRole('img', { name: `Synthetic Practice report: ${name} for ${patient}, MRN ${mrn}. Not a medical record.` });
const pictureSha = (page: Page) => page.getByTestId('report-picture').evaluate(async (i: HTMLImageElement) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await (await fetch(i.src)).arrayBuffer())), (b) => b.toString(16).padStart(2, '0')).join(''));

test('opens with the four handwritten reports; nothing ran: no number, no match, no benchmark, nothing to save', async ({ page }) => {
  const external = outside(page);
  await open(page);
  for (const [, name] of DESIGNS) await expect(design(page, name)).toBeVisible();
  await expect(design(page, 'Assessment sheet')).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByRole('button', { name: 'Run on-device model' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Run cloud model' })).toBeDisabled();
  await choose(page, 'pt-01');
  await text(page);
  await expect(page.getByTestId('compare-input')).toContainText('BP 134 over 80');
  await page.getByLabel('Record for the note').selectOption({ label: 'Vital signs 04:00' });
  await expect(page.getByTestId('compare-input')).toContainText('BP 136 over 82');
  await expect(row(page, 'Pulse')).toContainText('76');
  await expect(row(page, 'Pulse')).toContainText('Not run');
  await expect(page.getByRole('button', { name: 'Save answers (JSON)' })).toBeDisabled();
  const main = page.getByRole('main');
  await expect(main.getByText('Same', { exact: true })).toHaveCount(0);
  await expect(main).not.toContainText(/gemma|\bnpu\b|throttle|confidence|legibility|grade|validated safe|4\.4x|\bping\b|air-gap|simulate network/i);
  await expect(main).not.toContainText(/\d+ ms\b|of 8 known values/);
  expect(external).toEqual([]); // opening and choosing starts nothing
});

test('all four reports of two patients: the chosen design, the chosen patient, the synthetic label; the old form is gone', async ({ page }) => {
  const external = outside(page);
  await open(page);
  const shas = new Set<string>(), urls: string[] = [];
  for (const [id, patient, mrn, other] of [['pt-05', 'Tom Hale', 'DK-004541', 'Grace Bell'], ['pt-04', 'Grace Bell', 'DK-004533', 'Tom Hale']] as const) {
    await choose(page, id);
    for (const [, name] of DESIGNS) {
      await design(page, name).click();
      await expect(design(page, name)).toHaveAttribute('aria-checked', 'true');
      await expect(picture(page, name, patient, mrn)).toBeVisible(DRAWN);
      const source = page.getByRole('region', { name: 'Source' });
      await expect(source).toContainText(`${patient} · ${mrn}`);
      await expect(source).toContainText(LABEL);
      await expect(source.getByText(name, { exact: true })).toBeVisible();
      await expect(source).not.toContainText(other);
      await expect(page.locator('img[data-testid="report-picture"]')).toHaveCount(1);
      // Not blank, big enough to read, and the red label is in the pixels of the picture itself.
      const look = await page.getByTestId('report-picture').evaluate(async (i: HTMLImageElement) => {
        await i.decode();
        const c = document.createElement('canvas');
        c.width = i.naturalWidth; c.height = i.naturalHeight;
        const g = c.getContext('2d')!;
        g.drawImage(i, 0, 0);
        const px = g.getImageData(0, 0, c.width, Math.round(c.height * 0.2)).data;
        let red = 0;
        for (let k = 0; k < px.length; k += 4) if (px[k]! > 130 && px[k + 1]! < 90 && px[k + 2]! < 90) red++;
        return { w: c.width, h: c.height, shown: i.getBoundingClientRect().height / i.getBoundingClientRect().width, red, url: i.src };
      });
      expect(look.w).toBe(1600);
      expect(look.shown).toBeCloseTo(look.h / look.w, 2); // neither stretched nor cut
      expect(look.red, `${patient} ${name}`).toBeGreaterThan(700);
      shas.add(await pictureSha(page));
      urls.push(look.url);
    }
  }
  expect(shas.size).toBe(8); // eight different pictures
  for (const u of urls.slice(0, -1)) expect(await page.evaluate((x) => fetch(x).then(() => 'still there', () => 'gone'), u)).toBe('gone'); // no old picture is kept
  await expect(page.getByRole('main')).not.toContainText(/paper form|DOWNTIME PAPER FORM/i);
  await expect(page.locator('svg[data-report]')).toHaveCount(0);
  expect(external).toEqual([]);
});

test('zoom: the whole page can be read and nothing is cut away', async ({ page }) => {
  await open(page);
  await choose(page, 'pt-05');
  const img = page.getByTestId('report-picture'), box = page.getByTestId('report-box');
  await expect(img).toBeVisible(DRAWN);
  const w = (await img.boundingBox())!.width;
  expect((await box.boundingBox())!.height).toBeGreaterThanOrEqual((await img.boundingBox())!.height - 2);
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Zoom in' }).click();
  expect((await img.boundingBox())!.width / w).toBeCloseTo(2, 1);
  expect(await box.evaluate((e) => e.scrollWidth > e.clientWidth && e.scrollHeight > e.clientHeight)).toBe(true);
});

for (const [id, name] of DESIGNS) {
  test(`${name}: the same drawing as on the patient's report page; both models (MOCK) get exactly the previewed file`, async ({ page }) => {
    await mockDevice(page, TOM);
    const cloudSeen = await mockCloud(page, TOM.replace('"resp_rate":18', '"resp_rate":13'));
    // The picture from the patient's page.
    await openAdmin(page, `/patients/pt-05/report?sheet=${id}`, /Daniel Okafor/);
    await page.getByRole('button', { name: 'Yes, open' }).click();
    await expect(page.locator('svg[data-look="photo"]')).toBeVisible();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Practice image' }).click()]);
    const png = readFileSync(await dl.path()).toString('base64');

    await go(page, '/drill/compare');
    await choose(page, 'pt-05');
    await design(page, name).click();
    await expect(picture(page, name, 'Tom Hale', 'DK-004541')).toBeVisible(DRAWN);
    const diff = await page.getByTestId('report-picture').evaluate(async (i: HTMLImageElement, b64) => {
      const a = new Image();
      a.src = `data:image/png;base64,${b64}`;
      await Promise.all([a.decode(), i.decode()]);
      const px = (x: HTMLImageElement) => { const c = document.createElement('canvas'); c.width = x.naturalWidth; c.height = x.naturalHeight; const g = c.getContext('2d')!; g.drawImage(x, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
      const p = px(a), q = px(i);
      let far = 0;
      for (let k = 0; k < p.length; k += 4) if (Math.abs(p[k]! - q[k]!) + Math.abs(p[k + 1]! - q[k + 1]!) + Math.abs(p[k + 2]! - q[k + 2]!) > 120) far++;
      return { size: [a.naturalWidth - i.naturalWidth, a.naturalHeight - i.naturalHeight], far: far / (p.length / 4) };
    }, png);
    expect(diff.size).toEqual([0, 0]);
    expect(diff.far, 'share of clearly different pixels').toBeLessThan(0.002); // JPEG against PNG; the clock in the last line may differ

    // The same file for both, with the same instructions, and only when pressed.
    const sha = await pictureSha(page);
    expect(await page.getByTestId('report-picture').getAttribute('data-sha256')).toBe(sha);
    await expect(page.getByText(`fingerprint ${sha.slice(0, 12)}`)).toBeVisible();
    expect(cloudSeen).toHaveLength(0);
    await page.getByRole('button', { name: 'Run on-device model' }).click();
    await expect(device(page).getByText(/On this laptop · ONLY_ON_DEVICE/)).toBeVisible();
    expect(cloudSeen).toHaveLength(0);
    await expect(cloud(page)).toContainText('Not run');
    await page.getByRole('button', { name: 'Run cloud model' }).click();
    await expect(cloud(page).getByText(/Cloud · ONLY_IN_CLOUD/)).toBeVisible();
    const deviceSeen = await page.evaluate(() => (window as unknown as { seen: { text: string; sha: string }[] }).seen);
    expect(deviceSeen).toHaveLength(1);
    expect(cloudSeen).toHaveLength(1);
    expect(deviceSeen[0]!.sha).toBe(sha);
    expect(cloudSeen[0]!.sha).toBe(sha);
    expect(deviceSeen[0]!.text).toBe(cloudSeen[0]!.text);
    expect(deviceSeen[0]!.text).toContain('written for 12:00 (it may be written 1200), the last set on the sheet');

    // Only what is written on this design for 12:00 counts. The assessment sheet has no pain score.
    const pain = id !== 'assessment', n = pain ? 9 : 8;
    await expect(device(page)).toContainText(`${n} of ${n} known values repeated exactly`);
    await expect(cloud(page)).toContainText(`${n - 1} of ${n} known values repeated exactly`);
    await expect(row(page, 'Breathing').getByRole('cell').nth(2)).toContainText('Different');
    await expect(row(page, 'Pain')).toContainText(pain ? 'Same' : 'Not in this set');
    await expect(page.getByTestId('compared-set')).toContainText(`Not written on this sheet for 12:00, so not compared: ${pain ? '' : 'Pain, '}Blood sugar.`);
    await expect(row(page, 'Blood sugar')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Differences' }).getByRole('row').filter({ hasText: 'Breathing' })).toContainText(/18.*13/);

    const [save] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save answers (JSON)' }).click()]);
    const j = JSON.parse(readFileSync(await save.path(), 'utf8'));
    expect(j).toMatchObject({ input: 'image', patient_id: 'pt-05', synthetic: LABEL, report: { design: id, sha256: sha, type: 'image/jpeg' }, on_device: { ran_at: 'on_device' }, cloud: { ran_at: 'in_cloud' } });
    expect('pain_0_10' in j.known_values).toBe(pain);
    expect(j.known_values).not.toHaveProperty('glucose_mgdl');
    expect(deviceSeen[0]!.text).toContain(j.instructions);
  });
}

test('another design or patient: the answer goes, a late answer is dropped, and the next picture still comes while a model runs (MOCK)', async ({ page }) => {
  await mockDevice(page, TOM, { hold: true });
  await open(page);
  await choose(page, 'pt-05');
  await expect(page.getByTestId('report-picture')).toBeVisible(DRAWN);
  await page.getByRole('button', { name: 'Run on-device model' }).click();
  await expect(device(page).getByRole('button', { name: 'Running…' })).toBeVisible();
  await design(page, 'Shift report').click(); // network is blocked while the on-device model runs; the picture needs none
  await expect(picture(page, 'Shift report', 'Tom Hale', 'DK-004541')).toBeVisible(DRAWN);
  await expect(device(page).getByRole('button', { name: 'Run on-device model' })).toBeEnabled();
  await page.evaluate(() => (window as unknown as { release: () => void }).release());
  await page.waitForTimeout(800);
  await expect(device(page).getByText(/ONLY_ON_DEVICE ·/)).toHaveCount(0); // the answer was for the assessment sheet
  await expect(device(page)).toContainText('Not run');

  const answer = async () => { await page.getByRole('button', { name: 'Run on-device model' }).click(); await expect(device(page).getByText(/ONLY_ON_DEVICE ·/)).toBeVisible(); };
  const cleared = async () => { await expect(device(page).getByText(/ONLY_ON_DEVICE ·/)).toHaveCount(0); await expect(page.getByRole('main').getByText('Same', { exact: true })).toHaveCount(0); await expect(page.getByRole('button', { name: 'Save answers (JSON)' })).toBeDisabled(); };
  await answer();
  await design(page, 'Pocket notes').click();
  await cleared();
  await answer();
  await design(page, 'Shift report').click(); // also when going back to one that was answered before
  await cleared();
  await answer();
  await choose(page, 'pt-04');
  await cleared();
  await expect(row(page, 'Pulse')).toContainText('90');
  await answer();
  await text(page);
  await cleared();
});

test('a picture that is ready late is never shown for the next patient', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    const w = window as unknown as { alts: string[] };
    w.alts = [];
    new MutationObserver(() => { const i = document.querySelector('[data-testid="report-picture"]'); const who = (document.querySelector('select[aria-label="Fictional patient"]') as HTMLSelectElement | null)?.selectedOptions[0]?.textContent?.split(' · ')[0]; if (i) w.alts.push(`${who}|${i.getAttribute('alt')}`); }).observe(document.body, { childList: true, subtree: true, attributes: true });
  });
  for (const id of ['pt-05', 'pt-04', 'pt-09']) { await choose(page, id); await page.waitForTimeout(350); }
  await expect(picture(page, 'Assessment sheet', 'Peter Novak', 'DK-004563')).toBeVisible(DRAWN);
  await page.waitForTimeout(3500);
  await expect(picture(page, 'Assessment sheet', 'Peter Novak', 'DK-004563')).toBeVisible(DRAWN);
  const alts = await page.evaluate(() => (window as unknown as { alts: string[] }).alts);
  expect(alts.length).toBeGreaterThan(0);
  for (const a of alts) { const [who, alt] = a.split('|'); expect(alt).toContain(`for ${who},`); }
});

test('a typed note is still compared field by field (MOCK model): same, different, not read, not in the input', async ({ page }) => {
  await mockDevice(page);
  const external = outside(page);
  await open(page);
  await choose(page, 'pt-01');
  await text(page);
  await page.getByRole('button', { name: 'Run on-device model' }).click();
  await expect(device(page).getByText(/On this laptop · ONLY_ON_DEVICE/)).toBeVisible();
  await expect(device(page)).toContainText('6 of 8 known values repeated exactly');
  await expect(row(page, 'Pulse')).toContainText('Same');
  await expect(row(page, 'Breathing')).toContainText('61');
  await expect(row(page, 'Breathing')).toContainText('Different');
  await expect(row(page, 'Pain')).toContainText('Not read');
  await expect(row(page, 'Blood sugar')).toContainText('Not in the input');
  await expect(cloud(page)).toContainText('Not run');
  await expect(page.getByRole('region', { name: 'Differences' })).toHaveCount(0);
  expect(external).toEqual([]);

  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save answers (JSON)' }).click();
  const j = JSON.parse(readFileSync(await (await dl).path(), 'utf8'));
  expect(j.cloud).toBe('not run');
  expect(j.on_device.ran_at).toBe('on_device');
  expect(j.note).toContain('Fictional input');
  expect(j).not.toHaveProperty('report');

  await page.getByLabel('Record for the note').selectOption({ label: 'Vital signs 04:00' }); // another input: the old answer must go
  await expect(device(page).getByText(/ONLY_ON_DEVICE ·/)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save answers (JSON)' })).toBeDisabled();
});

test('a drawn report never becomes a paper source: no draft, nothing stored; the typed note still makes a draft (MOCK)', async ({ page }) => {
  await mockDevice(page, TOM);
  await open(page, /Daniel Okafor/);
  const before = await stored(page);
  await choose(page, 'pt-05');
  for (const [, name] of DESIGNS) {
    await design(page, name).click();
    await expect(picture(page, name, 'Tom Hale', 'DK-004541')).toBeVisible(DRAWN);
    await page.getByRole('button', { name: 'Run on-device model' }).click();
    await expect(device(page).getByText(/ONLY_ON_DEVICE ·/)).toBeVisible();
    await expect(page.getByRole('button', { name: /draft/i })).toHaveCount(0);
    await expect(device(page)).toContainText('No draft from a drawn report');
  }
  expect(await stored(page)).toEqual(before); // no photo, no entry, no change-log row
  await text(page);
  await page.getByRole('button', { name: 'Run on-device model' }).click();
  await page.getByRole('button', { name: 'Review this one as a draft' }).click();
  await expect(page).toHaveURL(/\/capture\/.+\/confirm/);
  const after = await stored(page);
  expect(Object.keys(after).filter((k) => /photo/i.test(k) && after[k] !== before[k])).toEqual([]);
});

test('no on-device model: a clear message, no answer, no cloud instead', async ({ page }) => {
  await page.addInitScript(() => { delete (window as unknown as { LanguageModel?: unknown }).LanguageModel; }); // this browser may have the API
  const seen = await mockCloud(page), external = outside(page);
  await open(page);
  await choose(page, 'pt-05');
  await page.getByRole('button', { name: 'Run on-device model' }).click();
  await expect(device(page).getByRole('alert')).toContainText(/no on-device AI/);
  await expect(device(page)).toContainText('No answer');
  await expect(cloud(page)).toContainText('Not run');
  await expect(page.getByRole('main').getByText('Same', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save answers (JSON)' })).toBeDisabled();
  expect(seen).toEqual([]);
  expect(external).toEqual([]);
});

test('the model is there but cannot read pictures: said so, nothing ran (MOCK)', async ({ page }) => {
  await mockDevice(page, TOM, { availability: 'unavailable' });
  await open(page);
  await choose(page, 'pt-05');
  await page.getByRole('button', { name: 'Run on-device model' }).click();
  await expect(device(page).getByRole('alert')).toContainText('can\'t run with images on this laptop');
  expect(await page.evaluate(() => (window as unknown as { seen: unknown[] }).seen)).toEqual([]);
});

test('System down blocks the cloud side for every design; the on-device side works (MOCK) and nothing is sent', async ({ page }) => {
  await mockDevice(page, TOM);
  const seen = await mockCloud(page);
  await openAdmin(page, '/admin/downtime');
  await page.getByRole('button', { name: 'Start a practice outage' }).click();
  await expect(page.getByText('SYSTEM DOWN').first()).toBeVisible();
  const external = outside(page);
  await go(page, '/drill/compare');
  await choose(page, 'pt-05');
  for (const [, name] of DESIGNS) {
    await design(page, name).click();
    await expect(picture(page, name, 'Tom Hale', 'DK-004541')).toBeVisible(DRAWN);
    await expect(page.getByRole('button', { name: 'Run cloud model' })).toBeDisabled();
    await expect(cloud(page)).toContainText('Cloud blocked: System down');
  }
  await expect(page.getByRole('region', { name: 'Practice drill' })).toContainText('Blocked');
  await page.getByRole('button', { name: 'Run on-device model' }).click();
  await expect(device(page).getByText(/ONLY_ON_DEVICE ·/)).toBeVisible();
  await text(page);
  await expect(page.getByRole('button', { name: 'Run cloud model' })).toBeDisabled();
  expect(seen).toEqual([]);
  expect(external).toEqual([]);
});

test('a report without vital signs: shown, explained, and no model can run', async ({ page }) => {
  await mockDevice(page, TOM);
  await open(page);
  // Aisha Rahman has only the rows of the hospital list: take them away.
  await page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((ok) => { const q = indexedDB.open('downtimekit-practice'); q.onsuccess = () => ok(q.result); });
    const s = db.transaction('snapshot_result', 'readwrite').objectStore('snapshot_result');
    await new Promise<void>((ok) => { const q = s.openCursor(); q.onsuccess = () => { const c = q.result; if (!c) return ok(); if ((c.value as { patient_id: string }).patient_id === 'pt-10') c.delete(); c.continue(); }; });
    db.close();
  });
  await choose(page, 'pt-10');
  for (const [, name] of DESIGNS) {
    await design(page, name).click();
    await expect(picture(page, name, 'Aisha Rahman', 'DK-004570')).toBeVisible(DRAWN);
    await expect(page.getByTestId('compared-set')).toContainText('This report shows no vital signs for Aisha Rahman, so there is nothing to compare');
    await expect(page.getByRole('button', { name: 'Run on-device model' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Run cloud model' })).toBeDisabled();
    await expect(page.getByRole('region', { name: 'Field by field' })).toHaveCount(0);
  }
  await text(page);
  await expect(page.getByRole('region', { name: 'Source' })).toContainText('No vital signs are charted for this patient');
});

test('a partial set (MOCK): what is not written for that time is not compared', async ({ page }) => {
  await mockDevice(page, '{"bp_systolic":114,"bp_diastolic":68,"heart_rate":100,"resp_rate":22,"spo2":94,"temp_c":38.4,"o2_flow_lpm":4}'); // takes blood pressure and temperature of 04:20
  await open(page);
  await choose(page, 'pt-09');
  await page.getByRole('button', { name: 'Run on-device model' }).click();
  await expect(device(page)).toContainText('4 of 4 known values repeated exactly');
  await expect(row(page, 'Top blood pressure')).toContainText('Not in this set');
  await expect(row(page, 'Temperature')).toContainText('Not in this set');
  await expect(page.getByTestId('compared-set')).toContainText('so not compared: Top blood pressure, Bottom blood pressure, Temperature, Pain, Blood sugar, Awake?.');
});

for (const width of [1440, 1280, 1024, 768, 390, 360]) {
  test(`${width}px: the drill fits with an answer (MOCK model); nothing is cut off`, async ({ page }, info) => {
    await mockDevice(page, TOM);
    await page.setViewportSize({ width, height: 844 });
    await open(page);
    await choose(page, 'pt-05');
    for (const [id, name] of DESIGNS) {
      await design(page, name).click();
      await expect(picture(page, name, 'Tom Hale', 'DK-004541')).toBeVisible(DRAWN);
      await page.getByRole('button', { name: 'Run on-device model' }).click();
      await expect(device(page).getByText(/ONLY_ON_DEVICE ·/)).toBeVisible();
      await expectFits(page, width);
      const img = (await page.getByTestId('report-picture').boundingBox())!, box = (await page.getByTestId('report-box').boundingBox())!;
      expect(img.x).toBeGreaterThanOrEqual(box.x - 1);
      expect(img.x + img.width).toBeLessThanOrEqual(box.x + box.width + 1);
      expect(img.width).toBeGreaterThan(Math.min(width - 130, 400));
      if (id === 'assessment') await page.screenshot({ path: info.outputPath('screens', `compare-${width}.png`), fullPage: true });
    }
    await text(page);
    await page.getByRole('button', { name: 'Run on-device model' }).click();
    await expect(row(page, 'Pulse')).toContainText('Same');
    await expectFits(page, width);
  });
}

test.describe('offline', () => {
  test.use({ serviceWorkers: 'allow', baseURL: 'http://localhost:4173' });
  test('the report pictures are drawn with no network', async ({ page, context }) => {
    await open(page, /Daniel Okafor/);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await choose(page, 'pt-04');
    for (const [, name] of DESIGNS) {
      await design(page, name).click();
      await expect(picture(page, name, 'Grace Bell', 'DK-004533')).toBeVisible(DRAWN);
    }
  });
});
