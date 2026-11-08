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
import { chromium, expect } from '@playwright/test';
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
const door = (place) => page.locator(`.place-bar__item[data-place="${place}"]`);
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
eq(
	'the guide button preserves its click target while the world animates',
	await writeButton.evaluate(async (button) => {
		const label = button.firstChild;
		const frame = () => new Promise((resolve) => requestAnimationFrame(resolve));
		for (let i = 0; i < 8; i++) await frame();

		return label === button.firstChild;
	}),
	true,
);
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

step('The four destinations select the visible panel');
await expect(door('board')).toHaveAttribute('aria-current', 'true');
await door('results').click();
await expect(page.locator('.village-scoreboard')).toBeVisible();
await expect(door('results')).toHaveAttribute('aria-current', 'true');
await expect(door('board')).not.toHaveAttribute('aria-current', 'true');
await door('note').click();
await expect(page.locator('.village-scoreboard')).toHaveCount(0);
await expect(bubble.locator('textarea')).toBeVisible();
await expect(door('note')).toHaveAttribute('aria-current', 'true');
await door('board').click();
await expect(page.locator('.village-note--own')).toBeVisible();
await expect(door('board')).toHaveAttribute('aria-current', 'true');

step('From the board back to the table, and forth again');
await clearCelebration(page, 'S1');
await page.locator('.place-bar__item[data-place="village"]').first().click();
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
await page.locator('.place-bar__item[data-place="board"]').first().click();
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
await page.locator('.village-note--own button.village-note__edit').first().click();
await page.locator('.village-bubble:not(.village-bubble--waiting)').waitFor({ timeout: 15000 });
await pause(1200);
await shot(page, `${PREFIX}06-edit-from-board`);
console.log('   ✓ edit from the board opened the table');

step('Settings keep keyboard focus and apply the world preferences');
await door('village').click();
await page.locator('.stage-nav__menu').click();
const settings = page.locator('.village-more');
const settingsButtons = settings.locator('button');
await expect(settingsButtons.first()).toBeFocused();
await page.keyboard.press('Shift+Tab');
await expect(settingsButtons.last()).toBeFocused();
await page.keyboard.press('Tab');
await expect(settingsButtons.first()).toBeFocused();
const switches = settings.getByRole('switch');
await switches.nth(1).click();
await expect(switches.nth(1)).toHaveAttribute('aria-checked', 'true');
await expect(switches.nth(1).locator('.village-more__switch')).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
await expect.poll(() => page.evaluate(() => localStorage.getItem('agora_village_quality'))).toBe('low');
await expect(world.locator('#quality')).toHaveText('איכות חסכונית');
await switches.nth(0).click();
await expect(switches.nth(0)).toHaveAttribute('aria-checked', 'true');
await expect(world.locator('#sound')).toHaveText('♫ השתקה');
await switches.nth(0).click();
await expect(world.locator('#sound')).toHaveText('♫ צלילים');
await page.keyboard.press('Escape');
await expect(settings).toHaveCount(0);
await expect(page.locator('.stage-nav__menu')).toBeFocused();

step('Phone navigation stays readable in Hebrew and Spanish');
await page.setViewportSize({ width: 390, height: 844 });
await door('board').click();
await pause(600);
await shot(page, `${PREFIX}07-phone-board`);
await page.setViewportSize({ width: 320, height: 740 });
const spanishUrl = new URL(page.url());
spanishUrl.searchParams.set('lang', 'es');
await page.goto(spanishUrl.href, { waitUntil: 'domcontentloaded' });
await expect(door('board')).toContainText('Todas las notas');
await door('board').click();
await expect(page.locator('.village-note--own')).toBeVisible();
await pause(600);
for (const label of await page.locator('.place-bar__label').all()) {
	eq('the entire navigation label fits', await label.evaluate((el) => el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight), true);
}
eq('no horizontal page overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
await shot(page, `${PREFIX}08-small-phone-spanish`);
await page.locator('.stage-nav__menu').click();
await shot(page, `${PREFIX}09-phone-settings`);
await settingsButtons.last().click();
await expect(page.locator('iframe.village-shell__world')).toHaveCount(0);
await page.locator('.village-mode-toggle').click();
await expect(page.locator('iframe.village-shell__world')).toBeVisible();
await expect(world.locator('#quality')).toHaveText('איכות חסכונית');

console.log(`\nPASS — screenshots in ${OUT}`);
if (!KEEP) await browser.close();
process.exit(0);
