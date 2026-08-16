/* A class rates at once — does the pipeline keep up?
 *
 *   npx tsx scripts/load-smoke.ts                        # 30 students, 10 proposals
 *   npx tsx scripts/load-smoke.ts --students=40 --proposals=15
 *
 * The worry was never the writes. It is the fan-out behind them: every rating
 * fires onAgoraEvaluationWritten, which recounts that proposal's camps from its
 * evaluations, rewrites the score document, and wakes every connected client.
 * A round of rating in a real classroom is not a trickle — it is the whole room
 * pressing at once because the teacher just said "now rate them".
 *
 * So: seed a class straight into Firestore, have every student rate every
 * proposal as fast as the emulator will accept them, and wait for the scores to
 * settle. A proposal is settled when its camps account for every rating it
 * received; anything less means a trigger dropped work under load, which is the
 * failure this exists to catch.
 */
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { PROJECT_ID, preflight } from './lib/preflight.mjs';
import { fastlane } from './lib/fastlane';

const num = (name: string, fallback: number): number => {
	const hit = process.argv.find((arg) => arg.startsWith(`--${name}=`));

	return hit ? Number(hit.split('=')[1]) : fallback;
};

const STUDENTS = num('students', 30);
const PROPOSALS = num('proposals', 10);
const SETTLE_TIMEOUT_MS = 120_000;
const RATING_LEVELS = [-1, -0.5, 0, 0.5, 1];

const step = (msg: string): void => console.log(`\n=== ${msg}`);
const fail = (msg: string): never => {
	throw new Error(msg);
};

await preflight();

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8081';
const app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
const db = getFirestore(app);

step(`seeding a class of ${STUDENTS} with ${PROPOSALS} proposals`);
const seedStarted = Date.now();
const run = await fastlane({ students: STUDENTS, proposals: PROPOSALS, quiet: true });
const proposals = run.bots.filter((bot) => bot.proposalId);
console.log(`   ✓ session ${run.sessionId} in ${((Date.now() - seedStarted) / 1000).toFixed(1)}s`);
console.log(`   ${run.bots.length} students, ${proposals.length} proposals on the square`);

// Every student rates every proposal but their own — the densest round the game
// can produce, and exactly the shape of "rate them all" from the front of a room.
const writes: Array<{ raterUid: string; statementId: string }> = [];
for (const bot of run.bots) {
	for (const target of proposals) {
		if (target.uid === bot.uid) continue;
		writes.push({ raterUid: bot.uid, statementId: target.proposalId as string });
	}
}

const expected = new Map<string, number>();
for (const write of writes) {
	expected.set(write.statementId, (expected.get(write.statementId) ?? 0) + 1);
}

step(`${writes.length} ratings, written concurrently`);
const started = Date.now();
await Promise.all(
	writes.map(({ raterUid, statementId }) => {
		const evaluationId = `${raterUid}--${statementId}`;
		// Varied so the camps genuinely disagree and the bridging maths has
		// something to chew on, rather than a unanimous field that would settle
		// trivially and prove nothing.
		const value =
			RATING_LEVELS[(raterUid.charCodeAt(2) + statementId.charCodeAt(2)) % RATING_LEVELS.length];

		return db.collection('evaluations').doc(evaluationId).set({
			evaluationId,
			parentId: run.sessionId,
			statementId,
			evaluatorId: raterUid,
			evaluation: value,
			agoraSessionId: run.sessionId,
			updatedAt: Date.now(),
		});
	}),
);
const writeMs = Date.now() - started;
console.log(`   ✓ accepted in ${(writeMs / 1000).toFixed(1)}s`);
console.log(`     ${(writes.length / (writeMs / 1000)).toFixed(0)} writes/sec`);

step('waiting for every score to account for every rating');
const deadline = Date.now() + SETTLE_TIMEOUT_MS;
let settled = 0;
let short: string[] = [];
for (;;) {
	const snapshot = await db
		.collection('agoraScores')
		.where('sessionId', '==', run.sessionId)
		.get();
	const byId = new Map(snapshot.docs.map((doc) => [doc.id, doc.data()]));

	settled = 0;
	short = [];
	for (const [statementId, raters] of expected) {
		const score = byId.get(statementId);
		const counted =
			(score?.perCamp?.left?.n ?? 0) +
			(score?.perCamp?.right?.n ?? 0) +
			(score?.perCamp?.center?.n ?? 0);
		if (counted >= raters) settled++;
		else short.push(`${statementId.slice(0, 8)} ${counted}/${raters}`);
	}

	if (settled === expected.size) break;
	if (Date.now() > deadline) {
		console.log(`   still short: ${short.slice(0, 5).join(', ')}`);
		fail(`only ${settled}/${expected.size} proposals settled in ${SETTLE_TIMEOUT_MS / 1000}s`);
	}
	await new Promise((resolve) => setTimeout(resolve, 1000));
}
const settleMs = Date.now() - started;
console.log(`   ✓ all ${expected.size} settled ${(settleMs / 1000).toFixed(1)}s after the first write`);

step('what the class would actually be looking at');
const finalScores = await db
	.collection('agoraScores')
	.where('sessionId', '==', run.sessionId)
	.get();
const bridging = finalScores.docs.map((doc) => (doc.data().bridgingScore as number) ?? 0);
const withConsensus = finalScores.docs.filter((doc) => doc.data().classConsensus).length;
console.log(`   bridging range ${Math.min(...bridging)}…${Math.max(...bridging)}`);
console.log(`   ${withConsensus}/${finalScores.size} proposals carry a stored class consensus`);
if (withConsensus === 0) fail('no proposal ended up with a class consensus');

console.log(
	`\n✅ LOAD SMOKE PASSED\n` +
		`   · ${run.bots.length} students × ${proposals.length} proposals = ${writes.length} ratings\n` +
		`   · writes accepted in ${(writeMs / 1000).toFixed(1)}s (${(writes.length / (writeMs / 1000)).toFixed(0)}/sec)\n` +
		`   · every score settled ${(settleMs / 1000).toFixed(1)}s after the first write\n` +
		`   · no proposal was left mis-counted, so the fan-out kept up`,
);
process.exit(0);
