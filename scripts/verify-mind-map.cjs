const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
	const b = await chromium.launch();
	const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
	const errors = [];
	p.on('pageerror', (e) => errors.push(e.message));
	await p.goto('http://127.0.0.1:5187/redesign.html?view=courtyard&tab=maps');
	await p.getByRole('region', { name: 'Visual mind map' }).waitFor();
	assert.ok(
		(await p.locator('svg[aria-label="Connected questions and solutions"] path').count()) > 5,
	);
	await p.screenshot({ path: '/tmp/freedi-mindmap/desktop.png' });
	await p.getByRole('button', { name: 'Zoom in', exact: true }).click();
	await p.getByRole('button', { name: 'Fit map', exact: true }).click();
	await p
		.getByRole('button', { name: 'Question: How will we care for the garden?', exact: true })
		.click();
	await p.getByRole('heading', { name: 'How will we care for the garden?', exact: true }).waitFor();
	await p
		.getByRole('button', {
			name: 'Solution: Use a weekly volunteer rota with a named backup.',
			exact: true,
		})
		.click();
	await p.getByRole('group', { name: 'Evaluate this wording' }).waitFor();
	await p
		.getByRole('navigation', { name: 'Agreement workspaces' })
		.getByRole('button', { name: 'Maps', exact: true })
		.click();
	await p.setViewportSize({ width: 390, height: 844 });
	await p.getByRole('button', { name: 'Fit map', exact: true }).click();
	assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
	await p.screenshot({ path: '/tmp/freedi-mindmap/mobile.png' });
	assert.deepEqual(errors, []);
	console.log(
		'PASS connected mind map, zoom, fit, recursive question navigation, solution navigation and mobile',
	);
	await b.close();
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
