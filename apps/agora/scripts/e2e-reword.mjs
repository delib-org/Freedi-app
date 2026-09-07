/* Rewording the question the room is looking at.
 *
 * The class does not understand "what matters to you here?", so the teacher
 * rewrites it mid-round. Two scopes: keep the words to this game, or make
 * them this teacher's own wording for every `needs` round they ever open.
 *
 * Also: the words reach the question Statement, an already-opened round can
 * be reworded (which agoraUpdateStagePlan refuses), an open question cannot
 * be reworded "for all games like it", and a stranger cannot reword at all.
 *
 * Asserts Firestore state, not pixels.
 *
 * Run: node scripts/e2e-reword.mjs
 */
import { createRequire } from 'node:module';
import { preflight } from './lib/preflight.mjs';
import { eq, fail, step } from './lib/e2e.mjs';
import { callable, db, fastlane, signInTeacher } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraStage, Collections, stagePlanPreset } = require('@freedi/shared-types');

await preflight();

const session = async (sessionId) =>
	(await db.collection(Collections.agoraSessions).doc(sessionId).get()).data();
const statement = async (statementId) =>
	(await db.collection(Collections.statements).doc(statementId).get()).data();
const itemOf = (row, itemId) => row.stagePlan.find((item) => item.itemId === itemId);

const ALLOWED = Symbol('allowed');

async function refused(label, run) {
	let error = ALLOWED;
	try {
		await run();
	} catch (thrown) {
		error = thrown;
	}
	if (error === ALLOWED) fail(`${label}: the server allowed it`);
	console.log(`   ✓ ${label} (${String(error.message).slice(0, 80)})`);
}

// ---------------------------------------------------------------------------
step('1. A WizCol game whose rounds carry no wording of their own');
// One teacher identity for the whole run — the standing wording is theirs.
const teacher = await signInTeacher(`reword-${Date.now()}`);
const plan = stagePlanPreset('wizcol');
const game = await fastlane({
	stage: AgoraStage.lobby,
	students: 2,
	proposals: 0,
	quiet: true,
	teacher,
	quick: {
		title: 'הפסקות בבית הספר',
		mainQuestion: 'איך ההפסקות אצלנו ייראו?',
		explanation: 'משהו שכולנו יכולים לחיות איתו.',
	},
	stagePlan: plan,
});
const { sessionId, teacherToken } = game;
let s = await session(sessionId);
const needs = itemOf(s, 'round-needs');
eq('the needs round stores no title — the phones render the book prompt', needs.title, '');
eq('…and no explanation', needs.explanation, undefined);

// ---------------------------------------------------------------------------
step('2. The needs round opens and the class does not understand it');
const needsIndex = s.stagePlan.findIndex((item) => item.itemId === 'round-needs');
await callable('agoraAdvanceStage', { sessionId, toIndex: needsIndex }, teacherToken);
s = await session(sessionId);
eq('the room is on the needs round', s.stageIndex, needsIndex);

// The plan editor cannot help here: it keeps the opened item byte-for-byte as
// stored and drops the teacher's new words on the floor. That silence is the
// whole reason agoraRewordQuestion exists.
const dropped = await callable(
	'agoraUpdateStagePlan',
	{
		sessionId,
		stagePlan: s.stagePlan.map((item) =>
			item.itemId === 'round-needs' ? { ...item, title: 'nope' } : item,
		),
	},
	teacherToken,
);
eq(
	'agoraUpdateStagePlan drops an edit to the opened item',
	dropped.stagePlan.find((item) => item.itemId === 'round-needs').title,
	'',
);

// ---------------------------------------------------------------------------
step('3. The teacher rewords it — just here');
const HERE = 'מה חשוב לכם שיקרה בהפסקה?';
const HERE_HINT = 'לא פתרון. מה חשוב לכם.';
let result = await callable(
	'agoraRewordQuestion',
	{ sessionId, itemId: 'round-needs', title: HERE, explanation: HERE_HINT, scope: 'session' },
	teacherToken,
);
eq('one item reworded', result.itemIds.length, 1);
eq('nothing filed as a default', result.savedAsDefault, false);
s = await session(sessionId);
eq('the plan carries the new words', itemOf(s, 'round-needs').title, HERE);
eq('…and the new hint', itemOf(s, 'round-needs').explanation, HERE_HINT);
const needsDoc = await statement(itemOf(s, 'round-needs').statementId);
eq('the question Statement was reworded too', needsDoc.statement, HERE);
eq('…description as well', needsDoc.description, HERE_HINT);
eq('the story round is untouched', itemOf(s, 'round-story').title, '');
const stored = await db.collection(Collections.agoraTeacherPrompts).doc(teacher.uid).get();
eq('no standing wording saved for scope=session', stored.exists, false);

// ---------------------------------------------------------------------------
step('4. …and then decides it should hold for every needs round of theirs');
const FOREVER = 'מה חשוב לך שיקרה כאן?';
const FOREVER_HINT = 'לא פתרון, לא הצעה — מה חשוב לך.';
result = await callable(
	'agoraRewordQuestion',
	{ sessionId, itemId: 'round-needs', title: FOREVER, explanation: FOREVER_HINT, scope: 'kind' },
	teacherToken,
);
eq('filed as this teacher’s wording', result.savedAsDefault, true);
s = await session(sessionId);
eq('this game shows the new words', itemOf(s, 'round-needs').title, FOREVER);
const prompts = (await db.collection(Collections.agoraTeacherPrompts).doc(teacher.uid).get()).data();
eq('the needs wording is stored', prompts.prompts.needs.title, FOREVER);
eq('…with its hint', prompts.prompts.needs.explanation, FOREVER_HINT);
eq('and nothing else is', prompts.prompts.story, undefined);

// ---------------------------------------------------------------------------
step('5. A round already answered keeps the words it was answered under');
// Walk the room past the needs round, then reword the vision round for every
// vision of theirs: the closed needs round is a different kind, so reach for a
// case that bites — reword STORY (already closed) by kind from a later stage.
const storyBefore = itemOf(s, 'round-story').title;
const visionIndex = s.stagePlan.findIndex((item) => item.itemId === 'round-vision');
await callable('agoraAdvanceStage', { sessionId, toIndex: visionIndex }, teacherToken);
s = await session(sessionId);
eq('the room is on the vision round', s.stageIndex, visionIndex);
await callable(
	'agoraRewordQuestion',
	{ sessionId, itemId: 'round-vision', title: 'איך זה ייראה?', explanation: '', scope: 'kind' },
	teacherToken,
);
s = await session(sessionId);
eq('the vision round took the new words', itemOf(s, 'round-vision').title, 'איך זה ייראה?');
eq('the closed story round was not swept up', itemOf(s, 'round-story').title, storyBefore);
eq('nor the closed needs round', itemOf(s, 'round-needs').title, FOREVER);

// ---------------------------------------------------------------------------
step('6. The teacher’s NEXT game opens with those words already in place');
const later = await fastlane({
	stage: AgoraStage.lobby,
	students: 1,
	proposals: 0,
	quiet: true,
	teacher,
	quick: { title: 'שיעורי בית', mainQuestion: 'כמה שיעורי בית זה נכון?' },
	stagePlan: stagePlanPreset('wizcol'),
});
const laterRow = await session(later.sessionId);
eq('the needs round of the new game is already reworded', itemOf(laterRow, 'round-needs').title, FOREVER);
eq('…with the hint', itemOf(laterRow, 'round-needs').explanation, FOREVER_HINT);
eq('the story round still takes the book’s prompt', itemOf(laterRow, 'round-story').title, '');
const laterDoc = await statement(itemOf(laterRow, 'round-needs').statementId);
eq('the new game’s question Statement carries the words', laterDoc.statement, FOREVER);

// ---------------------------------------------------------------------------
step('7. What the server refuses');
const openPlan = stagePlanPreset('quickDecision').map((item) =>
	item.stage === AgoraStage.question ? { ...item, title: 'מה נעשה?' } : item,
);
const openGame = await fastlane({
	stage: AgoraStage.lobby,
	students: 1,
	proposals: 0,
	quiet: true,
	teacher,
	quick: { title: 'טיול שנתי', mainQuestion: 'לאן ניסע?' },
	stagePlan: openPlan,
});
const openRow = await session(openGame.sessionId);
const openItem = openRow.stagePlan.find((item) => item.stage === AgoraStage.question);

await refused('an open question has no "every game like it"', () =>
	callable(
		'agoraRewordQuestion',
		{ sessionId: openGame.sessionId, itemId: openItem.itemId, title: 'x', explanation: '', scope: 'kind' },
		openGame.teacherToken,
	),
);
await refused('an open question cannot be left without words', () =>
	callable(
		'agoraRewordQuestion',
		{ sessionId: openGame.sessionId, itemId: openItem.itemId, title: '  ', explanation: '', scope: 'session' },
		openGame.teacherToken,
	),
);
await refused('a stage that is not a question', () =>
	callable(
		'agoraRewordQuestion',
		{ sessionId, itemId: AgoraStage.deliberation, title: 'x', explanation: '', scope: 'session' },
		teacherToken,
	),
);
const stranger = await signInTeacher(`stranger-${Date.now()}`);
await refused('a teacher who does not own the game', () =>
	callable(
		'agoraRewordQuestion',
		{ sessionId, itemId: 'round-needs', title: 'x', explanation: '', scope: 'session' },
		stranger.idToken,
	),
);
s = await session(sessionId);
eq('the words the room reads never moved', itemOf(s, 'round-needs').title, FOREVER);

console.log('\n✓ reword: the words change under the room, and stick when the teacher says so');
process.exit(0);
