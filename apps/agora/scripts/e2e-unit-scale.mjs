/* The needs round's 0…1 scale, from a real browser, asserting Firestore.
 *
 * The bug this exists to catch: a student answers the first classmate's text
 * and the second one refuses to take an answer. Every earlier check on this
 * control looked at pixels — a ring drawn round a step proves the DOM heard
 * the click, not that a rating was ever written — so the only assertion here
 * that counts is the evaluation document, one per text, with the value the
 * step stands for.
 *
 * It rates the dealt cards BACK TO BACK, with no wait between them, because
 * that is what a 13-year-old does and it is the window in which a shared
 * in-flight guard drops the second press.
 *
 * Run: bash ../../scripts/solo.sh npx tsx scripts/e2e-unit-scale.mjs
 */
import { createRequire } from 'node:module';
import { preflight } from './lib/preflight.mjs';
import { eq, fail, passNameDoor, step } from './lib/e2e.mjs';
import { callable, db, fastlane } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraStage, Collections, stagePlanPreset } = require('@freedi/shared-types');
const { buildAnswerStatement } = require('../src/lib/statementDocs');

await preflight({ needs: ['firestore', 'auth', 'functions', 'vite'] });

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(label, probe, { timeoutMs = 20_000, every = 400 } = {}) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const value = await probe();
		if (value) return value;
		if (Date.now() > deadline) fail(`${label}: timed out`);
		await wait(every);
	}
}

// ---------------------------------------------------------------------------
step('1. A quick wizcol game, parked on the needs round');
const game = await fastlane({
	stage: AgoraStage.lobby,
	students: 4,
	proposals: 0,
	quiet: true,
	quick: {
		title: 'הדרך לבית הספר',
		mainQuestion: 'איך הופכים את הדרך לבית הספר לבטוחה?',
		explanation: 'פתרון שכולנו חיים איתו.',
	},
	stagePlan: stagePlanPreset('wizcol'),
});
const { sessionId, bots, teacherToken, joinUrl } = game;

await callable('agoraAdvanceStage', { sessionId, toIndex: 2 }, teacherToken);
const session = (await db.collection(Collections.agoraSessions).doc(sessionId).get()).data();
const needsItem = session.stagePlan[2];
eq('parked on the needs round', needsItem.kind, 'needs');

const NEEDS = [
	'שהילדים יגיעו בבטחה, בלי שאף אחד יפחד לחצות.',
	'לא לאחר לכיתה בגלל שהאוטובוס עוצר רחוק.',
	'מדרכות שאפשר ללכת עליהן, גם עם עגלה.',
	'שההורים יוכלו להוריד אותנו בלי לחסום את הרחוב.',
];
for (const [index, bot] of bots.entries()) {
	const statementId = `${sessionId}--${bot.uid}--${needsItem.itemId}`;
	await db
		.collection(Collections.statements)
		.doc(statementId)
		.set(
			buildAnswerStatement(
				session,
				needsItem.statementId,
				statementId,
				bot.uid,
				bot.anonName,
				NEEDS[index],
			),
		);
}

// ---------------------------------------------------------------------------
step('2. A student arrives, writes their own need, and is dealt the classmates’');
const { chromium } = await import('@playwright/test');
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
await page.addInitScript(() => window.localStorage.setItem('agora_lang', 'he'));
page.on('pageerror', (error) => console.log('[PAGEERROR]', error.message.slice(0, 300)));
page.on('console', (message) => {
	if (message.type() === 'error') console.log('[CONSOLE]', message.text().slice(0, 200));
});

await page.goto(joinUrl, { waitUntil: 'domcontentloaded' });
await passNameDoor(page);
await page.waitForSelector('.round__ask', { timeout: 30_000 });
await page.locator('textarea.round__textarea').fill('שנוכל ללכת לבד לבית הספר בלי לפחד.');
await page.locator('.round__mine button.btn--primary').click();
await page.waitForSelector('.round__list .unit-scale', { timeout: 30_000 });

const uid = await page.evaluate(() => window.__agoraDebug?.()?.user?.user?.uid ?? null);
if (!uid) fail('no student uid');

const dealt = await page
	.locator('.round__list .card.round__text')
	.evaluateAll((cards) => cards.length);
eq('at least three classmates’ texts dealt', dealt >= 3, true);

/** The statement id behind the nth dealt card, read off the DOM's own order */
const dealtIds = await page.evaluate(() => window.__agoraDebug?.()?.dealtIds ?? null);

// ---------------------------------------------------------------------------
step('3. Every dealt card is answered, back to back, with no wait between');
const scales = page.locator('.round__list .unit-scale');
const count = Math.min(await scales.count(), 4);
// Each card gets a different step, so a value landing on the wrong text shows
const PICKS = [3, 0, 4, 1];
const VALUES = [0.75, 0, 1, 0.25];

for (let index = 0; index < count; index++) {
	await scales.nth(index).locator('[role="radio"]').nth(PICKS[index]).click();
}

// ---------------------------------------------------------------------------
step('4. Firestore holds one evaluation per text, with the right value');
const rows = await until('every press was written', async () => {
	const snapshot = await db
		.collection(Collections.evaluations)
		.where('evaluatorId', '==', uid)
		.where('parentId', '==', needsItem.statementId)
		.get();

	return snapshot.size >= count ? snapshot.docs.map((doc) => doc.data()) : null;
});
eq('one evaluation per dealt text — none dropped', rows.length, count);

const byStatement = new Map(rows.map((row) => [row.statementId, row.evaluation]));
eq('every evaluation is on a DIFFERENT text', byStatement.size, count);
const values = [...byStatement.values()].sort((a, b) => a - b);
eq(
	'the values are the steps that were pressed',
	values.join(','),
	VALUES.slice(0, count).sort((a, b) => a - b).join(','),
);

// ---------------------------------------------------------------------------
step('5. …and every card on the screen shows the answer it was given');
await page.waitForTimeout(1200);
const checked = await scales.evaluateAll((groups) =>
	groups.map((group) => {
		const on = group.querySelector('[role="radio"][aria-checked="true"]');

		return on ? Number(on.getAttribute('data-step')) : -1;
	}),
);
eq('no card is left unanswered on screen', checked.slice(0, count).includes(-1), false);
eq('each card shows the step it was given', checked.slice(0, count).join(','), PICKS.slice(0, count).join(','));

const todo = await page.locator('.round__list .unit-scale__todo').count();
eq('the "not answered yet" chip is gone from every answered card', todo, Math.max(0, (await scales.count()) - count));

// ---------------------------------------------------------------------------
step('6. Changing your mind: two steps on the SAME card, back to back');
const first = scales.first();
const firstId = await until('the first card’s statement id', async () => {
	const snapshot = await db
		.collection(Collections.evaluations)
		.where('evaluatorId', '==', uid)
		.where('parentId', '==', needsItem.statementId)
		.where('evaluation', '==', VALUES[0])
		.get();

	return snapshot.empty ? null : snapshot.docs[0].data().statementId;
});
await first.locator('[role="radio"]').nth(1).click();
await first.locator('[role="radio"]').nth(4).click();

const settled = await until('the last press wins', async () => {
	const row = (await db.collection(Collections.evaluations).doc(`${uid}--${firstId}`).get()).data();

	return row?.evaluation === 1 ? row : null;
});
eq('the answer is the LAST step pressed, not the first', settled.evaluation, 1);
await page.waitForTimeout(800);
eq(
	'and the card shows it',
	await first.locator('[role="radio"][aria-checked="true"]').getAttribute('data-step'),
	'4',
);

console.log('\n✓ the unit scale takes an answer on every card, and the last press wins\n');
if (dealtIds) console.log('   dealt', dealtIds.join(', '));
await browser.close();
process.exit(0);
