import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
	collection,
	doc,
	getDoc,
	getDocs,
	query,
	setDoc,
	updateDoc,
	deleteDoc,
	deleteField,
	where,
} from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * join-class classroom engine (lane C1):
 *  - classTables/{mainId}--{n}: read by a student seated at that table or an
 *    admin of the workspace; no client writes at all (callables only).
 *  - statementsSubscribe: a student writes side / camp / decisionSupport on
 *    their own doc within range; tableId is server-only; ensureMemberSubscription's
 *    role:member create still works and cannot carry tableId or an admin role.
 *  - votes on a question with statementSettings.ballot: only while not paused or closed,
 *    only for a candidate or 'none'. Questions without a ballot are unchanged.
 */
describe('join-class engine rules', () => {
	let env;

	const TEACHER = 'u-teacher';
	const S1 = 'u-s1';
	const S2 = 'u-s2';
	const OTHER = 'u-other';
	const MAIN = 'main-class';
	const T1 = `${MAIN}--1`;
	const T2 = `${MAIN}--2`;
	const CH = 'challenge-1';
	const PLAIN_Q = 'plain-q';
	const T0 = 1_800_000_000_000;

	const tableDoc = (n, memberUids) => ({
		tableId: `${MAIN}--${n}`,
		mainId: MAIN,
		n,
		memberUids,
		noDeviceMembers: [],
		step: 'pick',
		askerUid: memberUids[0] ?? null,
		turn: 1,
		writingMode: 'each',
		writingLocked: false,
		spokenUids: [],
		usedQuestionIds: [],
		updatedAt: T0,
	});

	const sub = (uid, role, extra = {}) => ({
		statementsSubscribeId: `${uid}--${MAIN}`,
		userId: uid,
		statementId: MAIN,
		role,
		lastUpdate: T0,
		createdAt: T0,
		...extra,
	});

	const vote = (uid, parentId, statementId) => ({
		voteId: `${uid}--${parentId}`,
		statementId,
		parentId,
		userId: uid,
		lastUpdate: T0,
		createdAt: T0,
	});

	const as = (uid) => env.authenticatedContext(uid).firestore();

	before(async () => {
		env = await makeEnv('join-class-engine');
		await seed(env, async (db) => {
			await setDoc(doc(db, 'statements', MAIN), {
				statementId: MAIN,
				parentId: 'top',
				topParentId: MAIN,
				statementType: 'question',
				creatorId: TEACHER,
				creator: { uid: TEACHER, displayName: 'T' },
				membership: { access: 'openToAll' },
			});
			await setDoc(doc(db, 'statementsSubscribe', `${TEACHER}--${MAIN}`), sub(TEACHER, 'admin'));
			await setDoc(doc(db, 'statementsSubscribe', `${S1}--${MAIN}`), sub(S1, 'member', { tableId: T1, side: 20, camp: 'a' }));
			await setDoc(doc(db, 'classTables', T1), tableDoc(1, [S1]));
			await setDoc(doc(db, 'classTables', T2), tableDoc(2, [S2]));
			await setDoc(doc(db, 'statements', CH), {
				statementId: CH,
				parentId: MAIN,
				topParentId: MAIN,
				statementType: 'question',
				statementSettings: { classRole: 'challenge', ballot: { candidateIds: ['p1', 'p2'], frozenAt: T0 } },
			});
			await setDoc(doc(db, 'statements', 'closed-ch'), {
				statementId: 'closed-ch',
				parentId: MAIN,
				topParentId: MAIN,
				statementType: 'question',
				statementSettings: { classRole: 'challenge', ballot: { candidateIds: ['p1'], frozenAt: T0, closedAt: T0 + 1, decisionId: 'p1' } },
			});
			await setDoc(doc(db, 'statements', 'paused-ch'), {
				statementId: 'paused-ch',
				parentId: MAIN,
				topParentId: MAIN,
				statementType: 'question',
				statementSettings: { classRole: 'challenge', ballot: { candidateIds: ['p1'], frozenAt: T0, pausedAt: T0 + 1 } },
			});
			await setDoc(doc(db, 'statements', PLAIN_Q), {
				statementId: PLAIN_Q,
				parentId: 'top',
				topParentId: PLAIN_Q,
				statementType: 'question',
			});
			for (const id of ['p1', 'p2', 'p3']) {
				await setDoc(doc(db, 'statements', id), { statementId: id, parentId: CH, statementType: 'option' });
			}
			await setDoc(doc(db, 'statements', 'x1'), { statementId: 'x1', parentId: PLAIN_Q, statementType: 'option' });
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	describe('classTables', () => {
		it('lets a seated student read their own table', async () => {
			await assertSucceeds(getDoc(doc(as(S1), 'classTables', T1)));
		});

		it('denies a student reading another table', async () => {
			await assertFails(getDoc(doc(as(S1), 'classTables', T2)));
		});

		it('denies an unrelated signed-in user and an anonymous visitor', async () => {
			await assertFails(getDoc(doc(as(OTHER), 'classTables', T1)));
			await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'classTables', T1)));
		});

		it('lets the workspace admin get any table and list them by mainId', async () => {
			await assertSucceeds(getDoc(doc(as(TEACHER), 'classTables', T2)));
			await assertSucceeds(getDocs(query(collection(as(TEACHER), 'classTables'), where('mainId', '==', MAIN))));
		});

		it('denies a student listing every table of the lesson', async () => {
			await assertFails(getDocs(query(collection(as(S1), 'classTables'), where('mainId', '==', MAIN))));
		});

		it('answers a get of a missing table without a permission error', async () => {
			await assertSucceeds(getDoc(doc(as(S1), 'classTables', `${MAIN}--99`)));
		});

		it('denies every client write, the teacher included', async () => {
			await assertFails(setDoc(doc(as(TEACHER), 'classTables', `${MAIN}--3`), tableDoc(3, [])));
			await assertFails(updateDoc(doc(as(S1), 'classTables', T1), { step: 'rate' }));
			await assertFails(updateDoc(doc(as(TEACHER), 'classTables', T1), { step: 'rate' }));
			await assertFails(deleteDoc(doc(as(TEACHER), 'classTables', T1)));
		});
	});

	describe('statementsSubscribe class fields', () => {
		it('lets a student write side, camp and decisionSupport on their own doc', async () => {
			const ref = doc(as(S1), 'statementsSubscribe', `${S1}--${MAIN}`);
			await assertSucceeds(updateDoc(ref, { side: 75, camp: 'b', lastUpdate: T0 + 1 }));
			await assertSucceeds(updateDoc(ref, { decisionSupport: -0.5, lastUpdate: T0 + 2 }));
		});

		it('denies out-of-range or ill-typed class values', async () => {
			const ref = doc(as(S1), 'statementsSubscribe', `${S1}--${MAIN}`);
			await assertFails(updateDoc(ref, { side: 101 }));
			await assertFails(updateDoc(ref, { side: '50' }));
			await assertFails(updateDoc(ref, { camp: 'left' }));
			await assertFails(updateDoc(ref, { decisionSupport: 2 }));
		});

		it('denies a student setting, changing or clearing tableId', async () => {
			const ref = doc(as(S1), 'statementsSubscribe', `${S1}--${MAIN}`);
			await assertFails(updateDoc(ref, { tableId: T2 }));
			await assertFails(setDoc(ref, sub(S1, 'member', { side: 20, camp: 'a' })));
		});

		it('denies a student promoting themselves', async () => {
			const ref = doc(as(S1), 'statementsSubscribe', `${S1}--${MAIN}`);
			await assertFails(updateDoc(ref, { role: 'admin' }));
		});

		it('denies writing class fields on someone else\'s doc', async () => {
			await assertFails(updateDoc(doc(as(S2), 'statementsSubscribe', `${S1}--${MAIN}`), { side: 10, camp: 'a' }));
		});

		it('still lets ensureMemberSubscription create a role:member doc, and nothing more', async () => {
			const ref = doc(as(S2), 'statementsSubscribe', `${S2}--${MAIN}`);
			await assertFails(setDoc(ref, sub(S2, 'member', { tableId: T2 })));
			await assertFails(setDoc(ref, sub(S2, 'admin')));
			await assertFails(setDoc(ref, sub(S2, 'member', { side: -3 })));
			await assertSucceeds(setDoc(ref, sub(S2, 'member')));
		});

		it('leaves non-class subscription updates alone', async () => {
			const ref = doc(as(S1), 'statementsSubscribe', `${S1}--${MAIN}`);
			await assertSucceeds(updateDoc(ref, { getInAppNotification: true, lastUpdate: T0 + 3 }));
		});
	});

	describe('votes on a class ballot', () => {
		it('accepts a vote for a candidate and a withdrawal', async () => {
			await assertSucceeds(setDoc(doc(as(S1), 'votes', `${S1}--${CH}`), vote(S1, CH, 'p1')));
			await assertSucceeds(setDoc(doc(as(S1), 'votes', `${S1}--${CH}`), vote(S1, CH, 'none')));
		});

		it('denies a vote for an option that is not on the ballot', async () => {
			await assertFails(setDoc(doc(as(S2), 'votes', `${S2}--${CH}`), vote(S2, CH, 'p3')));
		});

		it('denies any vote once the ballot is closed', async () => {
			await assertFails(setDoc(doc(as(S1), 'votes', `${S1}--closed-ch`), vote(S1, 'closed-ch', 'p1')));
			await assertFails(setDoc(doc(as(S1), 'votes', `${S1}--closed-ch`), vote(S1, 'closed-ch', 'none')));
		});

		it('denies casting, changing or withdrawing a vote while the ballot is paused', async () => {
			await assertFails(setDoc(doc(as(S1), 'votes', `${S1}--paused-ch`), vote(S1, 'paused-ch', 'p1')));
			await assertFails(setDoc(doc(as(S1), 'votes', `${S1}--paused-ch`), vote(S1, 'paused-ch', 'none')));
		});

		it('takes votes again once the ballot is resumed', async () => {
			await seed(env, async (db) => {
				await updateDoc(doc(db, 'statements', 'paused-ch'), {
					'statementSettings.ballot.pausedAt': deleteField(),
				});
			});
			await assertSucceeds(setDoc(doc(as(S2), 'votes', `${S2}--paused-ch`), vote(S2, 'paused-ch', 'p1')));
		});

		it('leaves votes on questions without a ballot unchanged', async () => {
			await assertSucceeds(setDoc(doc(as(S2), 'votes', `${S2}--${PLAIN_Q}`), vote(S2, PLAIN_Q, 'x1')));
		});

		it('still denies voting as someone else', async () => {
			await assertFails(setDoc(doc(as(S2), 'votes', `${S1}--${CH}`), vote(S1, CH, 'p2')));
		});
	});
	describe('lesson status (paused / ended)', () => {
		const setStatus = (status) =>
			seed(env, async (db) => {
				const patch = { status: status === undefined ? deleteField() : status };
				await setDoc(
					doc(db, 'statements', MAIN),
					{ statementSettings: { lessonPlan: { steps: ['waiting'], stepIndex: 0, ...patch } } },
					{ merge: true },
				);
			});

		after(async () => {
			await setStatus('live');
		});

		it('refuses class-field writes and votes while paused or ended', async () => {
			for (const status of ['paused', 'ended']) {
				await setStatus(status);
				const ref = doc(as(S1), 'statementsSubscribe', `${S1}--${MAIN}`);
				await assertFails(updateDoc(ref, { side: 80, camp: 'b', lastUpdate: T0 + 10 }));
				await assertFails(updateDoc(ref, { decisionSupport: 0.5, lastUpdate: T0 + 11 }));
				await assertFails(setDoc(doc(as(S1), 'votes', `${S1}--${CH}`), vote(S1, CH, 'p1')));
				await assertFails(setDoc(doc(as(S1), 'votes', `${S1}--${CH}`), vote(S1, CH, 'none')));
			}
		});

		it('refuses a late joiner writing a side while paused, but lets them join', async () => {
			await setStatus('paused');
			const ref = doc(as(S2), 'statementsSubscribe', `${S2}--${MAIN}`);
			await assertFails(setDoc(ref, sub(S2, 'member', { side: 50 })));
			await assertSucceeds(setDoc(ref, sub(S2, 'member')));
		});

		it('still lets non-class subscription updates through while paused', async () => {
			await setStatus('paused');
			const ref = doc(as(S1), 'statementsSubscribe', `${S1}--${MAIN}`);
			await assertSucceeds(updateDoc(ref, { getInAppNotification: true, lastUpdate: T0 + 12 }));
		});

		it('lets the teacher keep writing while paused or ended', async () => {
			await setStatus('ended');
			const ref = doc(as(TEACHER), 'statementsSubscribe', `${S1}--${MAIN}`);
			await assertSucceeds(updateDoc(ref, { side: 30, lastUpdate: T0 + 13 }));
		});

		it('treats live, open and a missing status as writable', async () => {
			for (const status of ['live', 'open', undefined]) {
				await setStatus(status);
				const ref = doc(as(S1), 'statementsSubscribe', `${S1}--${MAIN}`);
				await assertSucceeds(updateDoc(ref, { side: 55, lastUpdate: T0 + 14 }));
				await assertSucceeds(setDoc(doc(as(S1), 'votes', `${S1}--${CH}`), vote(S1, CH, 'p2')));
			}
		});

		it('never charges the main app: a vote on a question without a ballot ignores the status', async () => {
			await setStatus('ended');
			await assertSucceeds(setDoc(doc(as(S2), 'votes', `${S2}--${PLAIN_Q}`), vote(S2, PLAIN_Q, 'x1')));
		});
	});

	describe("a table's own question (+ our own question)", () => {
		const ownQuestion = (uid, id, tableId) => ({
			statementId: id,
			parentId: MAIN,
			topParentId: MAIN,
			parents: [MAIN],
			statementType: 'question',
			creatorId: uid,
			creator: { uid, displayName: 'S' },
			statement: 'Our own question?',
			statementSettings: { classRole: 'guiding' },
			classTable: { tableId, shared: false, coAuthors: [] },
			createdAt: T0,
			lastUpdate: T0,
		});

		it('lets a seated student create a question under the lesson as themselves', async () => {
			await assertSucceeds(setDoc(doc(as(S1), 'statements', 'own-q1'), ownQuestion(S1, 'own-q1', T1)));
		});

		it('denies creating it in the name of a classmate', async () => {
			await assertFails(setDoc(doc(as(S2), 'statements', 'own-q2'), ownQuestion(S1, 'own-q2', T1)));
		});

		it('denies an anonymous visitor', async () => {
			await assertFails(
				setDoc(doc(env.unauthenticatedContext().firestore(), 'statements', 'own-q3'), ownQuestion(S1, 'own-q3', T1)),
			);
		});

		it('denies stamping an admin-only field (creatorRole) on it', async () => {
			await assertFails(
				setDoc(doc(as(S1), 'statements', 'own-q4'), { ...ownQuestion(S1, 'own-q4', T1), creatorRole: 'admin' }),
			);
		});

		it('denies a classmate rewriting its text afterwards', async () => {
			await assertSucceeds(setDoc(doc(as(S1), 'statements', 'own-q5'), ownQuestion(S1, 'own-q5', T1)));
			await assertFails(updateDoc(doc(as(S2), 'statements', 'own-q5'), { statement: 'hijacked' }));
		});
	});
});
