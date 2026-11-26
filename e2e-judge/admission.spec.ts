import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlockPractice } from '../e2e/helpers';
import { go, lastPulse, openPatient, openProfile, recordPulse, savedOffline, signIn, signOut, Site, watch } from './site';

/**
 * The admission lifecycle in the public judge build, with the website really taken away (server stopped, browser
 * offline): admission staff register, a nurse charts, a provisional patient during System Down, transfer, discharge,
 * restart, clearance, recovery with identity reconciliation, FHIR file. Fictional data only, no AI.
 */
test.use({ trace: 'off' });
let site: Site;
let profile: string;
let ctx: BrowserContext;
let page: Page;
test.beforeEach(async () => {
  site = new Site();
  await site.start();
  profile = mkdtempSync(join(tmpdir(), 'clinbridge-adm-'));
  ctx = await openProfile(profile);
  page = ctx.pages()[0] ?? await ctx.newPage();
});
test.afterEach(async () => {
  await ctx.close().catch(() => undefined);
  await site.dispose();
  rmSync(profile, { recursive: true, force: true });
});

const shot = (name: string) => page.screenshot({ path: test.info().outputPath('screens', `${name}.png`), fullPage: true });
const choose = async (label: string | RegExp, index = 1) => {
  const sel = page.getByLabel(label);
  await sel.selectOption({ index });
  return sel.inputValue();
};
async function register(button: RegExp) {
  await page.getByRole('link', { name: button }).first().click();
  await expect(page.getByRole('heading', { name: button })).toBeVisible();
  await page.getByRole('button', { name: 'Generate another fictional identity' }).click();
  if (await page.getByLabel('Admission type').inputValue() === '') await choose('Admission type');
  await choose('Admission reason (practice list)');
  const bed = await choose(/^Bed on /);
  await page.getByRole('radio', { name: 'No known allergies' }).check();
  await page.getByRole('button', { name: 'Review registration' }).click();
  await expect(page.getByRole('region', { name: 'Check before saving' })).toContainText(`bed ${bed}`);
  await page.getByRole('button', { name: 'Save registration' }).click();
  const done = page.getByRole('status').filter({ hasText: 'is registered' });
  await expect(done).toBeVisible();
  const text = (await done.innerText()).replace('check_circle', '').trim(); // the icon is a ligature: its name is text
  return { bed, tempId: /Temporary ID (PX-\d{6})/.exec(text)![1]!, name: /^(.*) is registered/.exec(text)![1]!.trim() };
}
const cardOf = (name: string) => page.getByRole('article', { name: new RegExp(name) });
async function idOf(name: string) {
  const id = await cardOf(name).getAttribute('data-testid');
  return id!.replace('ward-card-', '');
}

test('admission to discharge, offline, with recovery and the FHIR file', async () => {
  test.setTimeout(300_000);
  await page.goto(site.url);
  await savedOffline(page);
  await site.stop();
  await ctx.setOffline(true); // from here on there is no network at all
  let seen = watch(page);
  await page.getByRole('main').getByRole('link', { name: /Launch Practice Demo/ }).first().click();

  // 1. Admission staff register a fictional patient and assign a free bed
  await signIn(page, /Leila Marquez/);
  await expect(page).toHaveURL(/\/admission$/);
  await expect(page.getByRole('heading', { name: 'Admissions and beds' })).toBeVisible();
  const a = await register(/Register Practice Patient/);
  expect(a.tempId).toBe('PX-000001');
  await shot('1-registered');
  for (const path of ['/ward', '/patients/pt-01', '/admin', '/recovery']) { // least privilege: typed addresses too
    await go(page, path);
    await expect(page).toHaveURL(/\/admission$/);
  }
  await signOut(page);

  // 2. A nurse finds the new patient, checks the identity and charts
  await signIn(page);
  await expect(page.getByRole('article')).toHaveCount(11);
  await page.getByPlaceholder('Search bed, name, MRN…').fill('PX-000001');
  await expect(page.getByRole('article')).toHaveCount(1);
  const aId = await idOf(a.name);
  await page.getByTestId(`patient-${aId}`).click();
  const check = page.getByRole('dialog', { name: 'Is this the right patient?' });
  await expect(check).toContainText('Temporary ID');
  await expect(check).toContainText('PX-000001');
  await check.getByRole('button', { name: 'No, go back' }).click();
  await recordPulse(page, aId, '88'); // opens through the patient check
  await expect(page.getByRole('region', { name: 'Patient' })).toContainText('Registered here');
  await expect(lastPulse(page)).toContainText('88');
  await signOut(page);

  // 3. System Down; another fictional patient arrives; the nurse registers a provisional record
  await signIn(page, /Kim Ellis/);
  await go(page, '/admin/downtime');
  await page.getByRole('button', { name: 'Start a practice outage' }).click();
  await expect(page.getByRole('heading', { name: 'Now: System down' })).toBeVisible();
  await signOut(page);
  await signIn(page);
  const b = await register(/Add Provisional Practice Patient/);
  expect(b.tempId).toBe('PX-000002');
  await page.getByRole('link', { name: 'Open nursing record' }).click();
  const check2 = page.getByRole('dialog', { name: 'Is this the right patient?' });
  await expect(check2).toContainText('Provisional identity registered during downtime');
  const bId = /\/patients\/([^/?]+)/.exec(page.url())![1]!;
  await check2.getByRole('button', { name: 'No, go back' }).click();
  await recordPulse(page, bId, '90');
  await expect(page.getByRole('region', { name: 'Patient' })).toContainText('Provisional');

  // 4. Transfer of the provisional patient (nurse, stay page)
  await go(page, `/patients/${bId}/stay`);
  await page.getByRole('button', { name: 'Record a transfer' }).click();
  const tf = page.getByRole('group', { name: 'Record a transfer' });
  const newBed = await tf.getByLabel('New bed').selectOption({ index: 1 }).then((v) => v[0]!);
  await tf.getByLabel('Reason').selectOption({ index: 1 });
  await tf.getByRole('checkbox').check();
  await tf.getByRole('button', { name: 'Save transfer' }).click();
  await expect(page.getByRole('status').filter({ hasText: `now in bed ${newBed}` })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Location history' }).getByRole('listitem')).toHaveCount(2);
  await shot('2-transfer');
  await signOut(page);

  // 5. Discharge of the first patient (admission staff): outstanding items reviewed, bed released
  await signIn(page, /Leila Marquez/);
  await go(page, `/admission/patients/${aId}`);
  await page.getByRole('button', { name: 'Record a discharge' }).click();
  const df = page.getByRole('group', { name: 'Record a discharge' });
  await df.getByLabel('Destination').selectOption('Home');
  await df.getByLabel('Reason (practice)').selectOption({ index: 1 });
  await expect(df.getByRole('region', { name: 'Outstanding documentation' })).toContainText('No draft records waiting');
  await df.getByRole('checkbox', { name: /decided by the responsible team/ }).check();
  await df.getByRole('button', { name: 'Save discharge' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Discharge recorded' })).toBeVisible();
  await go(page, '/admission');
  await expect(page.getByRole('list', { name: 'Beds' })).toContainText(`${a.bed}Free`);
  await shot('3-discharged');
  expect(seen).toEqual({ outside: [], refused: [] });

  // 6. The laptop restarts with no network: everything is still there
  await ctx.close();
  ctx = await openProfile(profile, true);
  page = ctx.pages()[0] ?? await ctx.newPage();
  seen = watch(page);
  await page.goto(site.url + '/sign-in').catch(() => undefined);
  await unlockPractice(page);
  await signIn(page);
  await expect(page.getByRole('article')).toHaveCount(11); // 10 + provisional; the discharged patient is not in a bed
  await page.getByRole('group', { name: 'Filter' }).getByRole('button', { name: /^Discharged/ }).click();
  await expect(page.getByRole('article')).toHaveCount(1);
  await openPatient(page, aId, '/vitals');
  await expect(lastPulse(page)).toContainText('88');
  await expect(page.getByText('Records are read only; new records for this stay are refused.')).toBeVisible();
  await signOut(page);

  // 7. Network back, clearance, recovery: the provisional identity is first and is reconciled by a person
  await site.start();
  await ctx.setOffline(false);
  await signIn(page, /Kim Ellis/);
  await go(page, '/admin/downtime');
  const gate = page.getByRole('region', { name: 'Network clearance', exact: true });
  for (const t of ['IT / security team says', 'EHR team says', 'Downtime lead approved']) await gate.getByRole('checkbox', { name: new RegExp(t) }).check();
  for (const d of '2468') await gate.getByRole('button', { name: d, exact: true }).click();
  await gate.getByRole('button', { name: /Clear network/ }).click();
  await expect(page.getByRole('heading', { name: 'Now: Back online' })).toBeVisible();
  await go(page, '/recovery');
  await page.getByRole('button', { name: 'Add new downtime records' }).click();
  await expect(page.getByText(/new items added/)).toBeVisible();
  const first = page.getByRole('list').getByRole('link').filter({ hasText: b.name }).filter({ hasText: 'Admission and identity' }).first();
  await first.click();
  await expect(page.getByRole('note', { name: 'Identity reconciliation' })).toContainText('Temporary ID PX-000002');
  await expect(page.getByRole('note', { name: 'Identity reconciliation' })).toContainText('never merges patients');
  await shot('4-recovery');
  await signOut(page);
  await signIn(page);
  await openPatient(page, bId, '/stay');
  await page.getByRole('button', { name: 'Identity reconciliation' }).click();
  const idf = page.getByRole('group', { name: 'Identity reconciliation' });
  await idf.getByLabel('New status').selectOption('reconciled');
  await idf.getByLabel('What was checked').selectOption('Matched to a hospital record by admissions (practice)');
  await idf.getByRole('button', { name: 'Save identity step' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Recorded as reconciled' })).toBeVisible();
  await signOut(page);

  // 8. FHIR file: temporary identifiers in their own namespace, finished stay with its period, transfer history
  await signIn(page, /Kim Ellis/);
  await go(page, '/export');
  await page.getByRole('button', { name: 'Prepare export file' }).click();
  await expect(page.getByTestId('export-summary')).toContainText('resources in the file');
  await page.getByLabel('I understand this file is sensitive and not encrypted').check();
  const [file] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download file' }).click()]);
  const bundle = JSON.parse(readFileSync(await file.path(), 'utf8')) as { entry: { resource: Record<string, any> }[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
  const res = bundle.entry.map((e) => e.resource);
  const patA = res.find((r) => r.resourceType === 'Patient' && r.id === aId)!;
  expect(patA.identifier[0]).toMatchObject({ use: 'temp', value: 'PX-000001' });
  const encA = res.find((r) => r.resourceType === 'Encounter' && r.subject.reference === `Patient/${aId}`)!;
  expect(encA.status).toBe('finished');
  expect(encA.period.end).toBeTruthy();
  const encB = res.find((r) => r.resourceType === 'Encounter' && r.subject.reference === `Patient/${bId}`)!;
  expect(encB.status).toBe('in-progress');
  expect(encB.location.map((l: { status: string }) => l.status)).toEqual(['completed', 'active']);
  await expect(page.getByRole('main')).not.toContainText(/synced|synchroni[sz]ed with|sent to the EHR/i);
  expect(seen.refused).toEqual([]);
});

test('LPN cannot register, transfer or discharge; admission staff cannot chart', async () => {
  await page.goto(site.url + '/sign-in');
  await signIn(page, /Sara Whitfield/);
  await go(page, '/ward/register');
  await expect(page).toHaveURL(/\/ward$/);
  await expect(page.getByRole('link', { name: /Add Provisional Practice Patient/ })).toHaveCount(0);
  await openPatient(page, 'pt-01', '/stay');
  await expect(page.getByRole('button', { name: 'Record a transfer' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Record a discharge' })).toHaveCount(0);
  await signOut(page);
  await signIn(page, /Leila Marquez/);
  await go(page, '/patients/pt-01/vitals/record');
  await expect(page).toHaveURL(/\/admission$/);
  await go(page, '/admission/patients/pt-01');
  await expect(page.getByRole('region', { name: 'Admission record' })).toContainText('Nursing records are not shown to admission staff');
  await expect(page.getByRole('main')).not.toContainText(/Pulse|NIBP|Medication record/);
});
