/* The booth's two sides: the table and the board.
 *
 * One village student at a solutions booth with classmates' notes already on
 * the board. Arriving puts the student IN FRONT of the station: the guide, the
 * writing table and the note, and the guide's bubble with the instruction —
 * nothing opens by itself. Only the bubble's button opens the paper, written
 * in the guide's speech bubble; sending flies it to the board and the board
 * opens; the switch goes back to the station and forth again; a classmate is
 * rated; "edit my note" on the board opens the paper directly.
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

const world = page.frameLocator('iframe.village-shell__world');
const guideBubble = world.locator('#desk-bubble');
const writeButton = world.locator('#desk-write');
const bubble = page.locator('.village-bubble');
/** Press the one button that opens the paper: inside the guide's bubble */
async function writeFromGuide() {
	await guideBubble.waitFor({ state: 'visible', timeout: 40000 });
	await clearCelebration(page, 'S1');
	await writeButton.click();
	await page.locator('.village-bubble:not(.village-bubble--waiting)').waitFor({ timeout: 15000 });
}

step('Arriving: in front of the station — the guide, the table, the note; nothing opens');
const arrived = await guideBubble
	.waitFor({ state: 'visible', timeout: 40000 })
	.then(() => true)
	.catch(() => false);
await pause(1500);
await shot(page, `${PREFIX}01-arrive-station`);
if (!arrived) fail("the guide's bubble did not appear in front of the station");
eq('the paper did not open by itself', await bubble.count(), 0);
eq('the board did not open by itself', await page.locator('.village-community__panel').count(), 0);
eq(
	"the guide's bubble tells the student to write it down",
	(await writeButton.textContent())?.includes('לכתוב את זה על הפתק שלי'),
	true,
);

step("Pressing the guide's button opens the paper, in the guide's speech bubble");
await writeFromGuide();
await pause(800);
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
await guideBubble.waitFor({ state: 'visible', timeout: 15000 });
eq('the board closed at the station', await page.locator('.village-community__panel').count(), 0);
eq('back at the station, the paper waits for the guide’s button', await bubble.count(), 0);
await pause(800);
await shot(page, `${PREFIX}04-back-at-station`);
await writeFromGuide();
eq(
	'the written note is offered for editing',
	(await page.locator('.village-bubble textarea').first().inputValue()).length > 0,
	true,
);
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
