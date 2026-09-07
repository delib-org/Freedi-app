/* The answer box belongs to a question, not to a screen.
 *
 * The stage slot reuses one component for every question in the plan, so its
 * draft outlived the question it was written for: a student's personal story
 * was still sitting in the needs round's box, one tap from being posted as an
 * answer to a question nobody wrote it for. The rule now lives in
 * lib/flows/penState (unit-tested); this checks the views actually use it, in
 * a real browser, through a real stage change.
 *
 * Run: node scripts/e2e-pen.mjs (emulators + vite)
 */
import { createRequire } from 'node:module';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { eq, fail, passNameDoor, step } from './lib/e2e.mjs';
import { callable, db, fastlane } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraStage, Collections, stagePlanPreset } = require('@freedi/shared-types');

await preflight();

const MY_STORY = 'אני לא אוהב שאומרים לי מה לעשות!!';

const viteUp = await fetch(VITE_HOST).then((response) => response.ok, () => false);
if (!viteUp) fail(`vite is not up on ${VITE_HOST} — this check is a browser one`);

step('1. A quick game on the wizcol plan, opened at the story round');
const game = await fastlane({
	stage: AgoraStage.lobby,
	students: 2,
	proposals: 0,
	quiet: true,
	quick: {
		title: 'הדרך לבית הספר',
		mainQuestion: 'איך הופכים את הדרך לבית הספר לבטוחה?',
		explanation: 'פתרון שכולנו חיים איתו.',
	},
	stagePlan: stagePlanPreset('wizcol'),
});
const { sessionId, teacherToken } = game;
const advance = (toIndex) => callable('agoraAdvanceStage', { sessionId, toIndex }, teacherToken);
await advance(1);

const { chromium } = await import('playwright');
const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	await page.goto(game.joinUrl, { waitUntil: 'domcontentloaded' });
	await passNameDoor(page);

	step('2. A student writes their story and posts it');
	const box = page.locator('.round__textarea');
	await box.waitFor({ timeout: 30_000 });
	eq('the story box opens empty', await box.inputValue(), '');
	await box.fill(MY_STORY);
	await page.locator('.round__mine button.btn--primary, .round__mine .btn--full').first().click();
	await page.waitForFunction(
		() => document.querySelector('.round__textarea')?.disabled === false,
		undefined,
		{ timeout: 30_000 },
	);
	const mine = await db
		.collection(Collections.statements)
		.where('agoraSessionId', '==', sessionId)
		.get()
		.then((snap) => snap.docs.map((doc) => doc.data()).find((row) => row.statement === MY_STORY));
	eq('the story reached Firestore', Boolean(mine), true);
	eq('the box still shows what I saved', (await box.inputValue()).trim(), MY_STORY);

	step('3. The room moves to the needs round');
	await advance(2);
	// Wait on something that is only true of the needs round — waiting on the
	// box being empty would turn the bug into a timeout instead of a verdict.
	await page.waitForSelector('.round__lead', { timeout: 30_000 });

	eq('the needs box is empty — the story did not follow', await box.inputValue(), '');
	eq(
		'and nothing can be posted until something is written',
		await page.locator('.round__mine button').last().isDisabled(),
		true,
	);

	step('4. Stepping back to the story shows my words, with the pen put away');
	// Stages only move forward for the teacher; a player re-reads an earlier
	// one through the journey strip, which is the same component reuse again —
	// and a round they are only re-reading is closed, so there is no box at all.
	await page.locator('.stage-nav__station--done').last().click();
	await page.waitForSelector('.round__mine-text', { timeout: 30_000 });
	eq('my story is shown as written', (await page.locator('.round__mine-text').innerText()).trim(), MY_STORY);
	eq('and no box came back with it', await page.locator('.round__textarea').count(), 0);
} finally {
	await browser.close();
}

console.log('\n✓ the pen belongs to the question\n');
