/* Notes dealt by lottery, as the server deals them.
 *
 * Eight bots write at the challenge question. Each asks for a hand: five
 * notes, none their own, spread evenly across the class. A ninth note posted
 * late changes nothing for full hands; once a bot has rated its hand through,
 * the next fill deals it exactly one note — the least-read one, which is the
 * late one — and "draw more" empties the rest of the pool. A six-student class
 * is told the lottery is off.
 *
 * API-only (no browser). Run against the solo suite:
 *   npm run solo -- npx tsx apps/agora/scripts/e2e-hand.mjs
 */
import { createRequire } from 'node:module';
import { callable, db, fastlane, proposeAs } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AGORA_LOTTERY, AgoraStage, Collections } = require('@freedi/shared-types');

let failures = 0;
function step(title) {
	console.info(`\n${title}`);
}
function check(ok, what) {
	console.info(`   ${ok ? '✓' : '✗'} ${what}`);
	if (!ok) failures += 1;
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function deal(sessionId, parentId, bot, mode) {
	return callable('agoraDealNotes', { sessionId, parentId, mode }, bot.idToken);
}

async function rateAs(session, rater, statementId, value) {
	const evaluationId = `${rater.uid}--${statementId}`;
	await db.collection(Collections.evaluations).doc(evaluationId).set({
		evaluationId,
		parentId: session.challengeQuestionId,
		statementId,
		evaluatorId: rater.uid,
		evaluation: value,
		evaluator: { uid: rater.uid, displayName: rater.anonName, isAnonymous: true },
		agoraSessionId: session.sessionId,
		updatedAt: Date.now(),
	});
	await sleep(120);
}

step('1. Nine students, eight notes, at the square');
const game = await fastlane({
	stage: AgoraStage.deliberation,
	students: 9,
	proposals: 8,
	ratings: false,
	quiet: true,
});
const sessionSnap = await db.collection(Collections.agoraSessions).doc(game.sessionId).get();
const session = sessionSnap.data();
const parentId = session.challengeQuestionId;
const writers = game.bots.filter((bot) => bot.proposalId);
const latecomer = game.bots.find((bot) => !bot.proposalId);
check(writers.length === 8 && latecomer !== undefined, '8 writers and 1 who has not written yet');

step('2. Every writer is dealt a hand of five, none their own, spread evenly');
const hands = new Map();
for (const bot of writers) {
	const result = await deal(game.sessionId, parentId, bot, 'fill');
	hands.set(bot.uid, result);
	check(result.active === true, `${bot.anonName}: lottery active`);
	check(result.hand.length === AGORA_LOTTERY.HAND_SIZE, `${bot.anonName}: hand of ${result.hand.length}`);
	check(!result.hand.includes(bot.proposalId), `${bot.anonName}: never their own note`);
	check(new Set(result.hand).size === result.hand.length, `${bot.anonName}: no duplicates`);
	check(result.dealt.length === result.hand.length, `${bot.anonName}: the first fill dealt the whole hand`);
}
const dealtCount = new Map();
for (const { hand } of hands.values()) {
	for (const id of hand) dealtCount.set(id, (dealtCount.get(id) ?? 0) + 1);
}
const counts = writers.map((bot) => dealtCount.get(bot.proposalId) ?? 0);
const total = counts.reduce((sum, n) => sum + n, 0);
check(total === 8 * AGORA_LOTTERY.HAND_SIZE, `${total} deals in all`);
// Least-dealt-first, one student at a time, cannot always land within one
// deal of even: a student never takes their own note, so the note that is
// behind may belong to exactly the student whose turn it is. Two is the bound.
check(
	Math.max(...counts) - Math.min(...counts) <= 2,
	`spread ${Math.min(...counts)}–${Math.max(...counts)} deals per note`,
);

step('3. The hand doc is what the server wrote, and a repeated fill changes nothing');
const handDoc = await db.collection(Collections.agoraHands).doc(`${game.sessionId}--${writers[0].uid}`).get();
check(handDoc.exists && handDoc.data().userId === writers[0].uid, 'agoraHands doc exists for the student');
check(
	JSON.stringify(handDoc.data()?.hands?.[parentId]) === JSON.stringify(hands.get(writers[0].uid).hand),
	'doc hand equals the callable’s hand',
);
const again = await deal(game.sessionId, parentId, writers[0], 'fill');
check(again.dealt.length === 0 && again.hand.length === AGORA_LOTTERY.HAND_SIZE, 'second fill is a no-op');

step('4. A late note arrives; full, unrated hands stay as they are');
const lateId = await proposeAs(game.sessionId, latecomer.uid, 'הצעה מאוחרת: לפתוח את הדיון מחדש בכל שבוע.');
for (const bot of writers.slice(0, 3)) {
	const result = await deal(game.sessionId, parentId, bot, 'fill');
	check(result.dealt.length === 0, `${bot.anonName}: nothing dealt while the hand is unrated`);
}

step('5. A student rates their hand through and is dealt exactly the least-read note');
const reader = writers[0];
for (const id of hands.get(reader.uid).hand) await rateAs(session, reader, id, 0.5);
const next = await deal(game.sessionId, parentId, reader, 'fill');
check(next.dealt.length === 1, `one note dealt (${next.dealt.length})`);
check(next.dealt[0] === lateId, 'and it is the late note (fewest readers)');
check(next.hand.length === AGORA_LOTTERY.HAND_SIZE + 1, 'hand grew to six');
const once = await deal(game.sessionId, parentId, reader, 'fill');
check(once.dealt.length === 0, 'the late note is unrated now, so no further deal');

step('6. "Draw more" empties what is left for that student');
const more = await deal(game.sessionId, parentId, reader, 'more');
// 8 peers (7 writers + the latecomer) minus 6 held = 2 left
check(more.dealt.length === 2, `drew the remaining ${more.dealt.length}`);
check(more.poolExhausted === true, 'pool exhausted');
check(new Set(more.hand).size === 8 && !more.hand.includes(reader.proposalId), 'holds every classmate’s note, never their own');

step('7. A teacher or a stranger is never dealt a hand');
let teacherDealt = null;
try {
	teacherDealt = await callable('agoraDealNotes', { sessionId: game.sessionId, parentId, mode: 'fill' }, game.teacherToken);
} catch (error) {
	check(/permission-denied|PERMISSION_DENIED/i.test(String(error.message)), `teacher refused: ${error.message}`);
}
check(teacherDealt === null, 'teacher got nothing');

step('8. Six students: everyone reads everyone, the lottery is off');
const small = await fastlane({
	stage: AgoraStage.deliberation,
	students: 6,
	proposals: 6,
	ratings: false,
	quiet: true,
});
const smallSession = (await db.collection(Collections.agoraSessions).doc(small.sessionId).get()).data();
const off = await deal(small.sessionId, smallSession.challengeQuestionId, small.bots[0], 'fill');
check(off.active === false && off.hand.length === 0, 'active:false, no hand');

console.info(failures === 0 ? '\nPASS: notes are dealt by lottery' : `\nFAIL: ${failures} checks failed`);
process.exit(failures === 0 ? 0 : 1);
