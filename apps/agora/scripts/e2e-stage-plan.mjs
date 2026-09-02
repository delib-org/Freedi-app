/* The stage plan, end to end — the Vosh scenario.
 *
 * A quick game with no scenario behind it: the admin types the main question,
 * lines up lobby → question → deliberation → voting → results, and asks for
 * names. Three people join with their names. They answer the question and
 * rate each other's answers; the admin moves on and the top answers travel
 * forward with a summary. They propose; the room nearly all loves one
 * proposal, so the vote opens BY ITSELF — for or against that one proposal.
 * Two for, one against: adopted. Results name the decision.
 *
 * Also: the frozen prefix of the plan cannot be edited, a stale advance is
 * refused, a legacy session (no plan) still runs the old order by stage kind,
 * and question answers never leak into the square's economy.
 *
 * Asserts Firestore state, not pixels.
 *
 * Run: node scripts/e2e-stage-plan.mjs (needs emulators with LIVE triggers —
 * a functions bundle rebuilt since the suite started means restart it first)
 */
import { createRequire } from 'node:module';
import { preflight, FIRESTORE_REST } from './lib/preflight.mjs';
import { eq, fail, step } from './lib/e2e.mjs';
import { callable, db, fastlane, signInTeacher, signUpAnonymous } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraStage, Collections, CutoffBy, VOTE_AGAINST, stagePlanPreset } = require('@freedi/shared-types');
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

const str = (value) => ({ stringValue: value });
const num = (value) => ({ integerValue: String(value) });

/** A vote as a real signed-in client writes it — the rules apply */
async function castVote(uid, token, parentId, statementId) {
	const voteId = `${uid}--${parentId}`;
	const response = await fetch(`${FIRESTORE_REST}/votes/${voteId}`, {
		method: 'PATCH',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
		body: JSON.stringify({
			fields: {
				voteId: str(voteId),
				statementId: str(statementId),
				userId: str(uid),
				parentId: str(parentId),
				createdAt: num(Date.now()),
				lastUpdate: num(Date.now()),
			},
		}),
	});
	if (!response.ok) fail(`vote by ${uid} refused: ${response.status} ${await response.text()}`);
}

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
	// The pipeline read-modify-writes the statement; simultaneous ratings of
	// the same statement overlap and one can be lost. The FIRST rating of a
	// statement is the worst: it also sends the pipeline down the repair path
	// that rewrites the whole evaluation block, and a second rating landing
	// inside that window is overwritten. Give the first one room.
	await wait(ratedOnce.has(statementId) ? 300 : 1800);
	ratedOnce.add(statementId);
}

// ---------------------------------------------------------------------------
step('1. A quick, named game on the quick-decision plan');
const plan = stagePlanPreset('quickDecision').map((item) =>
	item.stage === AgoraStage.question
		? {
				...item,
				title: 'מה אני רוצה?',
				explanation: 'מה היית רוצה שיקרה בבקרים.',
				selection: { cutoffBy: CutoffBy.topOptions, numberOfResults: 2, cutoffNumber: 0 },
			}
		: item.stage === AgoraStage.deliberation
			? { ...item, votingTrigger: { enabled: true, singleMin: 0.85, pairMin: 0.5, minRaters: 2 } }
			: item,
);
const game = await fastlane({
	stage: AgoraStage.lobby,
	students: 3,
	proposals: 0,
	quiet: true,
	quick: { title: 'בקרים בבית שלנו', mainQuestion: 'איך ווש יכולה לקום בזמן בבוקר?', explanation: 'פתרון שכולנו חיים איתו.' },
	identity: 'named',
	botNames: ['אבא', 'אמא', 'ווש'],
	stagePlan: plan,
});
const { sessionId, bots, teacherToken } = game;
const [dad, mum, vosh] = bots;
let s = await session(sessionId);
eq('starts in the lobby', s.stage, 'lobby');
eq('plan pointer at 0', s.stageIndex, 0);
eq('named room', s.identity, 'named');
eq('five stages stored (ended is never stored)', s.stagePlan.length, 5);
const questionItem = s.stagePlan[1];
eq('the question item got its Statement', Boolean(questionItem.statementId), true);
const questionDoc = await statement(questionItem.statementId);
eq('question Statement kind', questionDoc.statementType, 'question');
eq('question hangs off the session root', questionDoc.parentId, s.rootStatementId);
eq('explanation stored as description', questionDoc.description, 'מה היית רוצה שיקרה בבקרים.');
const topic = (await db.collection(Collections.agoraTopicPackages).doc(s.topicPackageId).get()).data();
eq('quick topic shell', topic.kind, 'quick');
eq('main question on the shell', topic.challengeQuestion, 'איך ווש יכולה לקום בזמן בבוקר?');
eq('typed name is the card name', dad.anonName, 'אבא');
const aiRaters = await db
	.collection(Collections.agoraParticipants)
	.where('sessionId', '==', sessionId)
	.where('isAI', '==', true)
	.get();
eq('no synthetic raters seeded for a quick game', aiRaters.size, 0);

// ---------------------------------------------------------------------------
step('2. The question opens; everyone answers and rates');
await callable('agoraAdvanceStage', { sessionId, toIndex: 1 }, teacherToken);
s = await session(sessionId);
eq('stage kind mirrors the item', s.stage, 'question');
eq('pointer moved', s.stageIndex, 1);
eq('openedAt stamped by field path', typeof s.stageState['question-1'].openedAt, 'number');

const ANSWERS = ['שקט בבוקר ובלי צעקות', 'שעון מעורר שאני בוחרת', 'ארוחת בוקר טעימה שמחכה'];
const answerIds = [];
for (const [index, bot] of bots.entries()) {
	const statementId = `${sessionId}--${bot.uid}--question-1`;
	await db
		.collection(Collections.statements)
		.doc(statementId)
		.set(buildAnswerStatement(s, questionItem.statementId, statementId, bot.uid, bot.anonName, ANSWERS[index]));
	answerIds.push(statementId);
}
// Ratings: answer 0 loved (+1,+1), answer 1 liked (+0.5,+0.5), answer 2 mixed (+0.5,-1)
const ANSWER_RATINGS = [
	[1, 1],
	[0.5, 0.5],
	[0.5, -1],
];
for (const [index, statementId] of answerIds.entries()) {
	const raters = bots.filter((bot) => bot.uid !== bots[index].uid);
	for (const [r, rater] of raters.entries()) {
		await rate(s, rater, questionItem.statementId, statementId, ANSWER_RATINGS[index][r]);
	}
}
await until('answer ratings aggregated by the shared pipeline', async () => {
	const docs = await Promise.all(answerIds.map(statement));

	return docs.every((doc) => Number(doc?.evaluation?.numberOfEvaluators ?? 0) === 2);
});
const firstAnswer = await statement(answerIds[0]);
eq('net agreement is the plain mean', Math.round(firstAnswer.evaluation.averageEvaluation * 100) / 100, 1);
const answerScore = await db.collection(Collections.agoraScores).doc(answerIds[0]).get();
eq('question answers get no bridging score', answerScore.exists, false);

// ---------------------------------------------------------------------------
step('3. Moving on closes the question: top answers + summary travel forward');
await callable('agoraAdvanceStage', { sessionId, toIndex: 2 }, teacherToken);
s = await until('question outcome written', async () => {
	const row = await session(sessionId);

	return row?.stageState?.['question-1']?.outcome ? row : null;
});
eq('now deliberating', s.stage, 'deliberation');
eq('deliberation auto-started round 1', s.roundNumber, 1);
const outcome = s.stageState['question-1'].outcome;
eq('top-2 cutoff applied', outcome.selected.length, 2);
eq('best answer first', outcome.selected[0].statementId, answerIds[0]);
eq('second best second', outcome.selected[1].statementId, answerIds[1]);
eq('named room carries the name', outcome.selected[0].anonName, bots[0].anonName);
eq('a summary was written', typeof outcome.summary === 'string' && outcome.summary.length > 0, true);
const closedQuestion = await statement(questionItem.statementId);
eq('results written on the question Statement', (closedQuestion.results ?? []).length, 2);
eq('chosen answers marked', (await statement(answerIds[0])).isChosen, true);
eq('the rest not', (await statement(answerIds[2])).isChosen, false);

// ---------------------------------------------------------------------------
step('4. The plan is frozen behind the room, editable ahead of it');
let refused = false;
try {
	await callable(
		'agoraUpdateStagePlan',
		{ sessionId, stagePlan: [...s.stagePlan.slice(0, 1), ...s.stagePlan.slice(2)] },
		teacherToken,
	);
} catch (error) {
	refused = /FAILED_PRECONDITION|failed-precondition|already opened/i.test(String(error));
}
eq('removing an opened item is refused', refused, true);
const withSecondQuestion = [
	...s.stagePlan.slice(0, 3),
	{ itemId: 'question-2', stage: 'question', title: 'מה למדנו?', selection: { cutoffBy: 'topOptions', numberOfResults: 1, cutoffNumber: 0 } },
	...s.stagePlan.slice(3),
];
const updated = await callable('agoraUpdateStagePlan', { sessionId, stagePlan: withSecondQuestion }, teacherToken);
eq('a question added ahead of the room', updated.stagePlan.length, 6);
eq('new question got its Statement', Boolean(updated.stagePlan[3].statementId), true);
eq('frozen question kept its Statement', updated.stagePlan[1].statementId, questionItem.statementId);
// put the plan back to the four-stage tail so the rest of the script reads simply
await callable('agoraUpdateStagePlan', { sessionId, stagePlan: s.stagePlan }, teacherToken);
let stale = false;
try {
	await callable('agoraAdvanceStage', { sessionId, toIndex: 2 }, teacherToken);
} catch (error) {
	stale = /FAILED_PRECONDITION|failed-precondition|forward/i.test(String(error));
}
eq('a stale advance is refused', stale, true);

// ---------------------------------------------------------------------------
step('5. Proposals; the room agrees on one, and the vote opens by itself');
s = await session(sessionId);
const PROPOSALS = ['שעון מעורר אחד, מוסכם, בלי נודניק ובלי מסכים אחרי תשע.', 'ללכת לישון שעה מוקדם יותר.', 'לקום עם המוזיקה שווש בוחרת.'];
const proposalIds = [];
for (const [index, bot] of bots.entries()) {
	const statementId = `${sessionId}--${bot.uid}--proposal`;
	await db
		.collection(Collections.statements)
		.doc(statementId)
		.set(buildProposalStatement(s, statementId, bot.uid, bot.anonName, PROPOSALS[index]));
	proposalIds.push(statementId);
}
// Proposal 2 is merely liked by one person (n=1 — under the raters floor)
await rate(s, dad, s.challengeQuestionId, proposalIds[2], 1);
// Proposal 1 is broadly liked by two (mean 0.5 — a PAIR needs two of these)
await rate(s, dad, s.challengeQuestionId, proposalIds[1], 0.5);
await rate(s, vosh, s.challengeQuestionId, proposalIds[1], 0.5);
await wait(3000);
s = await session(sessionId);
eq('one liked proposal is not yet a room that agreed', s.stage, 'deliberation');
// Proposal 0: everyone else loves it (mean 1, n=2 ≥ minRaters 2) → single fires
await rate(s, mum, s.challengeQuestionId, proposalIds[0], 1);
await rate(s, vosh, s.challengeQuestionId, proposalIds[0], 1);
s = await until('voting opened automatically', async () => {
	const row = await session(sessionId);

	return row?.stage === 'voting' ? row : null;
});
eq('pointer on the voting item', s.stageIndex, 3);
eq('opened by the single rule', s.stageState.voting.trigger, 'single');
eq('the ballot is that one proposal', s.voting.candidateIds.length, 1);
eq('the loved one', s.voting.candidateIds[0], proposalIds[0]);
const proposalScore = (await db.collection(Collections.agoraScores).doc(proposalIds[0]).get()).data();
eq('students-only count', proposalScore.classConsensus.n, 2);
eq('students-only mean', proposalScore.classConsensus.mean, 1);

// ---------------------------------------------------------------------------
step('6. For or against: two for, one against');
await castVote(dad.uid, dad.idToken, s.challengeQuestionId, proposalIds[0]);
await castVote(mum.uid, mum.idToken, s.challengeQuestionId, proposalIds[0]);
await castVote(vosh.uid, vosh.idToken, s.challengeQuestionId, VOTE_AGAINST);
await until('tallies counted', async () => {
	const question = await statement(s.challengeQuestionId);
	const selections = question?.selections ?? {};

	return selections[proposalIds[0]] === 2 && selections[VOTE_AGAINST] === 1;
});

// ---------------------------------------------------------------------------
step('7. Results: the decision, then the end');
await callable('agoraAdvanceStage', { sessionId, toIndex: 4 }, teacherToken);
s = await until('agreement results written', async () => {
	const row = await session(sessionId);

	return row?.agreement ? row : null;
});
eq('results open', s.stage, 'results');
eq('no bridging score for an agreement room', s.classScore, undefined);
eq('the vote adopted it', s.agreement.voteWinnerStatementId, proposalIds[0]);
eq('not rejected', s.agreement.voteRejected, false);
eq('two for', s.agreement.voteCounts[proposalIds[0]], 2);
eq('one against', s.agreement.voteCounts[VOTE_AGAINST], 1);
eq('ranked first by net agreement', s.agreement.ranked[0].statementId, proposalIds[0]);
eq('named', s.agreement.ranked[0].anonName, bots[0].anonName);
await callable('agoraAdvanceStage', { sessionId, toIndex: 5 }, teacherToken);
s = await session(sessionId);
eq('ended', s.stage, 'ended');
eq('status ended', s.status, 'ended');
await until('finished session aggregated (agreement counts as finished)', async () => {
	const row = await session(sessionId);

	return row?.aggregatedAt !== undefined;
}, { timeoutMs: 20_000 });

// ---------------------------------------------------------------------------
step('8. A legacy session (no plan) still runs the old order by stage kind');
const legacyTeacher = await signInTeacher(`stage-plan-legacy-${Date.now().toString(36)}`);
const legacy = await callable(
	'agoraCreateSession',
	{ topicPackageId: 'demo-french-revolution', deviceMode: 'individual' },
	legacyTeacher.idToken,
);
const legacyBot = await signUpAnonymous();
await callable('agoraJoinSession', { code: legacy.code }, legacyBot.idToken);
let legacyRow = await session(legacy.sessionId);
eq('no plan stored', legacyRow.stagePlan, undefined);
await callable('agoraAdvanceStage', { sessionId: legacy.sessionId, stage: 'framing' }, legacyTeacher.idToken);
legacyRow = await session(legacy.sessionId);
eq('kind-based advance still works', legacyRow.stage, 'framing');
eq('and now carries a pointer', legacyRow.stageIndex, 1);
let backwards = false;
try {
	await callable('agoraAdvanceStage', { sessionId: legacy.sessionId, stage: 'lobby' }, legacyTeacher.idToken);
} catch (error) {
	backwards = /FAILED_PRECONDITION|failed-precondition|no such stage/i.test(String(error));
}
eq('stages only move forward', backwards, true);

console.log('\n✓ e2e-stage-plan: all assertions passed');
process.exit(0);
