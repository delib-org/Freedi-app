/* The booth's two sides: the table and the board.
 *
 * One village student at a solutions booth with classmates' notes already on
 * the board. Arriving shows the table with the paper waiting and the guide's
 * speech bubble; the student writes INSIDE the bubble; sending flies the paper
 * to the board and the board opens; from the board the student can go back
 * to the table (to edit) and forth again, and rate a classmate's note.
 *
 * Run (solo suite): bash ../../scripts/solo.sh npx tsx scripts/village-desk-board.mjs [--keep] [--shot=prefix]
 * Screenshots land in output/village-desk-board/.
 */
import { mkdirSync } from 'node:fs';
import { chromium } from '@playwright/test';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { clearCelebration, eq, fail, mkPage, passNameDoor, shotter, step } from './lib/e2e.mjs';
import { db, fastlane, positionStudent } from './lib/fastlane.ts';

await preflight();

const OUT = 'output/village-desk-board';
mkdirSync(OUT, { recursive: true });
const shot = shotter(OUT);
const KEEP = process.argv.includes('--keep');
const PREFIX = (process.argv.find((a) => a.startsWith('--shot='))?.split('=')[1] ?? 'run') + '-';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

step('A village lesson at the solutions booth, classmates already on the board');
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
	runId: `desk-board-${Date.now().toString(36)}`,
	quiet: true,
});
await db.collection('agoraSessions').doc(run.sessionId).update({ world: 'village' });
console.log(`   session ${run.sessionId} (code ${run.code})`);

const browser = await chromium.launch({
	headless: !KEEP,
	args: ['--use-angle=metal', '--ignore-gpu-blocklist'],
});
const page = await mkPage(browser, 'S1', { width: 1360, height: 860 });
await page.goto(`${VITE_HOST}/#!/join/${run.code}`, { waitUntil: 'domcontentloaded' });
await passNameDoor(page, 'נועה');
await page.locator('iframe.village-shell__world').waitFor({ timeout: 30000 });
const uid = await page.evaluate(() => window.__agoraDebug?.()?.user?.user?.uid ?? null);
if (!uid) fail('the student has no uid');
await positionStudent(run.sessionId, uid, 20);

step('Arriving: the table, and the guide asking in a speech bubble');
const bubble = page.locator('.village-bubble');
const arrived = await bubble
	.waitFor({ state: 'visible', timeout: 40000 })
	.then(() => true)
	.catch(() => false);
await pause(2500);
await shot(page, `${PREFIX}01-arrive-table`);
if (!arrived) fail('no speech bubble at the table after arriving');
eq('the board is not open while writing', await page.locator('.village-community__panel').count(), 0);

step('Writing inside the bubble');
const input = bubble.locator('textarea').first();
await input.waitFor({ timeout: 15000 });
await input.fill('ועדה של שלושה נציגים שמתחלפת כל חודש ומביאה הצעות לאישור כל הכיתה.');
await shot(page, `${PREFIX}02-writing-in-bubble`);
await clearCelebration(page, 'S1');
await bubble.locator('button.btn--primary').first().click();

step('Sent: the paper lands and the board opens');
await page.locator('.village-community__panel').waitFor({ timeout: 25000 });
await page.locator('.village-note--own').waitFor({ timeout: 15000 });
await pause(1500);
await clearCelebration(page, 'S1');
await pause(600);
await shot(page, `${PREFIX}03-board-after-send`);

step('From the board back to the table, and forth again');
await clearCelebration(page, 'S1');
await page.locator('.village-booth-switch button', { hasText: 'השולחן' }).first().click();
await bubble.waitFor({ state: 'visible', timeout: 15000 });
eq('the board closed at the table', await page.locator('.village-community__panel').count(), 0);
// The camera turns to the table (~0.9s), then the bubble appears beside the guide.
await page.locator('.village-bubble:not(.village-bubble--waiting)').waitFor({ timeout: 5000 });
await pause(1200);
await shot(page, `${PREFIX}04-back-at-table`);
await page.locator('.village-booth-switch button', { hasText: 'הלוח' }).first().click();
await page.locator('.village-community__panel').waitFor({ timeout: 15000 });

step('On the board: rate a classmate, and "edit my note" goes to the table');
const other = page.locator('.village-note:not(.village-note--own)').first();
await other.waitFor({ timeout: 15000 });
const face = other.locator('.village-note__rate button').first();
if (await face.count()) {
	await face.click();
	console.log('   ✓ rated a classmate on the board');
}
await pause(600);
await shot(page, `${PREFIX}05-board-rated`);
await page.locator('.village-note--own button', { hasText: 'עריכת הפתק' }).first().click();
await page.locator('.village-bubble:not(.village-bubble--waiting)').waitFor({ timeout: 15000 });
await pause(1200);
await shot(page, `${PREFIX}06-edit-from-board`);
console.log('   ✓ edit from the board opened the table');

console.log(`\nPASS — screenshots in ${OUT}`);
if (!KEEP) await browser.close();
process.exit(0);
