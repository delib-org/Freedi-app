import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, collectionGroup, deleteDoc, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * join-class: the student's side is private (Trello btMVQMM5).
 * The teacher may see THAT a student chose a side, never WHICH:
 *  - classSides/{uid}--{mainId}: only the owner reads or writes it, under the old
 *    validation and lesson gate; teacher, admin and classmates cannot read it.
 *  - statementsSubscribe: side / camp / decisionSupport are refused (unless the
 *    rollout flag classFlags/legacySideWrites is open, for tabs opened before the
 *    change); sidePickedAt is set only by the owner, only in a write that leaves a
 *    camp on their classSides doc, and never by the teacher.
 */
describe('join-class side privacy rules', () => {
	let env;

	const TEACHER = 'u-teacher';
	const S1 = 'u-s1';
	const S2 = 'u-s2';
	const MAIN = 'main-side';
	const T0 = 1_800_000_000_000;
	const SIDE1 = `${S1}--${MAIN}`;
	const SIDE2 = `${S2}--${MAIN}`;

	const sub = (uid, role, extra = {}) => ({
		statementsSubscribeId: `${uid}--${MAIN}`,
		userId: uid,
		statementId: MAIN,
		role,
		lastUpdate: T0,
		createdAt: T0,
		...extra,
	});
	const side = (uid, extra = {}) => ({ userId: uid, mainId: MAIN, lastUpdate: T0, ...extra });

	const as = (uid) => env.authenticatedContext(uid).firestore();

	const setFlag = (open) =>
		seed(env, async (db) => {
			const ref = doc(db, 'classFlags', 'legacySideWrites');
			if (open === undefined) await deleteDoc(ref);
			else await setDoc(ref, { open });
		});

	const setStatus = (status) =>
		seed(env, async (db) => {
			await setDoc(
				doc(db, 'statements', MAIN),
				{ statementSettings: { lessonPlan: { steps: ['side'], stepIndex: 0, status } } },
				{ merge: true },
			);
		});

	const STEPS = ['waiting', 'opening', 'side', 'tables', 'tableTalk', 'proposals', 'allProposals', 'vote', 'summary'];
	const setStep = (key) =>
		seed(env, async (db) => {
			await setDoc(
				doc(db, 'statements', MAIN),
				{ statementSettings: { lessonPlan: { steps: STEPS, stepIndex: STEPS.indexOf(key), status: 'live' } } },
				{ merge: true },
			);
		});
	const pick = (uid, value, camp, flag = true) => {
		const db = as(uid);
		const batch = writeBatch(db);
		batch.set(doc(db, 'classSides', `${uid}--${MAIN}`), side(uid, { side: value, camp, lastUpdate: T0 + 9 }), { merge: true });
		if (flag) batch.update(doc(db, 'statementsSubscribe', `${uid}--${MAIN}`), { sidePickedAt: T0 + 9 });
		return batch.commit();
	};

	before(async () => {
		env = await makeEnv('join-class-side-privacy');
	});

	beforeEach(async () => {
		await env.clearFirestore();
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
			await setDoc(doc(db, 'statementsSubscribe', SIDE1), sub(S1, 'member'));
			await setDoc(doc(db, 'statementsSubscribe', SIDE2), sub(S2, 'member'));
			await setDoc(doc(db, 'classSides', SIDE2), side(S2, { side: 90, camp: 'b', decisionSupport: 1 }));
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	describe('classSides: the owner', () => {
		it('picks a side: the private doc and the flag in one batch', async () => {
			const db = as(S1);
			const batch = writeBatch(db);
			batch.set(doc(db, 'classSides', SIDE1), side(S1, { side: 20, camp: 'a' }));
			batch.update(doc(db, 'statementsSubscribe', SIDE1), { sidePickedAt: T0 + 1 });
			await assertSucceeds(batch.commit());
			const mine = await assertSucceeds(getDoc(doc(db, 'classSides', SIDE1)));
			assert.equal(mine.data().camp, 'a');
		});

		it('changes the side and rates the decision on the private doc', async () => {
			const db = as(S2);
			await assertSucceeds(setDoc(doc(db, 'classSides', SIDE2), { side: 10, camp: 'a', lastUpdate: T0 + 2 }, { merge: true }));
			await assertSucceeds(updateDoc(doc(db, 'classSides', SIDE2), { decisionSupport: -0.5, lastUpdate: T0 + 3 }));
		});

		it('reads their own doc, even before it exists (the listener before the first pick)', async () => {
			await assertSucceeds(getDoc(doc(as(S2), 'classSides', SIDE2)));
			await assertSucceeds(getDoc(doc(as(S1), 'classSides', SIDE1)));
		});

		it('is held to the old validation', async () => {
			const ref = doc(as(S1), 'classSides', SIDE1);
			await assertFails(setDoc(ref, side(S1, { side: 101 })));
			await assertFails(setDoc(ref, side(S1, { side: '50' })));
			await assertFails(setDoc(ref, side(S1, { camp: 'left' })));
			await assertFails(setDoc(ref, side(S1, { decisionSupport: 2 })));
			await assertFails(setDoc(ref, side(S1, { side: 20, camp: 'a', tableId: 'x' })));
			await assertFails(setDoc(ref, { mainId: MAIN, side: 20, lastUpdate: T0 }));
		});

		it('cannot write a doc under someone else\'s id or for another lesson', async () => {
			await assertFails(setDoc(doc(as(S1), 'classSides', SIDE2), side(S1, { side: 20 })));
			await assertFails(setDoc(doc(as(S1), 'classSides', SIDE1), { ...side(S1, { side: 20 }), mainId: 'other' }));
			await assertFails(setDoc(doc(as(S1), 'classSides', SIDE1), { ...side(S2, { side: 20 }) }));
		});

		it('needs the subscription of the same id first', async () => {
			const stranger = 'u-stranger';
			await assertFails(setDoc(doc(as(stranger), 'classSides', `${stranger}--${MAIN}`), { userId: stranger, mainId: MAIN, side: 20, lastUpdate: T0 }));
		});

		it('cannot write while the lesson is paused or ended, and cannot delete', async () => {
			for (const status of ['paused', 'ended']) {
				await setStatus(status);
				await assertFails(setDoc(doc(as(S1), 'classSides', SIDE1), side(S1, { side: 20, camp: 'a' })));
				await assertFails(updateDoc(doc(as(S2), 'classSides', SIDE2), { decisionSupport: 0, lastUpdate: T0 + 4 }));
			}
			await setStatus('live');
			await assertFails(deleteDoc(doc(as(S2), 'classSides', SIDE2)));
		});
	});

	describe('classSides: everyone else', () => {
		it('the teacher (workspace admin) cannot read a student\'s side', async () => {
			await assertFails(getDoc(doc(as(TEACHER), 'classSides', SIDE2)));
			await assertFails(getDoc(doc(as(TEACHER), 'classSides', SIDE1)));
		});

		it('a classmate cannot read it, nor list the collection', async () => {
			await assertFails(getDoc(doc(as(S1), 'classSides', SIDE2)));
			await assertFails(getDocs(query(collection(as(S1), 'classSides'), where('mainId', '==', MAIN))));
			await assertFails(getDocs(query(collection(as(TEACHER), 'classSides'), where('mainId', '==', MAIN))));
			await assertFails(getDocs(query(collection(as(S2), 'classSides'), where('userId', '==', S2))));
		});

		it('nobody signed out reads it', async () => {
			await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'classSides', SIDE2)));
		});

		it('the teacher cannot write or change it', async () => {
			await assertFails(setDoc(doc(as(TEACHER), 'classSides', SIDE2), side(S2, { side: 10, camp: 'a' })));
			await assertFails(updateDoc(doc(as(TEACHER), 'classSides', SIDE2), { camp: 'a' }));
		});

		it('the rollout flag is not readable or writable by a client', async () => {
			await assertFails(getDoc(doc(as(TEACHER), 'classFlags', 'legacySideWrites')));
			await assertFails(setDoc(doc(as(S1), 'classFlags', 'legacySideWrites'), { open: true }));
		});
	});

	describe('statementsSubscribe: no side there any more', () => {
		it('refuses side / camp / decisionSupport from the owner, the teacher and on create', async () => {
			const own = doc(as(S1), 'statementsSubscribe', SIDE1);
			await assertFails(updateDoc(own, { side: 20, camp: 'a' }));
			await assertFails(updateDoc(own, { decisionSupport: 1 }));
			await assertFails(updateDoc(doc(as(TEACHER), 'statementsSubscribe', SIDE1), { camp: 'a' }));
			await assertFails(updateDoc(doc(as(TEACHER), 'statementsSubscribe', `${TEACHER}--${MAIN}`), { side: 20 }));
			const fresh = 'u-fresh';
			await assertFails(
				setDoc(doc(as(fresh), 'statementsSubscribe', `${fresh}--${MAIN}`), { ...sub(fresh, 'member'), statementsSubscribeId: `${fresh}--${MAIN}`, userId: fresh, side: 20 }),
			);
		});

		it('so a reader of the roster finds no side on it', async () => {
			const roster = await assertSucceeds(
				getDocs(query(collection(as(TEACHER), 'statementsSubscribe'), where('statementId', '==', MAIN))),
			);
			for (const d of roster.docs) {
				assert.equal('side' in d.data() || 'camp' in d.data() || 'decisionSupport' in d.data(), false);
			}
		});

		it('accepts the old fields from the owner only while the rollout flag is open', async () => {
			await setFlag(true);
			await assertSucceeds(updateDoc(doc(as(S1), 'statementsSubscribe', SIDE1), { side: 20, camp: 'a', lastUpdate: T0 + 5 }));
			await assertFails(updateDoc(doc(as(TEACHER), 'statementsSubscribe', SIDE1), { side: 30 }));
			await setFlag(false);
			await assertFails(updateDoc(doc(as(S1), 'statementsSubscribe', SIDE1), { side: 30, lastUpdate: T0 + 6 }));
			await setFlag(undefined);
		});

		it('still lets the teacher change other fields of a student\'s doc', async () => {
			await assertSucceeds(updateDoc(doc(as(TEACHER), 'statementsSubscribe', SIDE1), { renameRequested: true }));
		});
	});

	describe('statementsSubscribe: sidePickedAt cannot lie or be forged', () => {
		it('the owner cannot set it without a camp on their private doc', async () => {
			await assertFails(updateDoc(doc(as(S1), 'statementsSubscribe', SIDE1), { sidePickedAt: T0 }));
			const db = as(S1);
			const batch = writeBatch(db);
			batch.set(doc(db, 'classSides', SIDE1), side(S1, { decisionSupport: 1 }));
			batch.update(doc(db, 'statementsSubscribe', SIDE1), { sidePickedAt: T0 });
			await assertFails(batch.commit());
		});

		it('the owner may set it alone once the private doc already has a camp', async () => {
			await assertSucceeds(updateDoc(doc(as(S2), 'statementsSubscribe', SIDE2), { sidePickedAt: T0 }));
		});

		it('must be a number, and is not removed by the owner', async () => {
			await assertFails(updateDoc(doc(as(S2), 'statementsSubscribe', SIDE2), { sidePickedAt: true }));
			await seed(env, (db) => updateDoc(doc(db, 'statementsSubscribe', SIDE2), { sidePickedAt: T0 }));
			await assertFails(updateDoc(doc(as(S2), 'statementsSubscribe', SIDE2), { sidePickedAt: deleteField() }));
		});

		it('the teacher cannot set or clear it on a student\'s doc', async () => {
			await assertFails(updateDoc(doc(as(TEACHER), 'statementsSubscribe', SIDE2), { sidePickedAt: T0 }));
			await seed(env, (db) => updateDoc(doc(db, 'statementsSubscribe', SIDE2), { sidePickedAt: T0 }));
			await assertFails(updateDoc(doc(as(TEACHER), 'statementsSubscribe', SIDE2), { sidePickedAt: deleteField() }));
		});

		it('a classmate cannot set it on someone else\'s doc', async () => {
			await assertFails(updateDoc(doc(as(S1), 'statementsSubscribe', SIDE2), { sidePickedAt: T0 }));
		});

		it('cannot come with a new subscription', async () => {
			const fresh = 'u-fresh2';
			await assertFails(setDoc(doc(as(fresh), 'statementsSubscribe', `${fresh}--${MAIN}`), { ...sub(fresh, 'member'), sidePickedAt: T0 }));
		});
	});

	describe('sides are frozen at Vote and Summary (no late pick, no change)', () => {
		it('refuses a first pick at Vote and at Summary, with or without the flag', async () => {
			for (const step of ['vote', 'summary']) {
				await setStep(step);
				await assertFails(pick(S1, 20, 'a'));
				await assertFails(pick(S1, 20, 'a', false));
			}
		});

		it('refuses changing side or camp at Vote and at Summary', async () => {
			for (const step of ['vote', 'summary']) {
				await setStep(step);
				await assertFails(updateDoc(doc(as(S2), 'classSides', SIDE2), { side: 10, camp: 'a', lastUpdate: T0 + 9 }));
				await assertFails(updateDoc(doc(as(S2), 'classSides', SIDE2), { side: 70, lastUpdate: T0 + 9 }));
			}
		});

		it('refuses setting the flag alone at Vote and at Summary', async () => {
			for (const step of ['vote', 'summary']) {
				await setStep(step);
				await assertFails(updateDoc(doc(as(S2), 'statementsSubscribe', SIDE2), { sidePickedAt: T0 }));
			}
		});

		it('keeps decisionSupport writable at Summary (new doc and existing doc)', async () => {
			await setStep('summary');
			await assertSucceeds(updateDoc(doc(as(S2), 'classSides', SIDE2), { decisionSupport: -0.5, lastUpdate: T0 + 9 }));
			await assertSucceeds(setDoc(doc(as(S1), 'classSides', SIDE1), side(S1, { decisionSupport: 1 })));
		});

		it('still allows a pick and a change at Side and at the steps before Vote', async () => {
			for (const step of ['side', 'tables', 'proposals', 'allProposals']) {
				await setStep(step);
				await assertSucceeds(pick(S1, 20, 'a', step === 'side'));
				await assertSucceeds(updateDoc(doc(as(S2), 'classSides', SIDE2), { side: 10, camp: 'a', lastUpdate: T0 + 9 }));
			}
		});

		it('an old tab cannot do it through the subscription either, even with the window open', async () => {
			await setFlag(true);
			await setStep('vote');
			await assertFails(updateDoc(doc(as(S1), 'statementsSubscribe', SIDE1), { side: 20, camp: 'a', lastUpdate: T0 + 9 }));
			await assertSucceeds(updateDoc(doc(as(S1), 'statementsSubscribe', SIDE1), { decisionSupport: 1, lastUpdate: T0 + 9 }));
			await setStep('side');
			await assertSucceeds(updateDoc(doc(as(S1), 'statementsSubscribe', SIDE1), { side: 20, camp: 'a', lastUpdate: T0 + 10 }));
			await setFlag(undefined);
		});
	});

	describe('classSides: a side once set stays', () => {
		it('the owner cannot remove camp or side (the flag would outlive its camp)', async () => {
			await assertFails(updateDoc(doc(as(S2), 'classSides', SIDE2), { camp: deleteField(), lastUpdate: T0 + 9 }));
			await assertFails(updateDoc(doc(as(S2), 'classSides', SIDE2), { side: deleteField(), lastUpdate: T0 + 9 }));
			await assertFails(setDoc(doc(as(S2), 'classSides', SIDE2), side(S2, { decisionSupport: 1 })));
		});

		it('a collection-group query on classSides is refused', async () => {
			await assertFails(getDocs(collectionGroup(as(S2), 'classSides')));
			await assertFails(getDocs(query(collectionGroup(as(TEACHER), 'classSides'), where('mainId', '==', MAIN))));
		});
	});

	describe('old subscriptions that still hold a side keep working (window closed)', () => {
		beforeEach(async () => {
			await seed(env, (db) =>
				setDoc(doc(db, 'statementsSubscribe', SIDE1), sub(S1, 'member', { side: 20, camp: 'a', decisionSupport: 1 })),
			);
		});

		it('the owner\'s unrelated update succeeds', async () => {
			await assertSucceeds(updateDoc(doc(as(S1), 'statementsSubscribe', SIDE1), { getInAppNotification: true, lastUpdate: T0 + 9 }));
		});

		it('the teacher\'s unrelated update succeeds', async () => {
			await assertSucceeds(updateDoc(doc(as(TEACHER), 'statementsSubscribe', SIDE1), { renameRequested: true }));
		});

		it('but nobody changes the old fields there', async () => {
			await assertFails(updateDoc(doc(as(S1), 'statementsSubscribe', SIDE1), { camp: 'b' }));
			await assertFails(updateDoc(doc(as(TEACHER), 'statementsSubscribe', SIDE1), { camp: 'b' }));
		});
	});
});
