import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * join-class "how many students are in the class?" (docs/ia/stakeholder-count-n.md):
 * the lesson holds `evaluationSettings.targetPopulation` and each of its questions
 * carries a copy. The teacher's browser writes both in one batch, after the server
 * made the lesson. The IA claimed no rule change is needed, by reading only; these
 * tests run that claim.
 */
describe('join-class class size on the lesson and its questions', () => {
	let env;

	const OWNER = 'u-teacher';
	const CO = 'u-co-teacher';
	const OTHER = 'u-other-teacher';
	const STUDENT = 'u-student';
	const HOME = 'jcClass_class-92';
	const LESSON = 'lesson-1';
	const Q = 'q-guiding';
	const CH = 'q-challenge';
	const T0 = 1_800_000_000_000;

	const sub = (uid, statementId, role) => ({
		statementsSubscribeId: `${uid}--${statementId}`,
		userId: uid,
		statementId,
		role,
		lastUpdate: T0,
		createdAt: T0,
	});
	const as = (uid) => env.authenticatedContext(uid).firestore();
	const patch = (n) => ({ evaluationSettings: { targetPopulation: n }, lastUpdate: T0 + 5 });

	/** What ClassForm and the console do: lesson and questions in one batch. */
	const writeAll = (db, n) => {
		const batch = writeBatch(db);
		for (const id of [LESSON, Q, CH]) {
			batch.set(doc(db, 'statements', id), patch(n), { merge: true });
		}

		return batch.commit();
	};

	before(async () => {
		env = await makeEnv('join-class-class-size');
		await seed(env, async (db) => {
			await setDoc(doc(db, 'statements', HOME), {
				statementId: HOME,
				statement: 'ט׳2',
				statementType: 'group',
				parentId: 'top',
				topParentId: HOME,
				parents: [],
				creatorId: OWNER,
				creator: { uid: OWNER, displayName: 'T' },
				membership: { access: 'secret' },
				statementSettings: { classHome: { kind: 'class', classId: 'class-92' } },
			});
			await setDoc(doc(db, 'statementsSubscribe', `${OWNER}--${HOME}`), sub(OWNER, HOME, 'admin'));

			await setDoc(doc(db, 'statements', LESSON), {
				statementId: LESSON,
				statement: 'Report or keep quiet?',
				statementType: 'question',
				parentId: HOME,
				topParentId: HOME,
				parents: [HOME],
				creatorId: OWNER,
				creator: { uid: OWNER, displayName: 'T' },
				membership: { access: 'openToAll' },
				statementSettings: {
					lessonPlan: { steps: ['waiting', 'opening'], stepIndex: 0, status: 'live', statusAt: T0 },
					classCode: '424242',
					classLesson: { planId: 'p1', gameId: 'g1', classId: 'class-92', className: 'ט׳2' },
				},
			});
			await setDoc(doc(db, 'statementsSubscribe', `${OWNER}--${LESSON}`), sub(OWNER, LESSON, 'admin'));
			await setDoc(doc(db, 'statementsSubscribe', `${CO}--${LESSON}`), sub(CO, LESSON, 'admin'));
			for (const [id, role] of [
				[Q, 'guiding'],
				[CH, 'challenge'],
			]) {
				await setDoc(doc(db, 'statements', id), {
					statementId: id,
					statement: id,
					statementType: 'question',
					parentId: LESSON,
					topParentId: HOME,
					parents: [HOME, LESSON],
					creatorId: OWNER,
					creator: { uid: OWNER, displayName: 'T' },
					statementSettings: { classRole: role },
				});
			}
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	it('lets the lesson creator write N on the lesson and all its questions in one batch', async () => {
		await assertSucceeds(writeAll(as(OWNER), 28));

		for (const id of [LESSON, Q, CH]) {
			const snap = await getDoc(doc(as(OWNER), 'statements', id));
			if (snap.data().evaluationSettings?.targetPopulation !== 28) {
				throw new Error(`${id} did not keep targetPopulation 28`);
			}
		}
	});

	it('lets the teacher change it again later (the console save)', async () => {
		await assertSucceeds(writeAll(as(OWNER), 31));
		await assertSucceeds(writeAll(as(OWNER), 40));
	});

	it('lets a copied admin teacher of the lesson write it too', async () => {
		await assertSucceeds(writeAll(as(CO), 25));
	});

	it('keeps the lesson link fields untouched by that write', async () => {
		const snap = await getDoc(doc(as(OWNER), 'statements', LESSON));
		const settings = snap.data().statementSettings;
		if (!settings.classLesson || settings.classCode !== '424242') {
			throw new Error('classLesson or classCode changed');
		}
	});

	it('refuses another teacher, a student and a signed-out visitor', async () => {
		await assertFails(writeAll(as(OTHER), 99));
		await assertFails(writeAll(as(STUDENT), 99));
		await assertFails(writeAll(env.unauthenticatedContext().firestore(), 99));
		await assertFails(
			setDoc(doc(as(STUDENT), 'statements', Q), patch(99), { merge: true }),
		);
	});

	it('a batch that includes the home fails whole (the home stays server-only)', async () => {
		const db = as(OWNER);
		const batch = writeBatch(db);
		batch.set(doc(db, 'statements', LESSON), patch(10), { merge: true });
		batch.set(doc(db, 'statements', HOME), patch(10), { merge: true });
		await assertFails(batch.commit());
		const snap = await getDoc(doc(db, 'statements', LESSON));
		if (snap.data().evaluationSettings?.targetPopulation === 10) {
			throw new Error('the lesson write leaked out of a failed batch');
		}
	});
});
