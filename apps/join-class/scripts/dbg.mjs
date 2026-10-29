import { chromium } from '@playwright/test';
import { BASE_URL as BASE } from './e2e-env.mjs';
import { signInTeacher } from './e2e-auth.mjs';

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1100, height: 900 }, locale: 'he-IL' })).newPage();
page.on('console', (m) => console.info('console', m.type(), m.text().slice(0, 300)));
await signInTeacher(page, BASE, `dbg-${Date.now()}`);
await page.goto(`${BASE}/t`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#teacher-new-title', { timeout: 15000 });
await page.fill('#teacher-new-title', 'x plan');
await page.click('.teacher-home__form button[type=submit]');
await new Promise((r) => setTimeout(r, 5000));
console.info(page.url());
console.info(await page.locator('.teacher-home__error').allInnerTexts());
await browser.close();
