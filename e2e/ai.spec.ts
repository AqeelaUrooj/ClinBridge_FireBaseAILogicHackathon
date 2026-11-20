import { test, expect, type Page } from '@playwright/test';
import { unlockIfNeeded } from './helpers';

/**
 * AI flows in the browser. The Prompt API here is a MOCK injected into the page (no Gemini Nano in CI), and the
 * build has FAKE Firebase values (.env.e2e-ai). These tests prove wiring, labels, nurse review and that System
 * down makes no network request. They do not prove model quality; see docs/AI_TEST_MATRIX.md.
 */
test.use({ baseURL: 'http://localhost:4174' });

const MOCK_ANSWER = JSON.stringify({ bp_systolic: 132, bp_diastolic: 84, heart_rate: 88, spo2: 96, temp_c: 37.3, consciousness: 'Alert' });

async function mockPromptApi(page: Page, availability: string) {
  await page.addInitScript(({ availability, answer }) => {
    const w = window as unknown as { LanguageModel: unknown; __lmPrompts: number };
    w.__lmPrompts = 0;
    w.LanguageModel = {
      availability: async () => availability,
      create: async () => ({ prompt: async () => { w.__lmPrompts++; return answer; }, promptStreaming: () => new ReadableStream(), destroy: () => {} }),
    };
  }, { availability, answer: MOCK_ANSWER });
}

function recordExternalRequests(page: Page): string[] {
  const urls: string[] = [];
  page.on('request', (r) => { const u = r.url(); if (!/^(https?:\/\/localhost|data:|blob:|chrome-extension:)/.test(u)) urls.push(u); });
  return urls;
}

async function signIn(page: Page, who: RegExp) {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click();
}

async function openCapture(page: Page) {
  await expect(page).toHaveURL(/\/ward$/);
  await page.getByTestId('patient-pt-01').click();
  await page.getByRole('button', { name: 'Yes, open' }).click();
  await page.getByRole('link', { name: /Photo of paper/ }).click();
  await page.getByRole('button', { name: /Vitals sheet/ }).click();
}

async function tinyPng(page: Page): Promise<Buffer> {
  const b64 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 200; c.height = 120; const g = c.getContext('2d')!; g.fillStyle = '#fff'; g.fillRect(0, 0, 200, 120); g.fillStyle = '#000'; g.font = '20px sans-serif'; g.fillText('BP 132/84', 10, 40); return c.toDataURL('image/png').split(',')[1]!; });
  return Buffer.from(b64, 'base64');
}

test('System down + on-device proposal (MOCK model): draft, nurse confirms beside the photo, zero external requests', async ({ page }) => {
  await mockPromptApi(page, 'available');
  await signIn(page, /Kim Ellis/);
  await page.getByRole('link', { name: 'Downtime' }).click();
  await page.getByRole('button', { name: 'Start a practice outage' }).click();
  await expect(page.getByText('SYSTEM DOWN').first()).toBeVisible();

  const external = recordExternalRequests(page);
  await signIn(page, /Daniel Okafor/);
  await openCapture(page);
  await page.getByTestId('photo-input').setInputFiles({ name: 'form.png', mimeType: 'image/png', buffer: await tinyPng(page) });
  await page.getByRole('button', { name: 'Propose values from the photo' }).click();
  const card = page.getByRole('region', { name: 'On-device AI proposal' });
  await expect(card.getByText(/On this laptop · ONLY_ON_DEVICE/)).toBeVisible();
  await expect(card.getByText('132')).toBeVisible();
  await card.getByRole('button', { name: 'Put these values in the form' }).click();
  await expect(page.getByLabel('Pulse')).toHaveValue('88');
  await page.getByLabel('Pulse').fill('86'); // nurse corrects one value against the paper
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save as draft' }).click();
  await expect(page).toHaveURL(/\/entries\//);
  await expect(page.getByText('Device AI')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __lmPrompts: number }).__lmPrompts)).toBe(1);
  expect(external, `external requests: ${external.join(', ')}`).toEqual([]);
});

test('no on-device AI in the browser: clear message, nothing sent, manual entry still saves', async ({ page }) => {
  const external = recordExternalRequests(page);
  await signIn(page, /Daniel Okafor/);
  await openCapture(page);
  await page.getByTestId('photo-input').setInputFiles({ name: 'form.png', mimeType: 'image/png', buffer: await tinyPng(page) });
  await page.getByRole('button', { name: 'Propose values from the photo' }).click();
  await expect(page.getByRole('alert').filter({ hasText: /no on-device AI|can.t run|not downloaded|not set up|did not answer/ })).toBeVisible();
  await page.getByLabel('Pulse').fill('79');
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page).toHaveURL(/\/entries\//); // saved, confirmed, manual path unchanged
  await expect(page.getByText('Confirmed').first()).toBeVisible();
  expect(external.filter((u) => /googleapis|firebase|recaptcha/.test(u))).toEqual([]);
});

test('AI check page reports the real state; compare shows the mock as on-device and blocks cloud in System down', async ({ page }) => {
  await mockPromptApi(page, 'downloadable');
  await signIn(page, /Kim Ellis/);
  await page.getByRole('link', { name: 'More' }).click();
  await page.getByRole('link', { name: 'AI check' }).click();
  const list = page.getByRole('list', { name: 'AI readiness' });
  await expect(list.getByText('Prompt API (LanguageModel)')).toBeVisible();
  await expect(list.getByText(/Not downloaded yet/).first()).toBeVisible(); // installed Chrome != model ready
  await expect(list.getByText(/Initialised for project e2e-fake-project/)).toBeVisible();
  await expect(list.getByText(/ONLY_ON_DEVICE \(no cloud fallback\)/)).toBeVisible();
});

test('pending cloud compare, then System down declared in another tab: request cancelled, late answer never shown', async ({ page, context }) => {
  // Everything "cloud" here is a local stand-in: fake reCAPTCHA script, fake App Check exchange, a held fake Gemini
  // response. Nothing reaches Google. This proves the cancellation wiring, not a real cloud call.
  await context.route('https://www.google.com/recaptcha/**', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.grecaptcha={enterprise:{ready:function(cb){cb()},render:function(){return "w1"},execute:function(){return Promise.resolve("fake-recaptcha")}}};' }));
  await context.route('https://content-firebaseappcheck.googleapis.com/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: 'fake-app-check-token', ttl: '3600s' }) }));
  let held: import('@playwright/test').Route | null = null;
  let aborted = false;
  await context.route(/generateContent/, (r) => { held = r; });
  page.on('requestfailed', (req) => { if (/generateContent/.test(req.url())) aborted = true; });

  await signIn(page, /Daniel Okafor/);
  await page.getByRole('link', { name: 'More' }).click();
  await page.getByRole('link', { name: 'Device vs Cloud' }).click();
  await page.getByLabel('Fictional source record').selectOption({ index: 1 });
  const cloudCard = page.getByRole('region', { name: 'Cloud model' });
  await cloudCard.getByRole('button', { name: 'Run cloud model' }).click();
  await expect.poll(() => held !== null, { timeout: 15_000 }).toBe(true);
  await expect(cloudCard.getByRole('button', { name: 'Running…' })).toBeVisible();

  // Another tab on the same laptop declares a practice outage.
  const admin = await context.newPage();
  await signIn(admin, /Kim Ellis/);
  await admin.getByRole('link', { name: 'Downtime' }).click();
  await admin.getByRole('button', { name: 'Start a practice outage' }).click();
  await expect(admin.getByText('SYSTEM DOWN').first()).toBeVisible();

  // The first tab cancels the request and says the answer is discarded.
  await expect(cloudCard.getByRole('alert')).toContainText('Cloud answer discarded', { timeout: 15_000 });
  await expect(cloudCard.getByText(/Cloud blocked: System down/)).toBeVisible();
  await expect.poll(() => aborted).toBe(true);

  // A late answer from the "server" is never shown.
  await held!.fulfill({ contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: MOCK_ANSWER }] }, finishReason: 'STOP', index: 0 }] }) }).catch(() => undefined);
  await page.waitForTimeout(500);
  await expect(cloudCard.getByText(/Cloud · ONLY_IN_CLOUD/)).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Differences' })).toHaveCount(0);
  await admin.close();
});
