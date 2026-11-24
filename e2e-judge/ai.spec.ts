import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { go, openPatient, signIn, signOut, watch } from './site';

/**
 * AI rules in the judge build. This server has the same build with FAKE Firebase values (playwright.judge.config.ts).
 * Every answer is a MOCK; recaptcha, App Check and the cloud model are local stand-ins. Nothing reaches Google.
 * The stand-ins answer only after the Content-Security-Policy let the request out, so the policy is tested too.
 */
test.use({ serviceWorkers: 'block' });
const WITH_FAKE_AI = 'http://localhost:4286';
const ANSWER = '{"bp_systolic":134,"bp_diastolic":80,"heart_rate":74,"resp_rate":16,"temp_c":36.8,"spo2":97,"consciousness":"Alert"}';

async function standIns(page: Page) {
  const sent: string[] = [];
  const ctx = page.context();
  await ctx.route('https://www.google.com/recaptcha/**', (r) => r.fulfill({ contentType: 'text/javascript', body: 'window.grecaptcha={enterprise:{ready:function(cb){cb()},render:function(el,o){o.callback();return "w1"},execute:function(){return Promise.resolve("fake-recaptcha")}}};' }));
  await ctx.route('https://content-firebaseappcheck.googleapis.com/**', (r) => r.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: 'fake-app-check-token', ttl: '3600s' }) }));
  await ctx.route(/generateContent/, async (r) => {
    if (r.request().method() === 'POST') sent.push(`${new URL(r.request().url()).hostname} ${r.request().headers()['x-firebase-appcheck'] ?? 'no App Check'}`);
    await r.fulfill({ contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { role: 'model', parts: [{ text: ANSWER }] }, finishReason: 'STOP', index: 0 }] }) });
  });
  return sent;
}
const noModel = (page: Page) => page.addInitScript(() => { delete (window as unknown as { LanguageModel?: unknown }).LanguageModel; delete (Object.getPrototypeOf(window) as { LanguageModel?: unknown }).LanguageModel; });
const cloud = (page: Page) => page.getByRole('region', { name: 'Cloud model' });

test('without a Firebase project the public demo has no AI, says so, and charting works; nothing is sent', async ({ page }) => {
  test.skip(existsSync('hosting/.env.local'), 'this build has the real demo project; tests never call it');
  await noModel(page);
  const seen = watch(page);
  await page.goto('/sign-in');
  await signIn(page);
  await go(page, '/ai');
  await expect(page.getByRole('list', { name: 'AI readiness' })).toContainText(/not set up/i);
  await go(page, '/drill/compare');
  await page.getByLabel('Fictional patient').selectOption('pt-01');
  await page.getByRole('radio', { name: 'Synthetic note (text)' }).click();
  await cloud(page).getByRole('button', { name: 'Run cloud model' }).click();
  await expect(cloud(page).getByRole('alert')).toContainText(/not set up on this build/);
  await openPatient(page, 'pt-01', '/vitals');
  await expect(page.getByRole('link', { name: 'Record vitals' })).toBeVisible();
  expect(seen).toEqual({ outside: [], refused: [] });
});

test('App Check comes first and the policy lets only these requests out; System down blocks the cloud; no fallback', async ({ page }) => {
  await noModel(page);
  const sent = await standIns(page);
  const seen = watch(page);
  await page.goto(WITH_FAKE_AI + '/sign-in');
  await signIn(page);
  await go(page, '/drill/compare');
  await page.getByLabel('Fictional patient').selectOption('pt-01');
  await page.getByRole('radio', { name: 'Synthetic note (text)' }).click();
  const device = page.getByRole('region', { name: 'On-device model' });
  await device.getByRole('button', { name: 'Run on-device model' }).click();
  await expect(device.getByRole('alert')).toBeVisible();
  expect(sent).toEqual([]); // opening and choosing sends nothing, and no on-device model does not start the cloud
  await cloud(page).getByRole('button', { name: 'Run cloud model' }).click();
  await expect(cloud(page).getByText(/Cloud · ONLY_IN_CLOUD/)).toBeVisible({ timeout: 20_000 });
  expect(sent).toEqual(['firebasevertexai.googleapis.com fake-app-check-token']);
  expect(seen.refused).toEqual([]);
  expect([...new Set(seen.outside.map((u) => new URL(u).hostname))].sort()).toEqual(['content-firebaseappcheck.googleapis.com', 'firebasevertexai.googleapis.com', 'www.google.com']);

  await signOut(page);
  await signIn(page, /Kim Ellis/);
  await go(page, '/admin/downtime');
  await page.getByRole('button', { name: 'Start a practice outage' }).click();
  await expect(page.getByText('SYSTEM DOWN').first()).toBeVisible();
  await go(page, '/drill/compare');
  await page.getByLabel('Fictional patient').selectOption('pt-01');
  await page.getByRole('radio', { name: 'Synthetic note (text)' }).click();
  await expect(cloud(page)).toContainText('Cloud blocked: System down');
  await expect(cloud(page).getByRole('button', { name: 'Run cloud model' })).toBeDisabled();
  expect(sent).toHaveLength(1);
});

test('a script, frame or connection to another place is refused by the policy', async ({ page }) => {
  await page.goto('/');
  const refused = await page.evaluate(async () => {
    const out: string[] = [];
    document.addEventListener('securitypolicyviolation', (e) => out.push(e.effectiveDirective));
    const s = document.createElement('script'); s.src = 'https://example.com/x.js'; document.head.append(s);
    const f = document.createElement('iframe'); f.src = 'https://example.com/'; document.body.append(f);
    await fetch('https://example.com/').catch(() => undefined);
    const i = document.createElement('script'); i.textContent = 'window.bad=1'; document.head.append(i);
    await new Promise((ok) => setTimeout(ok, 500));
    return { out: [...new Set(out)].sort(), bad: (window as unknown as { bad?: number }).bad };
  });
  expect(refused.out).toEqual(expect.arrayContaining(['connect-src', 'frame-src', 'script-src-elem']));
  expect(refused.bad).toBeUndefined();
});
