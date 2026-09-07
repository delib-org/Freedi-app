/* The teacher can tell a quiet class from a slow count.
 *
 * Every figure on a text is server-written — the trigger that aggregates the
 * evaluations owns it, because the class and the server once counted
 * differently. But the trigger lands a round-trip late (tens of seconds on a
 * loaded emulator), and until it does the teacher's list said "not rated yet"
 * about a text the room had just spent a minute rating. So the room looked
 * asleep while it was working.
 *
 * The evaluations are direct client writes and the teacher already streams
 * their anonymous timeline, so the count of hands is instant. This drives the
 * whole thing in a real browser: nobody has weighed → the list says so; a
 * classmate weighs → the row says so within a second, without inventing a
 * figure; the trigger lands → the marker goes and the real figure stands.
 *
 * Run: bash ../../scripts/solo.sh npx tsx scripts/e2e-teacher-tally.mjs
 */
import { createRequire } from 'node:module';
import { preflight, VITE_HOST } from './lib/preflight.mjs';
import { eq, fail, step } from './lib/e2e.mjs';
import { callable, db, fastlane } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AGORA_ROUND, AgoraStage, Collections, stagePlanPreset } = require('@freedi/shared-types');
const { buildAnswerStatement } = require('../src/lib/statementDocs');

await preflight();

const viteUp = await fetch(VITE_HOST).then((response) => response.ok, () => false);
if (!viteUp) fail(`vite is not up on ${VITE_HOST} — this check is a browser one`);

const RUN_ID = `tally-${Date.now().toString(36)}`;
const TEACHER_SUB = `${RUN_ID}-teacher`;
const STORY = 'אני לא אוהב שאומרים לי מה לעשות!!';

step('1. A story round with one story in it, and nobody has weighed it');
const game = await fastlane({
	stage: AgoraStage.lobby,
	students: 3,
	proposals: 0,
	quiet: true,
	runId: RUN_ID,
	quick: {
		title: 'הדרך לבית הספר',
		mainQuestion: 'איך הופכים את הדרך לבית הספר לבטוחה?',
		explanation: 'פתרון שכולנו חיים איתו.',
	},
	stagePlan: stagePlanPreset('wizcol'),
});
const { sessionId, bots, teacherToken } = game;
await callable('agoraAdvanceStage', { sessionId, toIndex: 1 }, teacherToken);

const session = (await db.collection(Collections.agoraSessions).doc(sessionId).get()).data();
const storyItem = session.stagePlan[1];
const [author, first, second] = bots;
const statementId = `${sessionId}--${author.uid}--${storyItem.itemId}`;
await db
	.collection(Collections.statements)
	.doc(statementId)
	.set(
		buildAnswerStatement(session, storyItem.statementId, statementId, author.uid, author.anonName, STORY),
	);

const heart = async (rater) => {
	const evaluationId = `${rater.uid}--${statementId}`;
	await db.collection(Collections.evaluations).doc(evaluationId).set({
		evaluationId,
		parentId: storyItem.statementId,
		statementId,
		evaluatorId: rater.uid,
		evaluation: AGORA_ROUND.LIKE,
		evaluator: { uid: rater.uid, displayName: rater.anonName, isAnonymous: true },
		agoraSessionId: sessionId,
		updatedAt: Date.now(),
	});
};

const { chromium } = await import('playwright');
const browser = await chromium.launch();
try {
	const page = await browser.newPage();
	// The browser teacher signs in as the SAME subject fastlane used, so the
	// session is genuinely theirs (see demo-voting.mjs).
	await page.goto(`${VITE_HOST}/#!/teach?lang=he`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => typeof window.__agoraDevSignIn === 'function', { timeout: 20_000 });
	await page.evaluate(
		(sub) => window.__agoraDevSignIn({ sub, email: `${sub}@example.com`, name: 'Tally Teacher' }),
		TEACHER_SUB,
	);
	// ?lang=he: Playwright's browser is en-US, and the assertions below read
	// the Hebrew the classroom actually runs in.
	await page.goto(`${VITE_HOST}/#!/teach/session/${sessionId}?lang=he`, {
		waitUntil: 'domcontentloaded',
	});

	const row = page.locator('.teacher-answers__row', { hasText: STORY });
	await row.waitFor({ timeout: 30_000 });
	eq('the story is on the teacher’s list', await row.count(), 1);
	eq('and it honestly says nobody has weighed it', await row.locator('.teacher-answers__catchup').count(), 0);

	step('2. A classmate weighs it — the teacher knows before the trigger does');
	const started = Date.now();
	await heart(first);
	await row.locator('.teacher-answers__catchup').waitFor({ timeout: 15_000 });
	console.log(`   the row admitted it after ${((Date.now() - started) / 1000).toFixed(1)}s`);
	// The default language is Hebrew, and one hand takes the `_one` phrasing —
	// which carries no digit at all. What must be true is that the row now says
	// the count is on its way, and does not print a figure it does not have.
	const marker = (await row.locator('.teacher-answers__catchup').innerText()).trim();
	eq('the row says the count is coming', marker.includes('מתעדכן'), true);
	eq('and it prints no figure of its own', /\d/.test(marker), false);

	step('3. A second hand is counted too, still without the server');
	await heart(second);
	await page.waitForFunction(
		(story) => {
			const rows = [...document.querySelectorAll('.teacher-answers__row')];
			const found = rows.find((node) => node.textContent?.includes(story));

			return found?.querySelector('.teacher-answers__catchup')?.textContent?.includes('2') === true;
		},
		STORY,
		{ timeout: 20_000 },
	);
	console.log('   the row says two');

	step('4. The trigger lands: the real figure stands, the marker goes');
	await page.waitForFunction(
		(story) => {
			const rows = [...document.querySelectorAll('.teacher-answers__row')];
			const found = rows.find((node) => node.textContent?.includes(story));

			return found !== undefined && found.querySelector('.teacher-answers__catchup') === null;
		},
		STORY,
		{ timeout: 180_000 },
	);
	const figure = (await row.locator('.question__agreement').innerText()).trim();
	console.log(`   the server’s figure: ${figure}   (after ${((Date.now() - started) / 1000).toFixed(1)}s)`);
	eq('the figure is the server’s, and the marker is gone', figure.includes('2'), true);
} finally {
	await browser.close();
}

console.log('\n✓ a quiet class and a slow count look different\n');
