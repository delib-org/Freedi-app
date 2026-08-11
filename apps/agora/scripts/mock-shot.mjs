/* Shoots the deliberation design simulation (mock/delib-mock.html).
 * Fast loop: edit the mock CSS, re-run, look. No emulators, no game run.
 * Run: node scripts/mock-shot.mjs [outFile]
 */
import { chromium } from '@playwright/test';

const OUT = process.argv[2] ?? 'mock/shot.png';
const browser = await chromium.launch();
const page = await browser.newPage({
	viewport: { width: 960, height: 960 },
	deviceScaleFactor: 2,
});
page.on('pageerror', (e) => console.log('PAGEERROR', e.message.slice(0, 200)));
await page.goto('http://localhost:3009/mock/delib-mock.html', { waitUntil: 'load' });
await page.waitForTimeout(900); // webfonts
await page.locator('.stage').screenshot({ path: OUT });
// ...and each phone on its own, for reading detail
const phones = page.locator('.phone');
for (let i = 0; i < (await phones.count()); i++) {
	await phones.nth(i).screenshot({ path: OUT.replace(/\.png$/, `-${i + 1}.png`) });
}
console.log('→', OUT);
await browser.close();
