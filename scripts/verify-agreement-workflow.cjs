const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1512, height: 982 } });
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.goto('http://127.0.0.1:5187/redesign.html?view=courtyard');
	const nav = page.getByRole('navigation', { name: 'Agreement workspaces' });
	await page.getByRole('heading', { name: 'Solutions to this question · 5' }).waitFor();
	await page.screenshot({ path: '/tmp/freedi-agreement-overview.png' });
	await page.getByRole('button', { name: 'Explore & improve', exact: true }).first().click();
	await page.getByRole('button', { name: 'Explain a concern', exact: true }).click();
	await page.getByLabel('Your concern', { exact: true }).fill('Can we make the trial step-free?');
	await page.getByRole('button', { name: 'Save concern', exact: true }).click();
	await page.getByText('Can we make the trial step-free?', { exact: true }).first().waitFor();
	await page.getByRole('button', { name: 'Propose improved wording', exact: true }).click();
	await page
		.getByLabel('Proposed wording', { exact: true })
		.fill('A step-free one-month garden trial with a volunteer rota.');
	await page.getByRole('button', { name: 'Save option', exact: true }).click();
	await page
		.getByRole('heading', { name: 'A step-free one-month garden trial with a volunteer rota.' })
		.waitFor();
	await page.getByText('Needs more evaluation', { exact: true }).waitFor();
	const rating = page.getByRole('group', { name: 'Evaluate this wording' });
	await rating.getByRole('button', { name: /\+1\s*Support/ }).click();
	await rating.getByRole('button', { name: /-1\s*Oppose/ }).click();
	await page.getByText('1 oppose', { exact: true }).waitFor();
	await page.getByRole('button', { name: 'Bring into the draft אמנה', exact: true }).click();
	await page.getByRole('button', { name: 'Comment', exact: true }).click();
	await page.getByLabel('Your comment', { exact: true }).fill('Please set a budget.');
	await page.getByRole('button', { name: 'Save comment', exact: true }).click();
	await page.getByRole('button', { name: 'Amend wording', exact: true }).click();
	await page
		.getByLabel('Proposed wording', { exact: true })
		.fill('A step-free one-month garden trial with volunteers and a ₪600 cap.');
	await page
		.getByLabel('Why this change?', { exact: true })
		.fill('Responds to the budget concern.');
	await page.getByRole('button', { name: 'Save amendment', exact: true }).click();
	await page.getByRole('button', { name: 'Open review of version 1', exact: true }).click();
	assert.equal(await page.getByRole('button', { name: 'Amend wording', exact: true }).count(), 0);
	await page.getByRole('button', { name: 'I do not object', exact: true }).click();
	await page
		.getByText('0 endorse · 1 do not object · 0 object · 23 have not responded', { exact: true })
		.waitFor();
	await page.getByRole('button', { name: 'Reopen drafting for amendments', exact: true }).click();
	await page.getByRole('button', { name: 'Open review of version 2', exact: true }).click();
	await page
		.getByText('0 endorse · 0 do not object · 0 object · 24 have not responded', { exact: true })
		.waitFor();
	await page.getByRole('button', { name: 'Load example community responses', exact: true }).click();
	const adopt = page.getByRole('button', { name: 'Record adoption in this example', exact: true });
	assert.equal(await adopt.isDisabled(), true);
	await page.getByRole('button', { name: 'I object', exact: true }).click();
	assert.equal(await adopt.isDisabled(), true);
	await page.getByRole('button', { name: 'I do not object', exact: true }).click();
	assert.equal(await adopt.isEnabled(), true);
	await adopt.click();
	await page
		.getByText('Adopted in this local example · the exact wording and positions are recorded.', {
			exact: true,
		})
		.waitFor();
	assert.equal(
		await page.getByRole('button', { name: 'I object', exact: true }).isDisabled(),
		true,
	);
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('button', { name: 'Export document', exact: true }).click();
	const download = await downloadPromise;
	await download.saveAs('/tmp/freedi-agreement-example.md');
	await page.screenshot({ path: '/tmp/freedi-agreement-covenant.png' });
	await nav.getByRole('button', { name: 'Maps', exact: true }).click();
	await page
		.getByRole('navigation', { name: 'Map views' })
		.getByRole('button', { name: 'Themes & synthesis', exact: true })
		.click();
	await page.getByText('Synthesis · 3 equivalent originals', { exact: true }).click();
	await nav.getByRole('button', { name: 'Summary', exact: true }).click();
	await page.getByRole('heading', { name: 'Remaining concerns', exact: true }).waitFor();
	await nav.getByRole('button', { name: 'Maps', exact: true }).click();
	await page.getByRole('region', { name: 'Visual mind map' }).waitFor();
	await page.setViewportSize({ width: 390, height: 844 });
	await nav.getByRole('button', { name: 'Our אמנה', exact: true }).click();
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
	await page.screenshot({ path: '/tmp/freedi-agreement-mobile.png' });
	await page.getByRole('button', { name: 'RTL', exact: true }).click();
	await page.getByRole('button', { name: 'Dark theme', exact: true }).click();
	assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
	await page.screenshot({ path: '/tmp/freedi-agreement-dark-rtl.png' });
	assert.deepEqual(errors, []);
	console.log(
		'PASS: concern, independent revision, replaceable evaluation, clause drafting, comments/amendments, locked review, explicit positions, fresh review without inherited positions, export, synthesis sources, summary, maps, mobile and dark RTL.',
	);
	await browser.close();
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
