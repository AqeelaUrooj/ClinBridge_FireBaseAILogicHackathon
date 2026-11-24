import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlockIfNeeded, unlockPractice } from '../e2e/helpers';
import { go, lastPulse, openPatient, openProfile, recordPulse, savedOffline, signIn, signOut, Site, watch } from './site';

/**
 * Offline in the judge build. The website really is taken away (its server is stopped) and the browser is set offline.
 * Every test has its own website and its own browser profile on disk. Fictional data only, no AI model.
 */
test.use({ trace: 'off' });
let site: Site;
let profile: string;
let ctx: BrowserContext;
let page: Page;
test.beforeEach(async () => {
  site = new Site();
  await site.start();
  profile = mkdtempSync(join(tmpdir(), 'clinbridge-judge-'));
  await open();
});
test.afterEach(async () => {
  await ctx.close().catch(() => undefined);
  await site.dispose();
  rmSync(profile, { recursive: true, force: true });
});

/** Open the browser with this profile, as after a restart of the laptop. */
async function open(offline = false) {
  ctx = await openProfile(profile, offline);
  page = ctx.pages()[0] ?? await ctx.newPage();
}
async function disconnect() {
  await site.stop();
  await ctx.setOffline(true);
}
async function reconnect() {
  await site.start(); // same address as before
  await ctx.setOffline(false);
}

test('the first start works with no network once the public page was seen: fictional records are made on the laptop', async () => {
  await page.goto(site.url);
  await savedOffline(page);
  expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true); // no reload was needed
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  await disconnect();
  await page.getByRole('main').getByRole('link', { name: /Launch Practice Demo/ }).first().click();
  await signIn(page);
  await expect(page.getByRole('article')).toHaveCount(10);
  for (const path of ['/', '/landing', '/ward', '/patients/pt-03/meds']) { // direct addresses and refresh, still offline
    await page.goto(site.url + path);
    await page.reload();
    await expect(page.getByRole('heading', { name: path.length > 8 || path === '/ward' ? /Unlock records|Who are you/ : /When the EHR goes down/ })).toBeVisible();
  }
});

test('judge demo: outage, no network, chart, restart, recovery, export', async () => {
  test.setTimeout(240_000);
  const shot = (name: string) => page.screenshot({ path: test.info().outputPath('screens', `${name}.png`) });
  let seen = watch(page);

  // A: online first start
  await page.goto(site.url);
  await savedOffline(page);
  await page.getByRole('main').getByRole('link', { name: /Launch Practice Demo/ }).first().click();
  await signIn(page);
  await expect(page.getByRole('article')).toHaveCount(10);
  await openPatient(page, 'pt-09');
  await expect(page.getByRole('main')).toContainText('MRN');
  await signOut(page);

  // B: an admin declares the practice outage, then the network really goes away
  await signIn(page, /Kim Ellis/);
  await go(page, '/admin/downtime');
  await page.getByRole('button', { name: 'Start a practice outage' }).click();
  await expect(page.getByRole('heading', { name: 'Now: System down' })).toBeVisible();
  await signOut(page);
  await disconnect();
  expect(await page.evaluate(() => fetch('/icon.svg?x=' + Math.random()).then(() => 'answered', () => 'no answer'))).toBe('no answer');
  await page.reload();
  await unlockPractice(page);
  await expect(page.getByText(/Network\s*None\s*Not needed here/).last()).toBeVisible();
  await shot('1-offline-sign-in');
  await signIn(page);
  await expect(page.getByText('SYSTEM DOWN').first()).toBeVisible();
  await shot('2-offline-ward');
  await recordPulse(page, 'pt-09', '91');
  await expect(lastPulse(page)).toContainText('91');
  await shot('3-offline-vitals');

  await openOwn('/notes');
  const panel = page.getByRole('region', { name: 'Write a note' });
  await panel.getByRole('button', { name: 'Care given' }).click();
  await panel.getByLabel('Note').fill('Offline demo note.');
  await panel.getByRole('button', { name: 'Review' }).click();
  await panel.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText('Saved on this laptop.')).toBeVisible();

  await openOwn('/meds');
  await expect(page.getByRole('heading', { name: /Medic/ }).first()).toBeVisible();
  await shot('4-offline-medicines');
  await openOwn('/body');
  await expect(page.getByRole('heading', { name: /body map/i }).first()).toBeVisible();
  await expect(page.locator('svg[data-view="front"]').first()).toBeVisible();
  await shot('5-offline-body-map');
  for (const [id, design] of [['assessment', 'Assessment sheet'], ['shift', 'Shift report'], ['worksheet', 'Bedside worksheet'], ['pocket', 'Pocket notes']] as const) {
    await openOwn(`/report?sheet=${id}`);
    await expect(page.getByRole('heading', { name: `Handwritten report · ${design}` })).toBeVisible();
    await expect(page.locator('svg[data-look="photo"]').getByTestId('synthetic-label')).toHaveText('PRACTICE — SYNTHETIC REPORT — NOT A MEDICAL RECORD');
  }
  expect(await page.evaluate(() => Array.from(document.fonts as unknown as Iterable<FontFace>).filter((f) => f.family.includes('CB ')).map((f) => f.status))).toEqual(Array(7).fill('loaded'));
  const [png] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download Practice image' }).click()]);
  expect(png.suggestedFilename()).toMatch(/^PRACTICE-synthetic-pocket-.*\.png$/);
  await shot('6-offline-report');
  await go(page, '/drill/compare');
  await expect(page.getByText(/Cloud blocked: System down/).first()).toBeVisible();
  expect(seen).toEqual({ outside: [], refused: [] });

  // the window is closed; the laptop restarts with no network
  await ctx.close();
  await open(true);
  seen = watch(page);
  await page.goto(site.url + '/sign-in');
  await unlockPractice(page);
  await signIn(page);
  await openPatient(page, 'pt-09', '/vitals');
  await expect(lastPulse(page)).toContainText('91');
  await openOwn('/notes');
  await expect(page.getByText('Offline demo note.').first()).toBeVisible();
  await shot('7-offline-after-restart');
  await signOut(page);

  // C: network back, clearance by the admin, recovery and the file for the EHR team
  await reconnect();
  await signIn(page, /Kim Ellis/);
  await expect(page.getByText('SYSTEM DOWN').first()).toBeVisible(); // a network alone clears nothing
  await go(page, '/admin/downtime');
  const gate = page.getByRole('region', { name: 'Network clearance', exact: true });
  await expect(gate.getByRole('button', { name: /Clear network/ })).toBeDisabled();
  for (const t of ['IT / security team says', 'EHR team says', 'Downtime lead approved']) await gate.getByRole('checkbox', { name: new RegExp(t) }).check();
  for (const d of '2468') await gate.getByRole('button', { name: d, exact: true }).click();
  await gate.getByRole('button', { name: /Clear network/ }).click();
  await expect(page.getByRole('heading', { name: 'Now: Back online' })).toBeVisible();
  await go(page, '/recovery');
  await expect(page.getByRole('heading', { name: /Recovery|worklist/i }).first()).toBeVisible();
  await go(page, '/export');
  await page.getByRole('button', { name: 'Prepare export file' }).click();
  await expect(page.getByTestId('export-summary')).toContainText('resources in the file');
  await page.getByLabel('I understand this file is sensitive and not encrypted').check();
  const [bundle] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download file' }).click()]);
  const json = JSON.parse(readFileSync(await bundle.path(), 'utf8')) as { resourceType: string };
  expect(json.resourceType).toBe('Bundle');
  const all = JSON.stringify(json); // notes are attachments: the text is base64
  expect([Buffer.from('Offline demo note.').toString('base64').slice(0, 20), 'Offline demo note.'].some((t) => all.includes(t))).toBe(true);
  await expect(page.getByRole('main')).not.toContainText(/synced|synchroni[sz]ed with|sent to the EHR/i);
  await shot('8-export');
  expect(seen).toEqual({ outside: [], refused: [] });

  async function openOwn(path: string) { // same patient, already checked
    await go(page, `/patients/pt-09${path}`);
    const yes = page.getByRole('button', { name: 'Yes, open' });
    if (await yes.isVisible()) await yes.click();
  }
});

test('a newer version waits: no reload while charting, records kept, used after all windows are closed', async () => {
  await page.goto(site.url + '/sign-in');
  await savedOffline(page);
  await signIn(page);
  await recordPulse(page, 'pt-01', '87');
  await page.getByRole('link', { name: 'Record vitals' }).click();
  await page.getByLabel('Pulse').fill('199'); // typed, not saved
  await page.evaluate(() => { (window as unknown as { mark: number }).mark = 1; });

  // "Deploy" a newer version and let the browser find it
  const index = join(site.dir, 'index.html'), sw = join(site.dir, 'sw.js');
  writeFileSync(index, readFileSync(index, 'utf8').replace('<title>ClinBridge</title>', '<title>ClinBridge v2</title>'));
  const worker = readFileSync(sw, 'utf8').replace(/\{url:"index\.html",revision:"[^"]+"\}/, '{url:"index.html",revision:"v2"}');
  expect(worker).toContain('revision:"v2"');
  writeFileSync(sw, worker);
  await page.evaluate(async () => { await (await navigator.serviceWorker.ready).update(); });
  await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.ready).waiting)).toBe(true);
  await page.waitForTimeout(1500);
  expect(await page.evaluate(() => (window as unknown as { mark?: number }).mark)).toBe(1); // not reloaded
  await expect(page.getByLabel('Pulse')).toHaveValue('199');
  const notice = () => page.getByText('A newer version of ClinBridge is ready.');
  await expect(notice()).toHaveCount(0); // nothing over the chart while someone works
  await signOut(page);
  await expect(notice()).toBeVisible();
  await expect(page).toHaveTitle('ClinBridge');

  await ctx.close();
  await open();
  await page.goto(site.url + '/sign-in');
  await unlockIfNeeded(page);
  if (await page.title() !== 'ClinBridge v2') { // the old one served this start and is dropped now that no window uses it
    await ctx.close();
    await open();
    await page.goto(site.url + '/sign-in');
    await unlockIfNeeded(page);
  }
  await expect(page).toHaveTitle('ClinBridge v2');
  await expect(notice()).toHaveCount(0);
  await signIn(page);
  await openPatient(page, 'pt-01', '/vitals');
  await expect(lastPulse(page)).toContainText('87');
  await expect(page.getByText('199')).toHaveCount(0);
  await disconnect(); // the newer version is complete offline too
  await page.goto(site.url + '/');
  await expect(page).toHaveTitle('ClinBridge v2');
});

test('first visit cut off while the app is being stored: it says so, and the next visit completes it', async () => {
  site.broken = (path) => path.includes('material-symbols') || path.includes('seed');
  await page.goto(site.url);
  await expect(page.getByText('Saving the app for offline use. Stay online until this is done.')).toBeVisible();
  await page.waitForTimeout(3000);
  await expect(page.getByText('Saved in this browser.')).toHaveCount(0); // never claimed
  site.broken = () => false;
  await page.reload();
  await savedOffline(page);
  await disconnect();
  await page.goto(site.url + '/sign-in');
  await signIn(page);
  await expect(page.getByRole('article')).toHaveCount(10);
});

test('the records of the first start survive being closed in the middle of it', async () => {
  await page.goto(site.url + '/sign-in', { waitUntil: 'commit' });
  await page.waitForFunction(async () => (await indexedDB.databases()).length > 0);
  await ctx.close(); // while the fictional records are being made
  await open();
  await page.goto(site.url + '/sign-in');
  await signIn(page);
  await expect(page.getByRole('article')).toHaveCount(10);
});
