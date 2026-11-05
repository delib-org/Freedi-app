import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	query,
	setDoc,
	updateDoc,
	where,
} from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * Tables (table assignment): tableAssignments, tableAssignmentTopics,
 * tableAssignmentParticipants, tableAssignmentRuns, tableAssignmentSeats.
 * No client writes anywhere (callables only). Reads:
 *  - session: host always; any signed-in user (anonymous too) once registration opened
 *  - topics: whoever may read the parent session
 *  - participants: the owner (uid field) or the host; never another participant
 *  - runs: host all; a registered participant only when published
 */
describe('Tables rules', () => {
	let env;

	const HOST = 'u-host';
	const P1 = 'u-p1';
	const P2 = 'u-p2';
	const STRANGER = 'u-stranger';
	const OPEN = 'sess-open';
	const DRAFT = 'sess-draft';
	const T0 = 1_800_000_000_000;

	const session = (id, status) => ({
		tableAssignmentId: id,
		hostUid: HOST,
		title: 'Town hall',
		mode: 'ranked',
		status,
		settings: { tableSize: 7, balanceTolerance: 0.3 },
		createdAt: T0,
		lastUpdate: T0,
	});

	const topic = (id, sessionId) => ({ topicId: id, sessionId, title: id, order: 0 });

	const participant = (sessionId, uid) => ({
		sessionId,
		uid,
		fullName: `Name ${uid}`,
		preferences: ['topic-open'],
		position: 42,
		registeredAt: T0,
	});

	const run = (id, sessionId, status) => ({
		runId: id,
		sessionId,
		seed: 1,
		status,
		tables: [{ index: 0, topicId: 'topic-open', memberUids: [P1, P2], stats: { n: 2, mean: [40], sd: [2], deviation: 0 } }],
		metrics: {},
		inputHash: 'h',
		createdAt: T0,
	});

	const as = (uid) => env.authenticatedContext(uid).firestore();
	const asAnonymous = (uid) =>
		env.authenticatedContext(uid, { firebase: { sign_in_provider: 'anonymous' } }).firestore();
	const guest = () => env.unauthenticatedContext().firestore();

	before(async () => {
		env = await makeEnv('table-assignment');
		await seed(env, async (db) => {
			await setDoc(doc(db, 'tableAssignments', OPEN), session(OPEN, 'registrationOpen'));
			await setDoc(doc(db, 'tableAssignments', DRAFT), session(DRAFT, 'draft'));
			await setDoc(doc(db, 'tableAssignmentTopics', 'topic-open'), topic('topic-open', OPEN));
			await setDoc(doc(db, 'tableAssignmentTopics', 'topic-draft'), topic('topic-draft', DRAFT));
			await setDoc(doc(db, 'tableAssignmentParticipants', `${OPEN}_${P1}`), participant(OPEN, P1));
			await setDoc(doc(db, 'tableAssignmentParticipants', `${OPEN}_${P2}`), participant(OPEN, P2));
			await setDoc(doc(db, 'tableAssignmentRuns', 'run-ready'), run('run-ready', OPEN, 'ready'));
			await setDoc(doc(db, 'tableAssignmentRuns', 'run-pub'), run('run-pub', OPEN, 'published'));
			await setDoc(doc(db, 'tableAssignmentSeats', `${OPEN}_0`), { sessionId: OPEN, tableIndex: 0, count: 1 });
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	describe('tableAssignments', () => {
		it('lets the host read their draft', async () => {
			await assertSucceeds(getDoc(doc(as(HOST), 'tableAssignments', DRAFT)));
		});

		it('hides a draft from everyone else', async () => {
			await assertFails(getDoc(doc(as(P1), 'tableAssignments', DRAFT)));
			await assertFails(getDoc(doc(guest(), 'tableAssignments', DRAFT)));
		});

		it('lets any signed-in user, anonymous included, read an open session', async () => {
			await assertSucceeds(getDoc(doc(asAnonymous('anon-1'), 'tableAssignments', OPEN)));
			await assertSucceeds(getDoc(doc(as(STRANGER), 'tableAssignments', OPEN)));
		});

		it('denies a signed-out reader even on an open session', async () => {
			await assertFails(getDoc(doc(guest(), 'tableAssignments', OPEN)));
		});

		it('reads published, closed and ended sessions too', async () => {
			for (const status of ['registrationClosed', 'published', 'ended']) {
				await seed(env, (db) => setDoc(doc(db, 'tableAssignments', `sess-${status}`), session(`sess-${status}`, status)));
				await assertSucceeds(getDoc(doc(as(P1), 'tableAssignments', `sess-${status}`)));
			}
		});

		it('lets a host list their own sessions but nobody list others', async () => {
			await assertSucceeds(getDocs(query(collection(as(HOST), 'tableAssignments'), where('hostUid', '==', HOST))));
			await assertFails(getDocs(query(collection(as(P1), 'tableAssignments'), where('hostUid', '==', HOST))));
		});

		it('denies every client write, host included', async () => {
			await assertFails(setDoc(doc(as(HOST), 'tableAssignments', 'new'), session('new', 'draft')));
			await assertFails(updateDoc(doc(as(HOST), 'tableAssignments', OPEN), { status: 'ended' }));
			await assertFails(updateDoc(doc(as(P1), 'tableAssignments', OPEN), { title: 'hacked' }));
			await assertFails(deleteDoc(doc(as(HOST), 'tableAssignments', OPEN)));
		});
	});

	describe('tableAssignmentTopics', () => {
		it('follows the parent session: open to signed-in users, drafts to the host only', async () => {
			await assertSucceeds(getDoc(doc(asAnonymous('anon-1'), 'tableAssignmentTopics', 'topic-open')));
			await assertFails(getDoc(doc(as(P1), 'tableAssignmentTopics', 'topic-draft')));
			await assertSucceeds(getDoc(doc(as(HOST), 'tableAssignmentTopics', 'topic-draft')));
			await assertFails(getDoc(doc(guest(), 'tableAssignmentTopics', 'topic-open')));
		});

		it('lists a session\'s topics by sessionId', async () => {
			await assertSucceeds(
				getDocs(query(collection(as(P1), 'tableAssignmentTopics'), where('sessionId', '==', OPEN))),
			);
			await assertFails(
				getDocs(query(collection(as(P1), 'tableAssignmentTopics'), where('sessionId', '==', DRAFT))),
			);
		});

		it('denies client writes', async () => {
			await assertFails(setDoc(doc(as(HOST), 'tableAssignmentTopics', 'x'), topic('x', DRAFT)));
			await assertFails(updateDoc(doc(as(HOST), 'tableAssignmentTopics', 'topic-draft'), { title: 'y' }));
			await assertFails(deleteDoc(doc(as(HOST), 'tableAssignmentTopics', 'topic-draft')));
		});
	});

	describe('tableAssignmentParticipants', () => {
		it('lets a participant read their own doc and not another one (positions stay private)', async () => {
			await assertSucceeds(getDoc(doc(as(P1), 'tableAssignmentParticipants', `${OPEN}_${P1}`)));
			await assertFails(getDoc(doc(as(P1), 'tableAssignmentParticipants', `${OPEN}_${P2}`)));
			await assertFails(
				getDocs(query(collection(as(P1), 'tableAssignmentParticipants'), where('sessionId', '==', OPEN))),
			);
		});

		it('lets the participant list only their own docs', async () => {
			await assertSucceeds(
				getDocs(query(collection(as(P1), 'tableAssignmentParticipants'), where('uid', '==', P1))),
			);
		});

		it('lets the host read and list every registrant of their session', async () => {
			await assertSucceeds(getDoc(doc(as(HOST), 'tableAssignmentParticipants', `${OPEN}_${P2}`)));
			await assertSucceeds(
				getDocs(query(collection(as(HOST), 'tableAssignmentParticipants'), where('sessionId', '==', OPEN))),
			);
		});

		it('denies another host and strangers', async () => {
			await assertFails(getDoc(doc(as(STRANGER), 'tableAssignmentParticipants', `${OPEN}_${P1}`)));
		});

		it('answers "missing" for the caller\'s own not-yet-registered doc, not permission-denied', async () => {
			await assertSucceeds(getDoc(doc(as(STRANGER), 'tableAssignmentParticipants', `${OPEN}_${STRANGER}`)));
			await assertFails(getDoc(doc(as(STRANGER), 'tableAssignmentParticipants', `${OPEN}_someone-else`)));
		});

		it('denies client writes, own doc included', async () => {
			await assertFails(setDoc(doc(as(P1), 'tableAssignmentParticipants', `${OPEN}_${P1}`), participant(OPEN, P1)));
			await assertFails(updateDoc(doc(as(P1), 'tableAssignmentParticipants', `${OPEN}_${P1}`), { chosenTableIndex: 0 }));
			await assertFails(setDoc(doc(as(STRANGER), 'tableAssignmentParticipants', `${OPEN}_${STRANGER}`), participant(OPEN, STRANGER)));
			await assertFails(deleteDoc(doc(as(P1), 'tableAssignmentParticipants', `${OPEN}_${P1}`)));
		});
	});

	describe('tableAssignmentRuns', () => {
		it('lets the host read every run', async () => {
			await assertSucceeds(getDoc(doc(as(HOST), 'tableAssignmentRuns', 'run-ready')));
			await assertSucceeds(getDoc(doc(as(HOST), 'tableAssignmentRuns', 'run-pub')));
			await assertSucceeds(
				getDocs(query(collection(as(HOST), 'tableAssignmentRuns'), where('sessionId', '==', OPEN))),
			);
		});

		it('lets a registered participant read only the published run', async () => {
			await assertSucceeds(getDoc(doc(as(P1), 'tableAssignmentRuns', 'run-pub')));
			await assertFails(getDoc(doc(as(P1), 'tableAssignmentRuns', 'run-ready')));
			await assertSucceeds(
				getDocs(
					query(
						collection(as(P1), 'tableAssignmentRuns'),
						where('sessionId', '==', OPEN),
						where('status', '==', 'published'),
					),
				),
			);
			await assertFails(
				getDocs(query(collection(as(P1), 'tableAssignmentRuns'), where('sessionId', '==', OPEN))),
			);
		});

		it('denies unregistered and signed-out readers even for the published run', async () => {
			await assertFails(getDoc(doc(as(STRANGER), 'tableAssignmentRuns', 'run-pub')));
			await assertFails(getDoc(doc(guest(), 'tableAssignmentRuns', 'run-pub')));
		});

		it('denies client writes', async () => {
			await assertFails(updateDoc(doc(as(HOST), 'tableAssignmentRuns', 'run-ready'), { status: 'published' }));
			await assertFails(setDoc(doc(as(HOST), 'tableAssignmentRuns', 'new'), run('new', OPEN, 'ready')));
			await assertFails(deleteDoc(doc(as(HOST), 'tableAssignmentRuns', 'run-pub')));
		});
	});

	describe('tableAssignmentSeats', () => {
		const seat = `${OPEN}_0`;

		it('lets a registered participant and the host get and list the seat counters of their session', async () => {
			await assertSucceeds(getDoc(doc(as(P1), 'tableAssignmentSeats', seat)));
			await assertSucceeds(
				getDocs(query(collection(as(P1), 'tableAssignmentSeats'), where('sessionId', '==', OPEN))),
			);
			await assertSucceeds(getDoc(doc(as(HOST), 'tableAssignmentSeats', seat)));
			await assertSucceeds(
				getDocs(query(collection(as(HOST), 'tableAssignmentSeats'), where('sessionId', '==', OPEN))),
			);
		});

		it('denies an unregistered signed-in user, a signed-out reader and an unfiltered list', async () => {
			await assertFails(getDoc(doc(as(STRANGER), 'tableAssignmentSeats', seat)));
			await assertFails(
				getDocs(query(collection(as(STRANGER), 'tableAssignmentSeats'), where('sessionId', '==', OPEN))),
			);
			await assertFails(getDoc(doc(guest(), 'tableAssignmentSeats', seat)));
			await assertFails(getDocs(collection(as(P1), 'tableAssignmentSeats')));
		});

		it('denies all client writes', async () => {
			await assertFails(setDoc(doc(as(P1), 'tableAssignmentSeats', seat), { sessionId: OPEN, count: 0 }));
			await assertFails(updateDoc(doc(as(HOST), 'tableAssignmentSeats', seat), { count: 0 }));
			await assertFails(deleteDoc(doc(as(P1), 'tableAssignmentSeats', seat)));
		});
	});
});
