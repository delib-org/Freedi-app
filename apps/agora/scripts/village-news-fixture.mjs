/* A village session to inspect the news chips in a real browser.
 *
 *   npx tsx scripts/village-news-fixture.mjs            → prints the join URL
 *   npx tsx scripts/village-news-fixture.mjs --plant <sessionId> <studentUid>
 *       → a classmate's idea on the student's note + an owner's reply on a
 *         classmate's note, so both chips and the board badge light up
 *
 * Point AGORA_* / *_EMULATOR_HOST at the suite the browser uses (see
 * env/ports.solo.sh for the solo suite; the alt suite is 9109/8091/5011).
 */
import { createRequire } from 'node:module';
import { db, fastlane } from './lib/fastlane.ts';

const require = createRequire(import.meta.url);
const { AgoraMessageKind, Collections } = require('@freedi/shared-types');
const { buildThreadMessageStatement } = require('../src/lib/statementDocs');

const args = process.argv.slice(2);

if (args[0] === '--plant') {
	const [, sessionId, uid] = args;
	if (!sessionId || !uid) throw new Error('usage: --plant <sessionId> <studentUid>');
	const session = (await db.collection(Collections.agoraSessions).doc(sessionId).get()).data();
	const statements = await db
		.collection(Collections.statements)
		.where('agoraSessionId', '==', sessionId)
		.get();
	const docs = statements.docs.map((d) => d.data());
	const notes = docs.filter((s) => s.statementType !== 'suggestion' && !s.parentId?.startsWith('fastlane-') );
	const mine = docs.find((s) => s.creatorId === uid && s.statementType !== 'suggestion');
	if (!mine) throw new Error('the student has not written a note yet');
	const theirs = notes.find((s) => s.creatorId !== uid && s.statementType === mine.statementType);
	if (!theirs) throw new Error('no classmate note to reply from');
	const participants = await db
		.collection(Collections.agoraParticipants)
		.where('sessionId', '==', sessionId)
		.get();
	const nameOf = (who) => participants.docs.map((d) => d.data()).find((p) => p.userId === who)?.anonName ?? who;
	const plant = async (noteId, author, text, kind, threadUserId) => {
		const ref = db.collection(Collections.statements).doc();
		await ref.set(
			buildThreadMessageStatement(session, noteId, ref.id, author, nameOf(author), text, kind, threadUserId),
		);
	};
	await plant(mine.statementId, theirs.creatorId, 'אולי כדאי להוסיף נציג שמתחלף כל שבועיים.', AgoraMessageKind.suggestion, theirs.creatorId);
	await plant(theirs.statementId, theirs.creatorId, 'תודה! תוכלו לחדד מי אוכף את לוח הזמנים?', AgoraMessageKind.chat, uid);
	console.log(`planted: an idea on ${mine.statementId}, an owner reply on ${theirs.statementId}`);
	process.exit(0);
}

const run = await fastlane({
	stage: 'deliberation',
	students: 2,
	proposals: 2,
	ratings: false,
	stagePlan: [
		{ itemId: 'lobby', stage: 'lobby' },
		{ itemId: 'deliberation', stage: 'deliberation' },
		{ itemId: 'results', stage: 'results' },
	],
	runId: `news-fixture-${Date.now().toString(36)}`,
	quiet: true,
});
await db.collection(Collections.agoraSessions).doc(run.sessionId).update({ world: 'village' });
console.log(`session ${run.sessionId}\njoin ${run.joinUrl}`);
process.exit(0);
