const { chromium } = require('playwright');
const assert = require('node:assert/strict');
(async () => {
	const b = await chromium.launch();
	const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
	const errors = [];
	p.on('pageerror', (e) => errors.push(e.message));
	await p.goto('http://127.0.0.1:5187/redesign.html?view=courtyard');
	await p
		.getByRole('navigation', { name: 'Agreement workspaces' })
		.getByRole('button', { name: 'Maps', exact: true })
		.click();
	const nav = p.getByRole('navigation', { name: 'Map views' });
	await p.getByRole('region', { name: 'Visual mind map' }).waitFor();
	await nav.getByRole('button', { name: 'Sub-question map', exact: true }).click();
	await p.getByRole('list', { name: 'Recursive sub-question tree' }).waitFor();
	await p.getByText('Question · What happens when a volunteer is away?', { exact: true }).waitFor();
	await nav.getByRole('button', { name: 'Themes & synthesis', exact: true }).click();
	await p.getByText('Synthesis · 3 equivalent originals', { exact: true }).click();
	await p.screenshot({ path: '/tmp/freedi-maps/topics.png' });
	await nav.getByRole('button', { name: 'Agreement triangle', exact: true }).click();
	await p
		.getByRole('img', { name: 'Agreement triangle: support and opposition weights' })
		.waitFor();
	await p.screenshot({ path: '/tmp/freedi-maps/triangle.png' });
	await nav.getByRole('button', { name: 'Polarization', exact: true }).click();
	await p
		.getByRole('img', { name: 'Polarization: sentiment and mean absolute deviation' })
		.waitFor();
	await p.setViewportSize({ width: 390, height: 844 });
	assert.equal(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
	await p.screenshot({ path: '/tmp/freedi-maps/mobile.png' });
	await p.getByRole('button', { name: /Open solution 1:/ }).press('Enter');
	await p.getByRole('group', { name: 'Evaluate this wording' }).waitFor();
	assert.deepEqual(errors, []);
	console.log(
		'PASS all five maps, recursive branches, synthesis sources, responsive layout, keyboard point-to-solution navigation',
	);
	await b.close();
})().catch((e) => {
	console.error(e);
	process.exit(1);
});
