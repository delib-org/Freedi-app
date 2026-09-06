/* The WizCol rounds, end to end.
 *
 * A quick game on the wizcol plan: lobby → intro → story → needs → vision →
 * the square → the vote → results. Four bots write stories, heart each
 * other's, write needs and visions and weigh them 0…1. Every heart and every
 * rating at or above the half pays the AUTHOR one point, once per reader —
 * a second heart, an un-heart, a redelivered trigger pay nothing more, and
 * the reader's own effort credit stays untouched. Each round closes with a
 * record (all texts, ranked, plus the summary) that the next screens carry.
 * Then the square runs as it always has.
 *
 * Asserts Firestore state, not pixels; the one browser leg checks that the
 * needs list and the vision are on the deliberation screen beside the pen.
 *
 * Run: node scripts/e2e-wizcol.mjs (needs emulators with LIVE triggers — a
 * functions bundle rebuilt since the suite started means restart it first)
 */
import { createRequire } from 'node:module';
import { preflight, FIRESTORE_REST, VITE_HOST } from './lib/preflight.mjs';
import { eq, fail, passNameDoor, step } from './lib/e2e.mjs';
import { callable, db, fastlane } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraStage, Collections, stagePlanPreset } = require('@freedi/shared-types');
const { buildAnswerStatement, buildProposalStatement } = require('../src/lib/statementDocs');

await preflight();

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(label, probe, { timeoutMs = 45_000, every = 500 } = {}) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const value = await probe();
		if (value) return value;
		if (Date.now() > deadline) {
			fail(
				`${label}: timed out. If nothing server-side ever moved, the functions emulator ` +
					'stopped dispatching triggers after a hot reload — restart the suite.',
			);
		}
		await wait(every);
	}
}

const session = async (sessionId) =>
	(await db.collection(Collections.agoraSessions).doc(sessionId).get()).data();
const statement = async (statementId) =>
	(await db.collection(Collections.statements).doc(statementId).get()).data();
const participant = async (sessionId, uid) =>
	(await db.collection(Collections.agoraParticipants).doc(`${sessionId}--${uid}`).get()).data();
const appreciation = async (sessionId, uid) => (await participant(sessionId, uid)).points.appreciation ?? 0;

/** Statements that have received at least one rating — see the pause below */
const ratedOnce = new Set();

async function rate(sessionRow, rater, parentId, statementId, value) {
	const evaluationId = `${rater.uid}--${statementId}`;
	await db.collection(Collections.evaluations).doc(evaluationId).set({
		evaluationId,
		parentId,
		statementId,
		evaluatorId: rater.uid,
		evaluation: value,
		evaluator: { uid: rater.uid, displayName: rater.anonName, isAnonymous: true },
		agoraSessionId: sessionRow.sessionId,
		updatedAt: Date.now(),
	});
	// The pipeline read-modify-writes the statement; the FIRST rating of a
	// statement also runs the repair path — give it room (see e2e-stage-plan).
	await wait(ratedOnce.has(statementId) ? 300 : 1800);
	ratedOnce.add(statementId);
}

async function advance(sessionId, toIndex, teacherToken) {
	await callable('agoraAdvanceStage', { sessionId, toIndex }, teacherToken);
}

/** Every bot writes one text under a round item, at the deterministic answer id */
async function writeRound(sessionRow, item, bots, texts) {
	const ids = [];
	for (const [index, bot] of bots.entries()) {
		const statementId = `${sessionRow.sessionId}--${bot.uid}--${item.itemId}`;
		await db
			.collection(Collections.statements)
			.doc(statementId)
			.set(buildAnswerStatement(sessionRow, item.statementId, statementId, bot.uid, bot.anonName, texts[index]));
		ids.push(statementId);
	}

	return ids;
}

// ---------------------------------------------------------------------------
step('1. A quick game on the wizcol plan');
const plan = stagePlanPreset('wizcol').map((item) =>
	item.stage === AgoraStage.deliberation
		? { ...item, votingTrigger: { enabled: true, singleMin: 0.85, pairMin: 0.5, minRaters: 2 } }
		: item,
);
const game = await fastlane({
	stage: AgoraStage.lobby,
	students: 4,
	proposals: 0,
	quiet: true,
	quick: { title: 'הדרך לבית הספר', mainQuestion: 'איך הופכים את הדרך לבית הספר לבטוחה?', explanation: 'פתרון שכולנו חיים איתו.' },
	stagePlan: plan,
});
const { sessionId, bots, teacherToken } = game;
const [a, b, c, d] = bots;
let s = await session(sessionId);
eq('starts in the lobby', s.stage, 'lobby');
eq('eight stages stored (ended is never stored)', s.stagePlan.length, 8);
const kinds = s.stagePlan.map((item) => item.stage);
eq('the plan is the WizCol sequence', kinds.join(' → '), 'lobby → intro → story → myNeeds → vision → deliberation → voting → results');
const storyItem = s.stagePlan[2];
const needsItem = s.stagePlan[3];
const visionItem = s.stagePlan[4];
for (const item of [storyItem, needsItem, visionItem]) {
	eq(`${item.stage} got its Statement`, Boolean(item.statementId), true);
	const doc = await statement(item.statementId);
	eq(`${item.stage} Statement kind`, doc.statementType, 'question');
	eq(`${item.stage} Statement text falls back to the kind`, doc.statement, item.stage);
}
eq('no Statement for intro', Boolean(s.stagePlan[1].statementId), false);

// ---------------------------------------------------------------------------
step('2. The intro has no side effects; the story round opens');
await advance(sessionId, 1, teacherToken);
s = await session(sessionId);
eq('on the intro', s.stage, 'intro');
eq('intro opened, nothing else written', Object.keys(s.stageState.intro).join(','), 'openedAt');
await advance(sessionId, 2, teacherToken);
s = await session(sessionId);
eq('on the story round', s.stage, 'story');

const STORIES = [
	'בכיתה ז׳ כמעט נדרסתי בחצייה ליד בית הספר.',
	'אחי הקטן מפחד לחצות לבד, אז אני מאחרת כל בוקר.',
	'סבתא שלי הפסיקה ללכת ברגל אחרי שנפלה על מדרכה שבורה.',
	'האוטובוס עוצר רחוק, ואני הולך על הכביש כי אין מדרכה.',
];
const storyIds = await writeRound(s, storyItem, bots, STORIES);

// A hearts B: +1 to B, nothing to A's own effort credit
const aRatingBefore = (await participant(sessionId, a.uid)).points.rating ?? 0;
await rate(s, a, storyItem.statementId, storyIds[1], 1);
await until('B paid for the heart', async () => (await appreciation(sessionId, b.uid)) === 1);
const bRow = await participant(sessionId, b.uid);
eq('the ledger names the evaluation', bRow.roundAppreciations[`${a.uid}--${storyIds[1]}`], true);
eq('total moved with it', bRow.points.total, 1);
eq('the reader earned no effort credit for a heart', (await participant(sessionId, a.uid)).points.rating ?? 0, aRatingBefore);

// un-heart, re-heart: still one point
await rate(s, a, storyItem.statementId, storyIds[1], 0);
await wait(2500);
eq('an un-heart claws nothing back', await appreciation(sessionId, b.uid), 1);
await rate(s, a, storyItem.statementId, storyIds[1], 1);
await wait(2500);
eq('a second heart from the same reader pays nothing more', await appreciation(sessionId, b.uid), 1);

// B, C and D heart A (three hearts); D hearts B (two); nobody hearts C
await rate(s, b, storyItem.statementId, storyIds[0], 1);
await rate(s, c, storyItem.statementId, storyIds[0], 1);
await rate(s, d, storyItem.statementId, storyIds[0], 1);
await rate(s, d, storyItem.statementId, storyIds[1], 1);
await rate(s, b, storyItem.statementId, storyIds[3], 0);
await until('A paid three times', async () => (await appreciation(sessionId, a.uid)) === 3);
await until('B paid twice', async () => (await appreciation(sessionId, b.uid)) === 2);
eq('C, unhearted, has nothing', await appreciation(sessionId, c.uid), 0);
eq('an explicit no-heart pays nothing', await appreciation(sessionId, d.uid), 0);
const storyScore = await db.collection(Collections.agoraScores).doc(storyIds[0]).get();
eq('a story never enters the square’s economy', storyScore.exists, false);

// ---------------------------------------------------------------------------
step('3. Moving on closes the story round: every story, ranked by hearts, plus the record');
await advance(sessionId, 3, teacherToken);
s = await until('story outcome written', async () => {
	const row = await session(sessionId);

	return row?.stageState?.story?.outcome ? row : null;
});
eq('on the needs round', s.stage, 'myNeeds');
const storyOutcome = s.stageState.story.outcome;
eq('every story is carried', storyOutcome.selected.length, 4);
eq('most-hearted first', storyOutcome.selected[0].statementId, storyIds[0]);
eq('two hearts second', storyOutcome.selected[1].statementId, storyIds[1]);
eq('a record was written', typeof storyOutcome.summary === 'string' && storyOutcome.summary.length > 0, true);
eq('no C_p bands on a round', storyOutcome.bands, undefined);
eq('all stories marked chosen', (await statement(storyIds[2])).isChosen, true);

// ---------------------------------------------------------------------------
step('4. Needs: 0…1 ratings; the half pays, below it does not, an upgrade pays once');
const NEEDS = ['הילדים יגיעו בבטחה', 'לא לאחר לכיתה', 'מדרכות שאפשר ללכת עליהן', 'שהאוטובוס יעצור קרוב'];
const needIds = await writeRound(s, needsItem, bots, NEEDS);
await rate(s, b, needsItem.statementId, needIds[0], 0.75);
await until('0.75 pays', async () => (await appreciation(sessionId, a.uid)) === 4);
await rate(s, c, needsItem.statementId, needIds[0], 0.25);
await wait(2500);
eq('0.25 does not', await appreciation(sessionId, a.uid), 4);
await rate(s, c, needsItem.statementId, needIds[0], 0.5);
await until('the upgrade to the half pays', async () => (await appreciation(sessionId, a.uid)) === 5);
await rate(s, c, needsItem.statementId, needIds[0], 1);
await wait(2500);
eq('a further upgrade pays nothing more', await appreciation(sessionId, a.uid), 5);
await rate(s, a, needsItem.statementId, needIds[1], 1);
await rate(s, d, needsItem.statementId, needIds[1], 0.5);
await until('B paid for two needs ratings', async () => (await appreciation(sessionId, b.uid)) === 4);
await rate(s, a, needsItem.statementId, needIds[2], 0);
await wait(2500);
eq('a zero pays nothing', await appreciation(sessionId, c.uid), 0);
await until('need ratings aggregated', async () => Number((await statement(needIds[0]))?.evaluation?.numberOfEvaluators ?? 0) === 2);

await advance(sessionId, 4, teacherToken);
s = await until('needs outcome written', async () => {
	const row = await session(sessionId);

	return row?.stageState?.myNeeds?.outcome ? row : null;
});
eq('on the vision round', s.stage, 'vision');
const needsOutcome = s.stageState.myNeeds.outcome;
eq('every need is carried', needsOutcome.selected.length, 4);
eq('unrated needs last', needsOutcome.selected[3].statementId, needIds[3]);
eq('the needs record is a list, one need per line', needsOutcome.summary.includes('\n') || needsOutcome.summary.startsWith('•'), true);

// ---------------------------------------------------------------------------
step('5. Vision: weighed the same way; closing merges them');
const VISIONS = ['בעוד שנתיים כל ילד הולך לבד ובבטחה.', 'רחוב בית הספר סגור לרכב בבוקר.', 'מדרכות רחבות ומוצלות עד השער.', 'תחנה ליד השער והורים רגועים.'];
const visionIds = await writeRound(s, visionItem, bots, VISIONS);
await rate(s, a, visionItem.statementId, visionIds[1], 1);
await rate(s, c, visionItem.statementId, visionIds[1], 0.75);
await rate(s, b, visionItem.statementId, visionIds[0], 0.5);
await until('B paid for the vision', async () => (await appreciation(sessionId, b.uid)) === 5);

await advance(sessionId, 5, teacherToken);
s = await until('vision outcome written', async () => {
	const row = await session(sessionId);

	return row?.stageState?.vision?.outcome ? row : null;
});
eq('now deliberating', s.stage, 'deliberation');
eq('deliberation auto-started round 1', s.roundNumber, 1);
const visionOutcome = s.stageState.vision.outcome;
eq('every vision is carried', visionOutcome.selected.length, 4);
eq('a merged vision was written', typeof visionOutcome.summary === 'string' && visionOutcome.summary.length > 0, true);

// ---------------------------------------------------------------------------
step('6. The square runs as it always has; the rounds ride along as carried context');
const PROPOSALS = ['שומר חצייה בכל בוקר ליד השער.', 'סגירת הרחוב לרכב בין 7:30 ל-8:15.', 'תיקון המדרכות ברחוב בית הספר.', 'הזזת התחנה לשער.'];
const proposalIds = [];
for (const [index, bot] of bots.entries()) {
	const statementId = `${sessionId}--${bot.uid}--proposal`;
	await db
		.collection(Collections.statements)
		.doc(statementId)
		.set(buildProposalStatement(s, statementId, bot.uid, bot.anonName, PROPOSALS[index]));
	proposalIds.push(statementId);
}
const pointsBeforeSquare = await appreciation(sessionId, a.uid);
// Everyone else loves proposal 0 → the single trigger fires
await rate(s, b, s.challengeQuestionId, proposalIds[0], 1);
await rate(s, c, s.challengeQuestionId, proposalIds[0], 1);
await rate(s, d, s.challengeQuestionId, proposalIds[0], 1);
await until('proposal scored by the square', async () =>
	(await db.collection(Collections.agoraScores).doc(proposalIds[0]).get()).exists,
);
eq('a −1…+1 rating pays no appreciation', await appreciation(sessionId, a.uid), pointsBeforeSquare);
s = await until('the vote opened by itself', async () => {
	const row = await session(sessionId);

	return row?.stage === 'voting' ? row : null;
});
eq('single-proposal trigger', s.stageState.voting.trigger, 'single');

// Browser leg: a student arriving at the vote sees what the rounds produced
const viteUp = await fetch(VITE_HOST).then((response) => response.ok, () => false);
if (viteUp) {
	step('7. In the browser: the needs list and the vision travel with the room');
	const { chromium } = await import('playwright');
	const browser = await chromium.launch();
	try {
		const page = await browser.newPage();
		await page.goto(game.joinUrl, { waitUntil: 'domcontentloaded' });
		await passNameDoor(page);
		await page.waitForSelector('.carried', { timeout: 30_000 });
		await page.locator('.carried__toggle[aria-expanded="false"]').first().click().catch(() => {});
		await page.waitForSelector('.carried__item--round', { timeout: 15_000 });
		const carried = await page.locator('.carried__item--round').count();
		eq('the three rounds are carried onto the screen', carried, 3);
		const text = await page.locator('.carried__summary').allTextContents();
		eq('the merged vision is on it', text.some((line) => line.includes(visionOutcome.summary.slice(0, 12))), true);
	} finally {
		await browser.close();
	}
} else {
	console.log('\n   (vite is not up — the browser leg was skipped)');
}

// ---------------------------------------------------------------------------
step('8. Results: the ledger adds up');
await advance(sessionId, 7, teacherToken);
s = await until('results computed', async () => {
	const row = await session(sessionId);

	return row?.agreement ? row : null;
});
eq('results', s.stage, 'results');
const aFinal = await participant(sessionId, a.uid);
eq('appreciation is its own line in the points', aFinal.points.appreciation, 6);
eq('B’s ledger: two hearts, two needs, two visions', await appreciation(sessionId, b.uid), 6);
eq('and is inside the total', aFinal.points.total >= aFinal.points.appreciation, true);

// Legacy presets still stand
eq('classic still validates', stagePlanPreset('classic').length, 8);
eq('quickDecision still validates', stagePlanPreset('quickDecision').length, 5);

console.log(`\n✓ wizcol rounds: all checks passed (session ${sessionId})`);
process.exit(0);
