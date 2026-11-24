// Release check of the public judge build (dist-judge). Run: npm run check:judge. Also runs before every Hosting deploy.
// It prints names and yes/no only, never a configuration value.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dir = process.argv[2] ?? 'dist-judge';
const problems = [];
const need = (ok, text) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${text}`); if (!ok) problems.push(text); };

if (!existsSync(dir)) { console.error(`${dir} is missing. Run: npm run build:judge`); process.exit(1); }
const files = readdirSync(dir, { recursive: true }).map((f) => join(dir, String(f))).filter((f) => statSync(f).isFile());
const name = (f) => relative(dir, f).replaceAll('\\', '/');
const text = files.filter((f) => /\.(js|html|css|json|webmanifest|txt)$/.test(f)).map((f) => [name(f), readFileSync(f, 'utf8')]);
const has = (re, only = /./) => text.filter(([n, s]) => only.test(n) && re.test(s)).map(([n]) => n);

// What must not be in a public build
need(!files.some((f) => /\.map$|(^|[\\/])\.|\.pem$|\.env/.test(name(f))), 'no source maps, hidden files or key files');
need(!has(/sourceMappingURL=/, /\.(js|css)$/).length, 'no link to a source map');
need(!has(/-----BEGIN [A-Z ]*PRIVATE KEY|"type":\s*"service_account"|"private_key_id"|"client_secret"/).length, 'no private key, service account or client secret');
need(!has(/APPCHECK_DEBUG["']?\s*:\s*["'`]true/).length, 'App Check debug switch is off');
const appCheckToken = /[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;
need(!has(appCheckToken, /\.js$/).length, 'no token in the shape of an App Check debug token');
need(!has(/FIREBASE_APPCHECK_DEBUG_TOKEN\s*=\s*!0/).length, 'nothing switches the App Check debug provider on');
need(!has(/localhost:\d{4}|127\.0\.0\.1:\d+/, /ClinicalApplication|^assets\/index/).length, 'no development address in the app code');

// Practice only
need(has(/ClinBridge Practice/, /webmanifest$/).length === 1, 'the manifest says ClinBridge Practice');
need(!has(/Create admin and encrypt|Restore from encrypted backup|Join and encrypt/, /\.js$/).length, 'first-time setup of Real records is not in the code');
need(has(/The public demo has fictional Practice records only/, /\.js$/).length > 0, 'the database layer refuses Real records');

// Complete for installation and offline use
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.webmanifest'), 'utf8'));
need(manifest.start_url === '/sign-in' && manifest.scope === '/' && manifest.id === '/' && manifest.display === 'standalone', 'start at /sign-in, scope /, id /, standalone');
for (const icon of manifest.icons) {
  const file = join(dir, icon.src);
  const png = existsSync(file) && icon.type === 'image/png' ? readFileSync(file) : null;
  const size = png ? `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}` : icon.sizes;
  need(existsSync(file) && size === icon.sizes, `icon ${icon.src} is ${icon.sizes} (${icon.purpose})`);
}
const sw = readFileSync(join(dir, 'sw.js'), 'utf8');
// .woff: only for browsers without woff2, which cannot install the app either.
const missing = files.map(name).filter((f) => !/^(sw\.js|workbox-.*\.js|third-party-licenses\.txt|.*\.woff)$/.test(f) && !sw.includes(`"${f}"`));
need(missing.length === 0, `every file is stored for offline use${missing.length ? `: missing ${missing.join(', ')}` : ''}`);
// The worker may only skip waiting when a page asks for it (no page does): a top-level call would reload open windows.
need((sw.match(/skipWaiting\(/g) ?? []).length === 1 && /"SKIP_WAITING"===\w+\.data\.type&&self\.skipWaiting\(/.test(sw), 'a new version waits for the windows to close');
need(existsSync(join(dir, 'third-party-licenses.txt')) && /SIL OPEN FONT LICENSE/i.test(readFileSync(join(dir, 'third-party-licenses.txt'), 'utf8')), 'license texts of fonts and code are included');
// Addresses outside this site: scripts, styles, fonts and pictures must all be local.
need(!/(src|href)="(https?:)?\/\//.test(readFileSync(join(dir, 'index.html'), 'utf8')) && !has(/url\((["']?)https?:|@import\s+["']?https?:/, /\.css$/).length, 'no outside file in the page or the styles');

const all = text.map(([, s]) => s).join('\n');
const set = (k) => new RegExp(`${k}["']?\\s*:\\s*["'\`][^"'\`]+["'\`]`).test(all);
need(!set('VITE_FIREBASE_API_KEY') || existsSync('hosting/.env.local') || !!process.env.VITE_FIREBASE_API_KEY, 'AI configuration comes only from hosting/.env.local, never from a developer\'s .env.local');
console.log(`info AI configuration in this build (names only): ${['API_KEY', 'PROJECT_ID', 'APP_ID', 'APPCHECK_SITE_KEY'].map((k) => `${k} ${set(`VITE_FIREBASE_${k}`) ? 'set' : 'not set'}`).join(', ')}`);
console.log(`info ${files.length} files, ${(files.reduce((n, f) => n + statSync(f).size, 0) / 1048576).toFixed(1)} MB`);
if (problems.length) { console.error(`\n${problems.length} problem(s). Do not publish this build.`); process.exit(1); }
