import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));

await page.goto('http://localhost:3009/#!/teach', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', { timeout: 10000 });
await page.evaluate(() => window.__agoraDevSignIn({ sub: 'author-teacher', email: 'author@example.com', name: 'Author Teacher' }));
await page.waitForTimeout(1500);

// New journey → wizard
await page.goto('http://localhost:3009/#!/teach/new', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('input.text-input', { timeout: 10000 });
await page.locator('input.text-input').fill('המהפכה התעשייתית באנגליה');
await page.locator('button.btn--primary').click();
console.log('GENERATING (real AI, up to 3 min)...');
await page.waitForURL(/\/teach\/topic\//, { timeout: 300000 });
console.log('EDITOR URL:', page.url().split('#!')[1]);

// Editor loads the generated package
await page.waitForSelector('h3', { timeout: 15000 });
const title = await page.locator('input.code-input').inputValue();
console.log('GENERATED TITLE:', title);
const charNames = await page.locator('.editor__field input.text-input').evaluateAll(
	(els) => els.filter((_, i) => i % 2 === 0).map((el) => el.value)
);
console.log('CHARACTERS:', charNames.slice(0, 2));
const framing = await page.locator('textarea.text-input').first().inputValue();
console.log('FRAMING:', framing.slice(0, 120));

// Edit the title, save, mark ready
await page.locator('input.code-input').fill(title + ' ✦');
await page.getByRole('button', { name: /Save|שמירה/i }).click();
await page.waitForSelector('text=/Saved|נשמר/', { timeout: 10000 });
await page.getByRole('button', { name: /ready|מוכן/i }).click();
await page.waitForSelector('text=/Ready|מוכן$/', { timeout: 10000 });
console.log('MARKED READY');

// Back at teacher home the new package is listed and selectable
await page.goto('http://localhost:3009/#!/teach', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.teacher__topic-option', { timeout: 10000 });
const topics = await page.locator('.teacher__topic-option strong').allTextContents();
console.log('TOPIC LIST:', topics);
await page.screenshot({ path: 'agora-authoring.png', fullPage: true });

console.log('PAGE ERRORS:', errs.length ? errs : 'none');
await browser.close();
console.log('E2E AUTHORING COMPLETE');
