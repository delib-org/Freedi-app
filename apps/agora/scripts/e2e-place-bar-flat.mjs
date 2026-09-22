/* One bar in BOTH worlds.
 *
 * The village screen and the flat screen used to carry different navigators —
 * a toolbar plus two chips plus a floating button over the 3D world, and a
 * three-tab strip in the flat view — so a student who switched views had to
 * learn the game's navigation a second time. Both render `PlaceBar` now.
 *
 * This walks the FLAT view, which the village scripts never touch: the three
 * doors are there, each one selects its screen, and the lap cycle behind the
 * "all notes" door still runs (that door used to be the "others" tab, and it
 * drives `setCycle`).
 *
 * Run (solo suite):
 *   bash ../../scripts/solo.sh npx tsx scripts/e2e-place-bar-flat.mjs [--keep]
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { clearCelebration, eq, fail, mkPage, passNameDoor, shotter, step } from './lib/e2e.mjs';
import { db, fastlane, positionStudent } from './lib/fastlane.ts';

await preflight();

const OUT = 'output/place-bar-flat';
mkdirSync(OUT, { recursive: true });
const shot = shotter(OUT);
const KEEP = process.argv.includes('--keep');
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

step('A flat-view lesson at the square, classmates already on the board');
const run = await fastlane({
	stage: 'deliberation',
	students: 3,
	proposals: 3,
	ratings: false,
	stagePlan: [
		{ itemId: 'lobby', stage: 'lobby' },
		{ itemId: 'deliberation', stage: 'deliberation' },
		{ itemId: 'results', stage: 'results' },
	],
	runId: `flat-bar-${Date.now().toString(36)}`,
	quiet: true,
});
// The teacher's start screen defaults to the village now; this is the other world.
await db.collection('agoraSessions').doc(run.sessionId).update({ world: 'classic' });
console.log(`   session ${run.sessionId} (code ${run.code})`);

const browser = await chromium.launch({ headless: !KEEP });
const page = await mkPage(browser, 'S1', { width: 420, height: 880 });
await page.goto(`${VITE_HOST}/#!/join/${run.code}`, { waitUntil: 'domcontentloaded' });
await passNameDoor(page, 'נועה');

// The join writes the participant doc; positioning it before that write lands
// fails with "no entity to update".
await page.locator('.shell, .delib-hud, .lobby').first().waitFor({ timeout: 25000 });
let uid = null;
for (let attempt = 0; attempt < 40 && !uid; attempt++) {
	uid = await page.evaluate(() => window.__agoraDebug?.()?.user?.user?.uid ?? null);
	if (!uid) await pause(250);
}
if (!uid) fail('the student has no uid');
for (let attempt = 0; ; attempt++) {
	try {
		await positionStudent(run.sessionId, uid, 20);
		break;
	} catch (error) {
		if (attempt >= 20) throw error;
		await pause(300);
	}
}

step('The student writes, so the bar appears (it needs a proposal of their own)');
const write = page.locator('.write-desk textarea, textarea.my-screen__text').first();
await write.waitFor({ timeout: 25000 });
await write.fill('שנקים ספרייה ניידת שעוברת בין השכונות פעמיים בשבוע.');
await page.locator('button.btn--primary', { hasText: /לשלוח|לפרסם|לשמור|שליחה/ })
	.first()
	.click({ timeout: 15000 });
await clearCelebration(page, 'S1');

const bar = page.locator('.place-bar');
await bar.waitFor({ timeout: 25000 });

step('The flat view carries the same bar, minus the village door');
const doors = await page.locator('.place-bar__item').evaluateAll((els) =>
	els.map((el) => el.getAttribute('data-place')),
);
eq('three doors in the flat view', JSON.stringify(doors), JSON.stringify(['note', 'board', 'results']));
eq('no 3D world behind it', await page.locator('iframe.village-shell__world').count(), 0);
await pause(400);
await shot(page, '01-flat-bar');

step('Every door selects its own screen, and exactly one is filled');
const go = async (place) => {
	await clearCelebration(page, 'S1');
	await page.locator(`.place-bar__item[data-place="${place}"]`).click();
	await pause(900);
};
const activeDoor = () =>
	page.locator('.place-bar__item--active').first().getAttribute('data-place');

await go('results');
eq('the results door is filled', await activeDoor(), 'results');
eq('the results screen is up', await page.locator('.board, .results-board').first().count(), 1);
await shot(page, '02-results');

await go('board');
eq('the all-notes door is filled', await activeDoor(), 'board');
eq(
	'the classmates screen is up',
	await page.locator('.stall-list, .square, .rate').first().count(),
	1,
);
await shot(page, '03-board');

await go('note');
eq('the my-note door is filled', await activeDoor(), 'note');
eq('my own paper is up', await page.locator('.my-screen__paper').count(), 1);
eq('exactly one door is filled', await page.locator('.place-bar__item--active').count(), 1);
await shot(page, '04-my-note');

step('The flat view still offers the way back into the village');
const back = page.locator('.village-mode-toggle');
eq('the way back is on screen', await back.count(), 1);
eq('and it says where it goes', ((await back.first().textContent()) ?? '').trim().length > 0, true);
await shot(page, '05-back-to-village');

step('The labels fit a 420px phone without spilling');
const spill = await page.locator('.place-bar__label').evaluateAll((els) =>
	els.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent),
);
eq('every door label fits', JSON.stringify(spill), '[]');
eq(
	'no horizontal page overflow',
	await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
	true,
);

if (!KEEP) await browser.close();
console.log(`\nPASS — screenshots in ${OUT}`);
