import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { unlockIfNeeded, unlockPractice } from '../e2e/helpers';
import { go, noRealCloud, openPatient, pin, savedOffline, signIn, signOut, watch } from './site';

/** The public website of the judge build: landing page, installation, Practice only, routing. Fictional data only. */
test.beforeEach(({ context }) => noRealCloud(context));
const landing = (page: Page) => page.getByRole('heading', { level: 1, name: /When the EHR goes down/ });
const install = (page: Page) => page.getByRole('button', { name: 'Install Practice App' });
const about = (page: Page) => page.getByRole('region', { name: 'About the Practice app' });
const unlock = (page: Page) => page.getByRole('heading', { name: 'Unlock records on this laptop' });
const databases = (page: Page) => page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name));

test('/ and /landing are public: every action is real, nothing clinical is loaded, nothing outside is asked', async ({ page }, info) => {
  const seen = watch(page);
  for (const path of ['/', '/landing']) {
    const response = await page.goto(path);
    expect(response!.headers()).toMatchObject({ 'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY' });
    expect(response!.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
    await expect(landing(page)).toBeVisible();
    const main = page.getByRole('main');
    await expect(main.getByRole('link', { name: /Launch Practice Demo/ }).first()).toHaveAttribute('href', '/sign-in?demo=practice');
    await expect(main.getByRole('link', { name: 'View Project on GitHub' })).toHaveAttribute('href', 'https://github.com/AqeelaUrooj/ClinBridge_FireBaseAILogicHackathon');
    await expect(main.getByRole('link', { name: 'Watch Demo Video' })).toHaveCount(0); // no address was given
    await expect(install(page)).toBeVisible();
    await expect(about(page)).toContainText('including offline charting');
    await savedOffline(page);
  }
  expect(await databases(page)).toEqual([]);
  expect(await page.evaluate(() => performance.getEntriesByType('resource').filter((e) => (e as PerformanceResourceTiming).initiatorType === 'script' && /ClinicalApplication|seed/.test(e.name)).map((e) => e.name))).toEqual([]);
  await expect(page.locator('body')).not.toContainText(/Daniel Okafor|MRN \d|DT-4W-01/);
  expect(await page.locator('a[href="#"], a:not([href]), a[href=""]').count()).toBe(0);
  for (const href of await page.locator('a[href^="#"]').evaluateAll((a) => a.map((x) => x.getAttribute('href')!))) expect(await page.locator(href).count(), href).toBe(1);
  const licenses = await page.request.get('/third-party-licenses.txt');
  expect(await licenses.text()).toContain('SIL OPEN FONT LICENSE');
  expect(seen).toEqual({ outside: [], refused: [] });
  await page.screenshot({ path: info.outputPath('screens', 'landing.png'), fullPage: true });
});

for (const width of [1440, 768, 390, 360]) {
  test(`landing page with the install actions fits at ${width}px`, async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await install(page).click();
    await expect(page.getByRole('note', { name: 'How to install' })).toBeVisible();
    await savedOffline(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    const out = await page.locator('.lp-actions > *, .lp-install, .lp-install *, .lp-cta a').evaluateAll((els, w) => els.filter((e) => { const b = e.getBoundingClientRect(); return b.left < 0 || b.right > w + 1; }).map((e) => e.textContent), width);
    expect(out).toEqual([]);
    await page.screenshot({ path: info.outputPath('screens', `install-${width}.png`) });
  });
}

test('manifest, icons and what Chrome says about installability', async ({ page, request }) => {
  const m = await (await request.get('/manifest.webmanifest')).json() as { icons: { src: string; sizes: string; type: string; purpose: string }[] };
  expect(m).toMatchObject({ name: 'ClinBridge Practice', short_name: 'ClinBridge', id: '/', start_url: '/sign-in', scope: '/', display: 'standalone', lang: 'en', theme_color: '#1c2536' });
  expect(m.icons.map((i) => `${i.sizes} ${i.purpose}`)).toEqual(['192x192 any', '512x512 any', '512x512 maskable', 'any any']);
  for (const i of m.icons) {
    const r = await request.get(i.src);
    expect(r.headers()['content-type']).toContain(i.type);
    if (i.type !== 'image/png') continue;
    const png = await r.body();
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    expect(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`).toBe(i.sizes);
  }
  await page.goto('/');
  await savedOffline(page);
  const cdp = await page.context().newCDPSession(page);
  const { errors, url } = await cdp.send('Page.getAppManifest') as { errors: unknown[]; url: string };
  expect(errors).toEqual([]);
  expect(url).toContain('/manifest.webmanifest');
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors') as { installabilityErrors: { errorId: string }[] };
  expect(installabilityErrors.map((e) => e.errorId).filter((e) => e !== 'in-incognito')).toEqual([]); // the test browser is always a private one
});

/** Chromium's install event, as the page receives it. `outcome` is what the person answers in the browser's dialog. */
const offer = (page: Page, outcome: 'accepted' | 'dismissed' | 'error') => page.evaluate((outcome) => {
  const w = window as unknown as { asked: number };
  w.asked ??= 0;
  const e = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), { prompt: async () => { w.asked++; if (outcome === 'error') throw new Error('no'); return { outcome }; } });
  dispatchEvent(e);
  return e.defaultPrevented;
}, outcome);
const asked = (page: Page) => page.evaluate(() => (window as unknown as { asked?: number }).asked ?? 0);

test('install button: no dialog from the browser, so instructions; the demo stays usable', async ({ page }) => {
  await page.goto('/');
  await install(page).click();
  const help = page.getByRole('note', { name: 'How to install' });
  await expect(help).toContainText(/In Chrome: click the install icon/);
  await expect(help).toContainText('may already be installed');
  await expect(about(page)).not.toContainText(/installed ClinBridge Practice|is installing|You accepted/);
  await expect(page.locator('progress, [role=progressbar]')).toHaveCount(0);
  await page.getByRole('main').getByRole('link', { name: /Launch Practice Demo/ }).first().click();
  await unlockIfNeeded(page);
  await expect(page.getByRole('heading', { name: 'Who are you?' })).toBeVisible();
});

test('install button: the dialog opens only from the click; accepted is not "installed" until the browser says so', async ({ page }) => {
  await page.goto('/');
  expect(await offer(page, 'accepted')).toBe(true);
  expect(await asked(page)).toBe(0);
  await install(page).click();
  await expect(about(page)).toContainText('You accepted. Your browser is installing');
  expect(await asked(page)).toBe(1);
  await expect(about(page)).not.toContainText('Your browser installed');
  await page.evaluate(() => dispatchEvent(new Event('appinstalled')));
  await expect(about(page)).toContainText('Your browser installed ClinBridge Practice. Open it from the Start menu');
  await install(page).click(); // the used dialog is not asked again
  expect(await asked(page)).toBe(1);
});

test('install button: dismissed says not installed, and the browser may offer it again', async ({ page }) => {
  await page.goto('/');
  await offer(page, 'dismissed');
  await install(page).click();
  await expect(about(page)).toContainText('Not installed.');
  await offer(page, 'accepted');
  await expect(about(page)).not.toContainText('Not installed.');
  await install(page).click();
  await expect(about(page)).toContainText('You accepted.');
});

test('install button: a dialog that fails leads to the instructions', async ({ page }) => {
  await page.goto('/');
  await offer(page, 'error');
  await install(page).click();
  await expect(page.getByRole('note', { name: 'How to install' })).toBeVisible();
  await expect(about(page)).not.toContainText(/accepted|Your browser installed/);
});

test('inside the installed app there is no install button', async ({ page }) => {
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = (q) => (q.includes('display-mode: standalone') ? { ...real(q), matches: true, media: q, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList : real(q));
  });
  await page.goto('/');
  await expect(about(page)).toContainText('You are using the installed app.');
  await expect(install(page)).toHaveCount(0);
});

test('Practice only: an old Real preference, /setup and the unlock screen never open Real records', async ({ page }, info) => {
  await page.addInitScript(() => localStorage.setItem('dtk.dataset', 'live'));
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  const note = page.getByRole('note', { name: 'Public demo' });
  await expect(note).toContainText('fictional patients only');
  await expect(note).toContainText('Never type real patient details');
  await savedOffline(page);
  await expect(page.getByRole('radio')).toHaveCount(0);
  await expect(page.getByText(/Real records|first-time setup/i)).toHaveCount(0);
  await expect(page.getByText('Practice PIN for every person: 2468')).toBeVisible();
  await page.screenshot({ path: info.outputPath('screens', 'sign-in.png') });
  await page.goto('/setup');
  await expect(unlock(page)).toBeVisible();
  await expect(page.getByRole('radio')).toHaveCount(0);
  await unlockPractice(page);
  await expect(page).toHaveURL(/\/sign-in$/);
  await signIn(page, /Kim Ellis/);
  for (const path of ['/admin/snapshot', '/admin/devices', '/admin/backup', '/admin/settings', '/more']) {
    await go(page, path);
    await expect(page.getByText('PRACTICE · FAKE PATIENTS ONLY')).toBeVisible();
    for (const name of ['Load a new list', 'Make enrollment file', 'Open first-time setup']) await expect(page.getByRole('button', { name }), `${path} ${name}`).toHaveCount(0);
    await expect(page.locator('main input[type=file]:visible'), path).toHaveCount(0);
  }
  expect((await databases(page)).filter((n) => /live/.test(n ?? ''))).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem('dtk.dataset'))).toBe('live'); // not changed, only ignored
});

test('photo of paper says: a made-up sheet only', async ({ page }) => {
  await page.goto('/sign-in');
  await signIn(page);
  await openPatient(page, 'pt-01', '/capture');
  await expect(page.getByText('Public demo: use a made-up sheet only')).toBeVisible();
  await expect(page.getByText('PUBLIC DEMO: NEVER ENTER REAL PATIENT DETAILS')).toBeVisible();
});

for (const [who, home] of [[/Daniel Okafor/, '/ward'], [/Kim Ellis/, '/admin']] as const) {
  test(`installed start address, then ${home}; / goes back there; locked stays locked`, async ({ page }) => {
    await page.goto('/sign-in'); // start_url
    await signIn(page, who);
    await expect(page).toHaveURL(new RegExp(home + '$'));
    await go(page, '/');
    await expect(page).toHaveURL(new RegExp(home + '$'));
    await page.getByRole('button', { name: 'Lock screen' }).click();
    for (const path of ['/', '/patients/pt-02', '/']) {
      await go(page, path);
      await expect(page).toHaveURL(/\/lock$/);
      await expect(page.getByRole('article')).toHaveCount(0);
    }
    await pin(page);
    await expect(page).toHaveURL(new RegExp(home + '$'));
  });
}

test('leaving to the public page drops the key: no request, no record, and the unlock is asked again', async ({ page }) => {
  await page.goto('/sign-in');
  await signIn(page);
  await openPatient(page, 'pt-01');
  for (const path of ['/landing', '/']) {
    if (path === '/') await signOut(page); // signed in, / is the ward board
    await go(page, path);
    await expect(landing(page)).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/Sam Rivera|MRN \d/);
    await go(page, '/patients/pt-01');
    await expect(unlock(page)).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/Sam Rivera|MRN \d/);
    await unlockPractice(page);
    await expect(page).toHaveURL(/\/sign-in$/);
    await signIn(page);
    if (await page.getByRole('dialog').count() === 0) await go(page, '/patients/pt-01');
    await expect(page.getByRole('dialog', { name: 'Is this the right patient?' })).toBeVisible(); // the check is asked again
    await page.getByRole('button', { name: 'Yes, open' }).click();
    await expect(page.getByText('Sam Rivera').first()).toBeVisible();
  }
});

for (const route of ['/ward', '/admin', '/patients/pt-01', '/patients/pt-01/report?sheet=shift', '/drill/compare', '/export', '/nothing/here']) {
  test(`${route} by address and after a refresh: the app opens and asks for sign-in`, async ({ page }) => {
    for (const load of [() => page.goto(route), () => page.reload()]) {
      expect((await load())!.status()).toBe(200);
      await unlockIfNeeded(page);
      await expect(page.getByRole('heading', { name: 'Who are you?' })).toBeVisible();
      await expect(page).toHaveURL(/\/sign-in$/);
    }
  });
}

test('firebase.json publishes only the judge build, checked first, and never without a build', () => {
  const { hosting } = JSON.parse(readFileSync('firebase.json', 'utf8')) as { hosting: Record<string, unknown> };
  expect(hosting).toMatchObject({ public: 'dist-judge', predeploy: ['npm run build:judge', 'npm run check:judge'], rewrites: [{ source: '!/@(assets)/**', destination: '/index.html' }] });
});
