/**
 * The boot guard: a module that fails to load ends in a screen that says so,
 * and a runtime crash ends in a banner — never a blank page.
 *
 *   npx tsx scripts/e2e-boot-fallback.mjs
 */
import { chromium } from 'playwright';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { eq, mkPage, step } from './lib/e2e.mjs';

await preflight({ needs: ['vite'], quiet: true });
const browser = await chromium.launch();
try {
	step('a module that does not provide an export → the fallback screen, not a blank page');
	const broken = await mkPage(browser, 'broken', { width: 430, height: 900 });
	await broken.route('**/packages/shared-types/dist/esm/index.js', (route) =>
		route.fulfill({
			contentType: 'application/javascript',
			body: 'export const nothingHere = 1;\n',
		}),
	);
	await broken.goto(`${VITE_HOST}/#!/`, { waitUntil: 'domcontentloaded' });
	await broken.waitForSelector('#agora-boot-fallback', { timeout: 25_000 });
	const text = await broken.locator('#agora-boot-fallback').innerText();
	eq(
		'the fallback names the problem',
		/does not provide|SyntaxError|did not start/.test(text),
		true,
	);
	eq('it offers a reload', await broken.locator('#agora-boot-reload').count(), 1);
	eq(
		'the error was stashed for the app to report',
		await broken.evaluate(() => window.__agoraEarlyErrors.length > 0),
		true,
	);
	await broken.close();

	step('a healthy load → no fallback; a runtime throw → the banner with a reload');
	const page = await mkPage(browser, 'healthy', { width: 430, height: 900 });
	await page.goto(`${VITE_HOST}/#!/`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.__agoraBooted === true, null, { timeout: 25_000 });
	eq('no fallback on a healthy boot', await page.locator('#agora-boot-fallback').count(), 0);
	await page.evaluate(() => {
		setTimeout(() => {
			throw new Error('boom from a timer');
		}, 0);
	});
	await page.waitForSelector('.boot-banner', { timeout: 10_000 });
	eq(
		'the banner carries the message',
		(await page.locator('.boot-banner__detail').innerText()).includes('boom from a timer'),
		true,
	);
	await page.evaluate(() => {
		void Promise.reject(new Error('rejected and forgotten'));
	});
	await page.waitForFunction(
		() =>
			document
				.querySelector('.boot-banner__detail')
				?.textContent?.includes('rejected and forgotten'),
		null,
		{ timeout: 10_000 },
	);
	eq('an unhandled rejection is shown too', true, true);
	console.log('\n   all green');
} finally {
	await browser.close();
}
