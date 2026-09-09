// Run with a question id printed by verify-deliberation.cjs. Uses local demo accounts only.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const questionId = process.argv[2];
if (!questionId?.startsWith('process-'))
	throw new Error('Pass a process-* integration fixture id.');
const output = path.join(require('node:os').tmpdir(), 'freedi-deliberation-browser');
fs.mkdirSync(output, { recursive: true });
(async () => {
	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	page.setDefaultTimeout(60000);
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	try {
		await page.route('**/*', (route) =>
			['localhost', '127.0.0.1', '[::1]'].includes(new URL(route.request().url()).hostname)
				? route.continue()
				: route.abort(),
		);
		await page.goto('http://localhost:5189/');
		await page.evaluate(async () => {
			const config = await import('/src/controllers/db/config.ts');
			const source = await (await fetch('/src/controllers/db/config.ts')).text();
			const sdk = await import(source.match(/from "([^"]*firebase_auth[^"]*)"/)[1]);
			await sdk.signInWithEmailAndPassword(
				config.auth,
				'redesign@example.test',
				'LocalPreview123!',
			);
		});
		await page.goto(`http://localhost:5189/statement/${questionId}?tab=covenant`);
		await page
			.getByRole('button', { name: 'Read, improve and evaluate in Sign' })
			.first()
			.waitFor();
		await page.screenshot({ path: path.join(output, 'main.png') });
		await page.getByRole('button', { name: 'Read, improve and evaluate in Sign' }).first().click();
		await page.waitForURL('http://localhost:3012/**');
		const support = page.getByRole('button', { name: 'Support this wording', exact: true });
		await support.waitFor();
		await page.locator('main [id^="paragraph-"]').first().waitFor();
		await support.click();
		await page.waitForFunction(() =>
			[...document.querySelectorAll('button')].some(
				(button) => button.textContent === 'Support this wording' && !button.disabled,
			),
		);
		await page.waitForFunction(() => document.querySelector('button[aria-pressed="true"]'));
		assert.equal(await page.getByRole('button', { name: 'Sign Document', exact: true }).count(), 0);
		await page.screenshot({ path: path.join(output, 'sign.png'), fullPage: true });
		await page.setViewportSize({ width: 390, height: 844 });
		await page.screenshot({ path: path.join(output, 'sign-mobile.png'), fullPage: true });
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2),
			false,
			'Sign mobile overflow',
		);
		await page.getByRole('link', { name: 'Back to the question', exact: false }).first().click();
		await page.waitForURL(`http://localhost:5189/statement/${questionId}?tab=covenant`);
		await page.evaluate(() =>
			localStorage.setItem('userConfig', JSON.stringify({ chosenLanguage: 'he' })),
		);
		await page.reload();
		await page.getByRole('heading', { name: 'האמנות שלנו' }).waitFor();
		await page.waitForTimeout(1500);
		await page.screenshot({ path: path.join(output, 'main-hebrew-mobile.png'), fullPage: true });
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2),
			false,
			'Main mobile overflow',
		);
		const dimensions = await page
			.getByRole('region', { name: 'משאלה לאמנה' })
			.evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth }));
		assert.ok(dimensions.scroll <= dimensions.width + 2, 'Agreement content overflow');
		assert.deepEqual(errors, []);
		console.log(
			'PASS: authenticated handoff, exact-wording evaluation, return link, Hebrew, mobile layout, no browser errors. Screenshots:',
			output,
		);
	} catch (error) {
		await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true });
		console.error(error.message, (await page.locator('body').innerText()).slice(0, 2400));
		process.exitCode = 1;
	} finally {
		await browser.close();
	}
})();
