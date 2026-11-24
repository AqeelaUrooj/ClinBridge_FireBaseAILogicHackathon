// Draws the PNG app icons from public/icon.svg (ClinBridge's own mark). Run: node scripts/make-icons.mjs
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync('public/icon.svg', 'utf8');
const NAVY = '#1c2536';
const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});

/** `scale` is the share of the picture the mark fills; a maskable icon is cut to a circle of 80 %, so it stays inside. */
async function draw(file, size, scale, background) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;width:${size}px;height:${size}px;display:grid;place-items:center;background:${background}">
    <img style="width:${size * scale}px;height:${size * scale}px" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body>`);
  await page.locator('img').evaluate((i) => i.decode());
  await page.screenshot({ path: `public/${file}`, omitBackground: true });
  await page.close();
}

await draw('icon-192.png', 192, 1, 'transparent');
await draw('icon-512.png', 512, 1, 'transparent');
await draw('icon-maskable-512.png', 512, 0.8, NAVY);
await draw('apple-touch-icon.png', 180, 1, NAVY);
await browser.close();
