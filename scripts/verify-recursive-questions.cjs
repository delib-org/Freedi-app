const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('http://127.0.0.1:5187/redesign.html?view=courtyard');
	await page.getByRole('heading', { name: 'Solutions to this question · 5' }).waitFor();
	await page.screenshot({ path: '/tmp/freedi-recursive/root.png' });
	await page
		.getByRole('button', {
			name: 'Explore question: How will we care for the garden? ↗',
			exact: true,
		})
		.click();
	await page.getByRole('heading', { name: 'Solutions to this question · 1' }).waitFor();
	await page
		.getByRole('button', {
			name: 'Explore question: What happens when a volunteer is away? ↗',
			exact: true,
		})
		.click();
	await page.getByRole('heading', { name: 'Solutions to this question · 0' }).waitFor();
	await page.getByRole('button', { name: 'Propose a solution +', exact: true }).click();
	await page
		.getByLabel('Proposed wording', { exact: true })
		.fill('Ask a backup volunteer to take over.');
	await page.getByRole('button', { name: 'Save option', exact: true }).click();
	await page
		.getByRole('heading', { name: 'Ask a backup volunteer to take over.', exact: true })
		.waitFor();
	const path = page.getByRole('navigation', { name: 'Question path' });
	await path.getByRole('button', { name: 'What could our courtyard become?', exact: true }).click();
	await page.getByRole('heading', { name: 'Solutions to this question · 5' }).waitFor();
	await page
		.getByRole('button', {
			name: 'Explore question: How will we care for the garden? ↗',
			exact: true,
		})
		.click();
	await page
		.getByRole('button', {
			name: 'Explore question: What happens when a volunteer is away? ↗',
			exact: true,
		})
		.click();
	await page.getByRole('heading', { name: 'Solutions to this question · 1' }).waitFor();
	await page.getByRole('button', { name: 'Ask a sub-question +', exact: true }).click();
	await page
		.getByLabel('What do you want to decide together?', { exact: true })
		.fill('How should backups be contacted?');
	await page.getByRole('button', { name: 'Open this question', exact: true }).click();
	assert.equal(await path.getByRole('button').count(), 4);
	await page.getByRole('heading', { name: 'Solutions to this question · 0' }).waitFor();
	await page.screenshot({ path: '/tmp/freedi-recursive/nested.png' });
	await page.setViewportSize({ width: 390, height: 844 });
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
	await page.screenshot({ path: '/tmp/freedi-recursive/mobile.png' });
	assert.deepEqual(errors, []);
	console.log(
		'PASS recursive navigation through four levels, fresh question, child solution preservation and parent isolation, mobile layout',
	);
	await browser.close();
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
