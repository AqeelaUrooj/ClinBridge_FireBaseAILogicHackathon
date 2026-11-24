import { createServer, type Server } from 'node:http';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { unlockIfNeeded } from '../e2e/helpers';

/**
 * The judge build on a small server of its own, so a test can really take the website away (stop it) or put a newer
 * version there. It follows firebase.json: the same headers, unknown addresses open the app, a missing asset is a 404.
 */
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const hosting = (JSON.parse(readFileSync('firebase.json', 'utf8')) as { hosting: { headers: { source: string; headers: { key: string; value: string }[] }[] } }).hosting;

export class Site {
  readonly dir = mkdtempSync(join(tmpdir(), 'clinbridge-site-'));
  private server: Server | null = null;
  port = 0;
  /** Return true to break the connection instead of sending the file. */
  broken: (path: string) => boolean = () => false;

  constructor() { cpSync('dist-judge', this.dir, { recursive: true }); }
  get url() { return `http://localhost:${this.port}`; }

  async start() {
    this.server = createServer((req, res) => {
      const path = decodeURIComponent(new URL(req.url ?? '/', this.url).pathname);
      const asset = path.startsWith('/assets/');
      for (const h of hosting.headers) if (h.source === '**' || (asset && h.source === '/assets/**')) for (const x of h.headers) res.setHeader(x.key, x.value);
      if (this.broken(path)) { req.socket.destroy(); return; }
      let file = join(this.dir, path);
      if (!existsSync(file) || !statSync(file).isFile()) {
        if (asset) { res.statusCode = 404; res.end(); return; }
        file = join(this.dir, 'index.html');
      }
      res.setHeader('Content-Type', TYPES[extname(file)] ?? 'application/octet-stream');
      res.end(readFileSync(file));
    });
    await new Promise<void>((ok) => this.server!.listen(this.port, 'localhost', ok));
    this.port = (this.server.address() as { port: number }).port;
  }
  /** The website is gone: every request fails, as with no network. */
  async stop() {
    const s = this.server;
    this.server = null;
    if (!s) return;
    s.closeAllConnections();
    await new Promise((ok) => s.close(ok));
  }
  async dispose() { await this.stop(); rmSync(this.dir, { recursive: true, force: true }); }
}

/** A browser profile on disk: what a judge's Chrome keeps when the window is closed. */
export async function openProfile(dir: string, offline = false) {
  const ctx = await chromium.launchPersistentContext(dir, {
    ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}), viewport: { width: 1366, height: 768 }, offline,
  });
  await noRealCloud(ctx);
  return ctx;
}

/** Go to an address inside the running app (no page load, as with a link or the Back button). */
export const go = (page: Page, path: string) => page.evaluate((p) => { history.pushState({}, '', p); dispatchEvent(new PopStateEvent('popstate')); }, path);
export const pin = async (page: Page) => { for (const d of '2468') await page.getByRole('button', { name: d, exact: true }).click(); };
/** Unlock (if asked), choose a person, type the public Practice PIN. Starts on any page that shows the sign-in. */
export async function signIn(page: Page, who = /Daniel Okafor/) {
  await unlockIfNeeded(page);
  await page.getByRole('button', { name: who }).click();
  await pin(page);
  await expect(page).not.toHaveURL(/sign-in/);
}
export const savedOffline = (page: Page) => expect(page.getByText('Saved in this browser. It now opens without internet.')).toBeVisible({ timeout: 30_000 });
export async function openPatient(page: Page, id: string, path = '') {
  await go(page, `/patients/${id}${path}`);
  const yes = page.getByRole('button', { name: 'Yes, open' });
  await yes.click();
  await expect(yes).toHaveCount(0);
}
export async function recordPulse(page: Page, id: string, value: string) {
  await openPatient(page, id, '/vitals');
  await page.getByRole('link', { name: 'Record vitals' }).click();
  await page.getByLabel('Pulse').fill(value);
  await page.getByRole('button', { name: 'Review' }).click();
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Saved on this laptop.')).toBeVisible();
}
export const lastPulse = (page: Page) => page.getByRole('region', { name: 'Vitals flowsheet' }).locator('tbody tr').first().locator('[data-col="hr"]');
export async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Lock screen' }).click();
  await page.getByRole('button', { name: 'Switch user' }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
}

/** Nothing in these tests may reach a real Firebase project, also when the build has one. */
export const noRealCloud = (ctx: BrowserContext) => ctx.route(/googleapis\.com|google\.com|gstatic\.com/, (r) => r.abort());

/** Addresses outside the site and things the Content-Security-Policy refused. Both must stay empty. */
export function watch(page: Page) {
  const outside: string[] = [];
  const refused: string[] = [];
  page.on('request', (r) => { if (/^https?:/.test(r.url()) && new URL(r.url()).hostname !== 'localhost') outside.push(r.url()); });
  page.on('console', (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) refused.push(m.text()); });
  return { outside, refused };
}
