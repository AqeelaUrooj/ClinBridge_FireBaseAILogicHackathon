import { expect, test, type Page } from '@playwright/test';
import { unlockIfNeeded, unlockPractice } from './helpers';

/**
 * `/` is the public page for visitors and the right dashboard for signed-in staff. Fictional Practice data only.
 * A session is only in memory: a full page load always starts signed out, by design.
 */
const HOME = 'http://localhost:4173/';
const landing = (page: Page) => page.getByRole('heading', { level: 1, name: /When the EHR goes down/ });
const demo = (page: Page) => page.getByRole('main').getByRole('link', { name: /Launch Practice Demo/ }).first();

/** Go to an address inside the running app (no page load, as with a link or the Back button). */
const go = (page: Page, path: string) => page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path);
/** The public Practice PIN. */
const enterPin = async (page: Page) => { for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click(); };
async function signIn(page: Page, who: RegExp) {
  await page.goto('/sign-in');
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  await enterPin(page);
  await expect(page).not.toHaveURL(/sign-in/);
}

test('visitor: / is the public page and opens no records, clinical code or outside address', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (r) => requests.push(r.url()));
  await page.addInitScript(() => {
    const opened: string[] = [];
    Object.assign(window, { opened });
    const open = indexedDB.open.bind(indexedDB);
    indexedDB.open = (name: string, version?: number) => { opened.push(name); return open(name, version); };
  });
  const opened = () => page.evaluate(() => (window as unknown as { opened: string[] }).opened);
  const clinicalCode = () => page.evaluate(() => performance.getEntriesByType('resource')
    .filter((e) => ['script', 'link'].includes((e as PerformanceResourceTiming).initiatorType) && /ClinicalApplication/.test(e.name)).map((e) => e.name));
  await page.goto('/');
  await expect(landing(page)).toBeVisible();
  await expect(page).toHaveURL(HOME);
  await expect(page.locator('body')).not.toContainText(/Daniel Okafor|Kim Ellis|Lena Ortiz|MRN \d|DT-4W-01|Who are you/);
  expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).toEqual([]);
  expect(await opened()).toEqual([]);
  expect(await clinicalCode()).toEqual([]);

  // Records that already exist on this laptop stay closed as well, whichever data set was used last.
  await signIn(page, /Daniel Okafor/);
  await expect(page.getByRole('article')).toHaveCount(10);
  expect(await opened()).not.toEqual([]); // the check itself works
  for (const dataset of ['practice', 'live']) {
    await page.evaluate((d) => localStorage.setItem('dtk.dataset', d), dataset);
    await page.goto('/');
    await expect(landing(page)).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(await opened(), dataset).toEqual([]);
    expect(await clinicalCode(), dataset).toEqual([]);
    await expect(page.locator('body')).not.toContainText(/Okafor|MRN \d|Unlock records/);
  }
  expect(requests.filter((u) => !/^(data|blob):/.test(u) && new URL(u).origin !== new URL(HOME).origin)).toEqual([]);
});

test('visitor: section links stay on /, and reload and /landing show the same page', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Public navigation' }).getByRole('link', { name: 'FAQ', exact: true }).click();
  await expect(page).toHaveURL(HOME + '#faq');
  await expect(landing(page)).toHaveCount(1);
  await page.reload();
  await expect(landing(page)).toHaveCount(1);
  await page.goto('/landing');
  await expect(landing(page)).toBeVisible();
  await expect(page).toHaveURL(/\/landing$/);
  await page.reload();
  await expect(landing(page)).toBeVisible();
});

test('visitor, Launch Practice Demo, PIN, ward board; Back does not sign the nurse out', async ({ page }) => {
  await page.goto('/');
  await demo(page).click();
  await expect(page).toHaveURL(/\/sign-in\?demo=practice$/);
  await unlockIfNeeded(page);
  await page.goBack(); // not signed in yet: Back is the public page again
  await expect(landing(page)).toBeVisible();
  await demo(page).click();
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  await expect(page.getByRole('heading', { name: /Enter your PIN/ })).toBeVisible();
  await enterPin(page);
  await expect(page).toHaveURL(/\/ward$/);
  await expect(page.getByRole('article')).toHaveCount(10);
  await page.goBack();
  await expect(page).toHaveURL(/\/ward$/);
  await expect(page.getByRole('article')).toHaveCount(10);
  await expect(landing(page)).toHaveCount(0);
});

test('nurse: / goes to the ward board without a new sign-in; /admin stays refused', async ({ page }) => {
  await signIn(page, /Daniel Okafor/);
  for (const from of ['/handover', '/spooler', '/export', '/admin']) {
    await go(page, from);
    await expect(page).toHaveURL(new RegExp(from + '$'));
    if (from === '/admin') await expect(page.getByText('Admins only.')).toBeVisible();
    await go(page, '/');
    await expect(page).toHaveURL(/\/ward$/);
    await expect(page.getByRole('article')).toHaveCount(10);
    await expect(landing(page)).toHaveCount(0);
  }
  await go(page, '/patients/pt-02'); // the patient check is still asked
  await expect(page.getByRole('button', { name: 'Yes, open' })).toBeVisible();
});

test('admin: / goes to the admin pages', async ({ page }) => {
  await signIn(page, /Kim Ellis/);
  await go(page, '/more');
  await go(page, '/');
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Admin', exact: true })).toBeVisible();
  await expect(page.getByText('Admins only.')).toHaveCount(0);
  await expect(landing(page)).toHaveCount(0);
});

for (const [who, home] of [[/Daniel Okafor/, '/ward'], [/Kim Ellis/, '/admin']] as const) {
  test(`locked screen: / stays locked until the PIN, then ${home}`, async ({ page }) => {
    await signIn(page, who);
    await page.getByRole('button', { name: 'Lock screen' }).click();
    const locked = page.getByRole('heading', { name: 'Screen locked' });
    await expect(locked).toBeVisible();
    for (const path of ['/', home, '/patients/pt-02', '/']) {
      await go(page, path);
      await expect(page).toHaveURL(/\/lock$/);
      await expect(locked).toBeVisible();
      await expect(landing(page)).toHaveCount(0);
      await expect(page.getByRole('article')).toHaveCount(0);
    }
    for (const d of '1111') await page.getByRole('button', { name: d, exact: true }).click(); // a wrong PIN opens nothing
    await go(page, '/');
    await expect(locked).toBeVisible();
    await enterPin(page);
    await expect(page).toHaveURL(new RegExp(home + '$'));
    await expect(locked).toHaveCount(0);
  });
}

test('after Switch user, Lock records or a page load, / is public and the records still need their unlock', async ({ page }) => {
  const unlock = page.getByRole('heading', { name: 'Unlock records on this laptop' });
  await signIn(page, /Daniel Okafor/);
  await page.getByRole('button', { name: 'Lock screen' }).click();
  await page.getByRole('button', { name: 'Switch user' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await go(page, '/');
  await expect(landing(page)).toBeVisible();
  await go(page, '/ward');
  await unlockPractice(page);
  await expect(page).toHaveURL(/\/sign-in$/);

  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  await enterPin(page);
  await expect(page).toHaveURL(/\/ward$/);
  await go(page, '/more');
  await page.getByRole('button', { name: /Lock records/ }).click();
  await expect(unlock).toBeVisible();
  await go(page, '/');
  await expect(landing(page)).toBeVisible();
  await go(page, '/ward');
  await expect(unlock).toBeVisible();

  // The session is in memory only: a page load ends it, and nothing is restored.
  await signIn(page, /Daniel Okafor/);
  await page.goto('/');
  await expect(landing(page)).toBeVisible();
  await page.goto('/ward');
  await unlockPractice(page);
  await expect(page).toHaveURL(/\/sign-in$/);
});

for (const route of ['/ward', '/admin', '/patients/pt-01', '/export', '/spooler']) {
  test(`visitor: ${route} by address and after a refresh asks for sign-in, never the public page`, async ({ page }) => {
    for (const load of [() => page.goto(route), () => page.reload()]) {
      await load();
      await unlockIfNeeded(page);
      await expect(page).toHaveURL(/\/sign-in$/);
      await expect(page.getByRole('heading', { name: /Who are you\?/ })).toBeVisible();
      await expect(landing(page)).toHaveCount(0);
    }
  });
}

test('offline: / and /landing reload, Practice sign-in works, protected pages stay closed', async ({ page, context }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!navigator.serviceWorker.controller);
  await context.setOffline(true);
  for (const path of ['/', '/landing', '/']) {
    await page.goto(path);
    await expect(landing(page)).toBeVisible();
    await page.reload();
    await expect(landing(page)).toBeVisible();
    await expect.poll(() => page.locator('.lp-photo img').evaluateAll((x) => x.length === 4
      && x.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0))).toBe(true);
  }
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  await page.goto('/ward');
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.goto('/');
  await demo(page).click();
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: /Daniel Okafor/ }).click();
  await enterPin(page);
  await expect(page).toHaveURL(/\/ward$/);
  await expect(page.getByRole('article')).toHaveCount(10);
  await go(page, '/');
  await expect(page).toHaveURL(/\/ward$/);
});

test('the installed app still opens at sign-in, under the same app id', async ({ request }) => {
  const m = await (await request.get('/manifest.webmanifest')).json() as { id: string; start_url: string };
  expect(m).toMatchObject({ id: '/', start_url: '/sign-in' });
});
