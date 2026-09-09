const output = require('node:path').join(
	require('node:os').tmpdir(),
	'freedi-covenant-verification',
);
require('node:fs').mkdirSync(output, { recursive: true });
let debugPage;
process.on('unhandledRejection', async (e) => {
	console.log('FAIL', e.message, debugPage?.url());
	if (debugPage) {
		if (await debugPage.getByText('Show Technical Details', { exact: true }).count())
			await debugPage.getByText('Show Technical Details', { exact: true }).click();
		console.log((await debugPage.locator('body').innerText()).slice(-3000));
		await debugPage.screenshot({ path: require('node:path').join(output, 'debug.png') });
	}
	process.exit(1);
});
const { chromium } = require('playwright');
(async () => {
	const browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	debugPage = page;
	const messageText = 'Try portable planters — ' + Date.now();
	const errors = [];
	page.on('pageerror', (e) => {
		errors.push(e.message);
		console.log('PAGEERROR', e.stack);
	});
	page.on('console', (m) => {
		if (m.type() === 'error') console.log('CONSOLE', m.text().slice(0, 1600));
	});
	await page.route('**/*', (route) => {
		const url = new URL(route.request().url());
		const host = url.hostname;
		return ['localhost', '127.0.0.1', '[::1]'].includes(host) ? route.continue() : route.abort();
	});
	await page.goto('http://localhost:5189/');
	await page.waitForTimeout(2500);
	await page.evaluate(async () => {
		const config = await import('/src/controllers/db/config.ts');
		const moduleText = await (await fetch('/src/controllers/db/config.ts')).text();
		const sdk = await import(moduleText.match(/from "([^"]*firebase_auth[^"]*)"/)[1]);
		await sdk.signInWithEmailAndPassword(config.auth, 'redesign@example.test', 'LocalPreview123!');
	});

	await page.goto('http://localhost:5189/statement/redesign-courtyard?tab=covenant');
	const workspace = page.getByRole('region', { name: 'Shared covenant' });
	await workspace.getByRole('heading', { name: 'Our covenant / אמנה' }).waitFor();
	if (
		await workspace
			.getByRole('button', { name: 'Reopen drafting for amendments', exact: true })
			.count()
	)
		await workspace
			.getByRole('button', { name: 'Reopen drafting for amendments', exact: true })
			.click();
	await workspace.getByLabel('Document title', { exact: true }).fill('Our courtyard agreement');
	await workspace.getByRole('button', { name: 'Save title', exact: true }).click();
	await workspace
		.getByRole('heading', { name: 'Bring solutions into the covenant', exact: true })
		.waitFor();
	if (
		await workspace.getByRole('button', { name: /Try a small garden corner for a month/ }).count()
	)
		await workspace
			.getByRole('button', { name: /Try a small garden corner for a month/ })
			.first()
			.click();
	await workspace.getByRole('link', { name: 'Source solution ↗', exact: true }).waitFor();
	await workspace.getByText('Comment or suggest wording', { exact: true }).first().click();
	await workspace
		.getByLabel('Your comment', { exact: true })
		.fill('Please include a backup volunteer.');
	await workspace
		.getByLabel('Suggested wording (optional)', { exact: true })
		.fill('Try a small garden with a care rota and a backup volunteer.');
	await workspace.getByRole('button', { name: 'Save comment', exact: true }).click();
	await workspace.getByRole('button', { name: 'Accept amendment', exact: true }).click();
	await workspace.getByRole('checkbox').first().check();
	await workspace.getByRole('button', { name: 'Open review', exact: true }).click();
	await workspace.getByLabel('Your position', { exact: true }).selectOption('endorse');
	await workspace.getByRole('button', { name: 'Record my position', exact: true }).click();
	await workspace.getByRole('button', { name: 'Record adoption', exact: true }).click();
	await workspace.getByText('Adoption recorded for this exact version.', { exact: true }).waitFor();
	await page.reload();
	await workspace.getByText('Adoption recorded for this exact version.', { exact: true }).waitFor();
	const download = page.waitForEvent('download');
	await workspace.getByRole('button', { name: 'Export document', exact: true }).click();
	await (await download).saveAs(require('node:path').join(output, 'covenant.md'));
	await page.screenshot({ path: require('node:path').join(output, 'app-covenant.png') });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.screenshot({ path: require('node:path').join(output, 'mobile.png') });
	if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2))
		throw new Error('Mobile horizontal overflow');
	await page.evaluate(() =>
		localStorage.setItem('userConfig', JSON.stringify({ chosenLanguage: 'he' })),
	);
	await page.reload();
	await page.getByRole('region', { name: 'אמנה משותפת' }).waitFor();
	await page.screenshot({ path: require('node:path').join(output, 'hebrew.png') });
	require('node:assert/strict').deepEqual(errors, []);
	console.log(JSON.stringify({ errors }));
	console.log(
		'PASS real full app: source clause, collaborative amendment, chosen review group, position, adoption, reload and export',
	);
	await browser.close();
})();
