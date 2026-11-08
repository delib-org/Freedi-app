/**
 * join-class engine smoke test (lane C1) — emulator only.
 *
 * Drives the real callables on the Functions emulator as the seeded teacher
 * and students, and prints the resulting documents. Prerequisites:
 *   1. emulators up (auth + firestore + functions) with functions built;
 *   2. the seed run with tokens:
 *        npx tsx apps/join-class/scripts/seed-classroom.ts --step=4 --proposals --tokens
 *
 * Usage (repo root):
 *   GCLOUD_PROJECT=<project> FIRESTORE_EMULATOR_HOST=localhost:<fs> \
 *   FIREBASE_AUTH_EMULATOR_HOST=localhost:<auth> FUNCTIONS_EMULATOR_HOST=localhost:<fn> \
 *     npx tsx apps/join-class/scripts/smoke-classroom-engine.ts
 *
 * Exits 1 on the first failed expectation.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

interface SeedOutput {
	projectId: string;
	mainId: string;
	teacher: { uid: string; customToken: string };
	students: { uid: string; name: string; camp: string; customToken?: string }[];
	guidingIds: string[];
	challengeId: string;
	proposalIds: string[];
}

interface TableDoc {
	tableId: string;
	n: number;
	memberUids: string[];
	askerUid: string | null;
	step: string;
	turn: number;
	questionId?: string;
	speakerUid?: string;
	speakerEndsAt?: number;
	spokenUids: string[];
	writingLocked: boolean;
	writingMode: string;
}

const POLL_MS = 250;
const POLL_TRIES = 360; // 90 s: emulator triggers run one at a time and can queue
const REGION = 'me-west1';

const seed = JSON.parse(
	readFileSync(join(dirname(fileURLToPath(import.meta.url)), '.seed-output.json'), 'utf8'),
) as SeedOutput;
const PROJECT = process.env.GCLOUD_PROJECT ?? seed.projectId;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST ?? 'localhost:9099';
const FN_HOST = process.env.FUNCTIONS_EMULATOR_HOST ?? 'localhost:5001';

const app = getApps()[0] ?? initializeApp({ projectId: PROJECT });
const db = getFirestore(app);

function check(condition: unknown, what: string): void {
	if (!condition) {
		console.error(`✗ ${what}`);
		process.exit(1);
	}
	console.info(`✓ ${what}`);
}

async function idTokenFor(customToken: string): Promise<string> {
	const res = await fetch(
		`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=fake-api-key`,
		{
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ token: customToken, returnSecureToken: true }),
		},
	);
	const body = (await res.json()) as { idToken?: string };
	if (!body.idToken) throw new Error(`signInWithCustomToken failed: ${JSON.stringify(body)}`);

	return body.idToken;
}

type CallResult<T> = { ok: true; data: T } | { ok: false; status: string; message: string };

async function call<T>(name: string, idToken: string, data: object): Promise<CallResult<T>> {
	const res = await fetch(`http://${FN_HOST}/${PROJECT}/${REGION}/${name}`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
		body: JSON.stringify({ data }),
	});
	const body = (await res.json()) as { result?: T; error?: { status: string; message: string } };
	if (body.error) return { ok: false, status: body.error.status, message: body.error.message };

	return { ok: true, data: body.result as T };
}

async function mustCall<T>(name: string, idToken: string, data: object): Promise<T> {
	const res = await call<T>(name, idToken, data);
	if (!res.ok) throw new Error(`${name} failed: ${res.status} ${res.message}`);
	console.info(`  ${name}(${JSON.stringify(data)}) -> ${JSON.stringify(res.data)}`);

	return res.data;
}

async function readTable(tableId: string): Promise<TableDoc> {
	return (await db.doc(`classTables/${tableId}`).get()).data() as TableDoc;
}

async function waitFor(what: string, test: () => Promise<boolean>): Promise<void> {
	for (let i = 0; i < POLL_TRIES; i++) {
		if (await test()) return;
		await new Promise((r) => setTimeout(r, POLL_MS));
	}
	throw new Error(`timed out waiting for ${what}`);
}

function brief(t: TableDoc): string {
	return `#${t.n} step=${t.step} turn=${t.turn} asker=${t.askerUid?.slice(-2)} members=[${t.memberUids
		.map((u) => u.slice(-2))
		.join(',')}] q=${t.questionId ?? '-'} speaker=${t.speakerUid?.slice(-2) ?? '-'} spoken=[${t.spokenUids
		.map((u) => u.slice(-2))
		.join(',')}] mode=${t.writingMode} locked=${t.writingLocked}`;
}

async function main(): Promise<void> {
	console.info(`[smoke] project=${PROJECT} fn=${FN_HOST} main=${seed.mainId}`);
	const tokens = new Map(seed.students.map((s) => [s.uid, s.customToken]));
	if (![...tokens.values()].every(Boolean)) throw new Error('seed without --tokens');
	const teacher = await idTokenFor(seed.teacher.customToken);
	const tokenOf = async (uid: string): Promise<string> => idTokenFor(tokens.get(uid) as string);

	// ---- seating -----------------------------------------------------------
	console.info('\n== classAssignTables');
	const firstStudent = await tokenOf(seed.students[0].uid);
	const denied = await call('classAssignTables', firstStudent, { mainId: seed.mainId });
	check(!denied.ok && denied.status === 'PERMISSION_DENIED', 'a student cannot seat the class');
	const seated = await mustCall<{ tables: number; placed: number }>('classAssignTables', teacher, { mainId: seed.mainId });
	check(seated.placed === seed.students.length, `all ${seed.students.length} students placed`);
	const again = await call('classAssignTables', teacher, { mainId: seed.mainId });
	check(!again.ok && again.status === 'ALREADY_EXISTS', 're-run without replace is refused');

	const tables = (await db.collection('classTables').where('mainId', '==', seed.mainId).get()).docs
		.map((d) => d.data() as TableDoc)
		.sort((x, y) => x.n - y.n);
	const campOf = new Map(seed.students.map((s) => [s.uid, s.camp]));
	for (const t of tables) {
		console.info(`  ${brief(t)} camps=${t.memberUids.map((u) => campOf.get(u)).join(',')}`);
	}
	check(tables.every((t) => t.memberUids.length >= 3 && t.memberUids.length <= 5), 'every table has 3-5');
	const sub = (await db.doc(`statementsSubscribe/${tables[0].memberUids[0]}--${seed.mainId}`).get()).data();
	check(sub?.tableId === tables[0].tableId, 'subscription.tableId matches the table');

	// ---- one turn at table 1 ------------------------------------------------
	console.info('\n== classTableStep at table 1');
	const t1 = tables[0];
	check(t1.askerUid === null, 'a seated table has no asker: the first volunteer asks');
	const asker = t1.memberUids[0];
	const mate = t1.memberUids[1];
	const askerToken = await tokenOf(asker);
	const mateToken = await tokenOf(mate);
	const tid = t1.tableId;
	await mustCall('classTableStep', askerToken, {
		tableId: tid,
		action: 'claimTurn',
		fromTurn: 1,
		questionId: seed.guidingIds[1],
	});
	const claimed = await readTable(tid);
	check(
		claimed.askerUid === asker && claimed.step === 'talk' && claimed.questionId === seed.guidingIds[1],
		'the volunteer became the asker, the question is locked and the table talks',
	);

	const notAsker = await call('classTableStep', mateToken, { tableId: tid, action: 'toTalk' });
	check(!notAsker.ok && notAsker.status === 'PERMISSION_DENIED', 'a tablemate cannot drive the table');
	await mustCall('classTableStep', mateToken, { tableId: tid, action: 'claimSpeaker' });
	const talking = await readTable(tid);
	console.info(`  ${brief(talking)} endsIn=${Math.round(((talking.speakerEndsAt ?? 0) - Date.now()) / 1000)}s`);
	check(talking.speakerUid === mate && (talking.speakerEndsAt ?? 0) > Date.now(), 'speaker + speakerEndsAt written');
	await mustCall('classTableStep', askerToken, { tableId: tid, action: 'toWrite' });
	await mustCall('classTableStep', askerToken, { tableId: tid, action: 'setWritingMode', mode: 'table' });

	// A shared answer, as C3's client writes it (admin SDK stands in for the device).
	console.info('\n== auto +1 trigger (onStatementCreated)');
	const answerId = `smoke-answer-${Date.now()}`;
	await db.doc(`statements/${answerId}`).set({
		statementId: answerId,
		statement: 'Smoke: one answer for the whole table',
		statementType: 'option',
		parentId: seed.guidingIds[1],
		topParentId: seed.mainId,
		parents: [seed.mainId, seed.guidingIds[1]],
		creatorId: asker,
		creator: { uid: asker, displayName: 'Asker', isAnonymous: true },
		createdAt: Date.now(),
		lastUpdate: Date.now(),
		consensus: 0,
		classTable: { tableId: tid, shared: true, coAuthors: [...t1.memberUids, 'forged-outsider'] },
	});
	// The seed's answers live under guidingIds[0]; this table is on guidingIds[1],
	// so only this answer can lock it. The lock is written after the evaluations.
	await waitFor('writingLocked', async () => (await readTable(tid)).writingLocked);
	const evals = await db.collection('evaluations').where('statementId', '==', answerId).get();
	console.info(`  evaluations: ${evals.docs.map((d) => `${d.id.split('--')[0].slice(-2)}=${d.data().evaluation}`).join(' ')}`);
	check(evals.size === t1.memberUids.length, `a +1 for each of the ${t1.memberUids.length} co-authors, none for the forged uid`);
	const lockedMode = await call('classTableStep', askerToken, { tableId: tid, action: 'setWritingMode', mode: 'each' });
	check(!lockedMode.ok && lockedMode.status === 'FAILED_PRECONDITION', 'writing mode locked after the first send');
	await waitFor('consensus update', async () => {
		const s = (await db.doc(`statements/${answerId}`).get()).data();

		return (s?.evaluation?.numberOfEvaluators ?? 0) >= t1.memberUids.length;
	});
	const answer = (await db.doc(`statements/${answerId}`).get()).data();
	console.info(`  answer consensus=${answer?.consensus} evaluators=${answer?.evaluation?.numberOfEvaluators}`);
	check(answer?.evaluation?.numberOfEvaluators === t1.memberUids.length, 'the consensus pipeline counted the auto +1s once each');

	await mustCall('classTableStep', askerToken, { tableId: tid, action: 'toRate' });
	// a table left at rate (before table turn v2) still lets a tablemate who has not asked claim the next turn
	const next = await mustCall<{ step: string; turn: number }>('classTableStep', mateToken, {
		tableId: tid,
		action: 'claimTurn',
		fromTurn: 1,
		questionId: seed.guidingIds[0],
	});
	const after = await readTable(tid);
	console.info(`  ${brief(after)}`);
	check(next.turn === 2 && after.askerUid === mate && !after.writingLocked, 'a claim from rate starts the next turn and resets');

	// ---- teacher moves ----------------------------------------------------
	console.info('\n== classMoveStudent / classAddNoDevice / classAllTablesTo');
	await mustCall('classMoveStudent', teacher, { mainId: seed.mainId, uid: mate, toTable: 2 });
	const moved = (await db.doc(`statementsSubscribe/${mate}--${seed.mainId}`).get()).data();
	check(moved?.tableId === tables[1].tableId && (await readTable(tables[1].tableId)).memberUids.includes(mate), 'move keeps table + subscription in sync');
	await mustCall('classAddNoDevice', teacher, { mainId: seed.mainId, n: 1, name: 'Yoni (no phone)' });
	await mustCall('classAllTablesTo', teacher, { mainId: seed.mainId, step: 'rate' });

	// ---- ballot -----------------------------------------------------------
	console.info('\n== classFreezeBallot / votes / classCloseBallot');
	const frozen = await mustCall<{ candidateIds: string[] }>('classFreezeBallot', teacher, { mainId: seed.mainId });
	check(frozen.candidateIds.length >= 2, 'ballot frozen with at least two candidates');
	const pick = frozen.candidateIds[frozen.candidateIds.length - 1];
	for (const s of seed.students.slice(0, 3)) {
		await db.doc(`votes/${s.uid}--${seed.challengeId}`).set({
			voteId: `${s.uid}--${seed.challengeId}`,
			statementId: pick,
			parentId: seed.challengeId,
			userId: s.uid,
			lastUpdate: Date.now(),
			createdAt: Date.now(),
		});
	}
	await waitFor('fn_vote tally', async () => {
		const ch = (await db.doc(`statements/${seed.challengeId}`).get()).data();

		return (ch?.selections?.[pick] ?? 0) >= 3;
	});
	const closed = await mustCall<{ decisionId: string | null }>('classCloseBallot', teacher, { mainId: seed.mainId });
	check(closed.decisionId === pick, 'the decision is the top-voted candidate');
	const ballot = (await db.doc(`statements/${seed.challengeId}`).get()).data()?.statementSettings?.ballot;
	console.info(`  ballot=${JSON.stringify(ballot)}`);

	console.info('\n[smoke] all checks passed');
	process.exit(0);
}

main().catch((error: unknown) => {
	console.error('[smoke] failed:', error);
	process.exit(1);
});
