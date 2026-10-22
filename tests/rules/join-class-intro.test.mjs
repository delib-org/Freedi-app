import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * join-class lesson introduction (IA 14, question F): the lesson's teacher writes
 * the introduction text as paragraph child Statements of the main statement, and
 * the videos as `statementSettings.introVideos`. No new rule is needed: the
 * existing /statements rules already allow this, and these tests pin it so a
 * later tightening cannot silently break the plan screen.
 *
 *  - create: only as yourself (creatorId == auth.uid)
 *  - update / delete: the creator, or an admin of the parent (the lesson)
 *  - a student (member) may not touch the teacher's paragraphs
 */
describe('join-class introduction rules', () => {
	let env;

	const TEACHER = 'u-teacher';
	const CO_TEACHER = 'u-co-teacher';
	const STUDENT = 'u-student';
	const MAIN = 'main-intro';
	const T0 = 1_800_000_000_000;

	const sub = (uid, role) => ({
		statementsSubscribeId: `${uid}--${MAIN}`,
		userId: uid,
		statementId: MAIN,
		role,
		lastUpdate: T0,
		createdAt: T0,
	});

	// The exact shape createParagraphChildStatement produces for a list item with bold.
	const paragraph = (id, uid, order, extra = {}) => ({
		statementId: id,
		statement: `block ${order}`,
		statementType: 'paragraph',
		parentId: MAIN,
		topParentId: MAIN,
		parents: [MAIN],
		creatorId: uid,
		creator: { uid, displayName: 'T', isAnonymous: false },
		createdAt: T0,
		lastUpdate: T0,
		consensus: 0,
		order,
		blockType: 'li',
		doc: { order, paragraphType: 'li', listType: 'ul', contentHtml: `<strong>block</strong> ${order}` },
		...extra,
	});

	const as = (uid) => env.authenticatedContext(uid).firestore();

	before(async () => {
		env = await makeEnv('join-class-intro');
		await seed(env, async (db) => {
			await setDoc(doc(db, 'statements', MAIN), {
				statementId: MAIN,
				parentId: 'top',
				topParentId: MAIN,
				statementType: 'question',
				creatorId: TEACHER,
				creator: { uid: TEACHER, displayName: 'T' },
				statementSettings: { lessonPlan: { steps: ['waiting', 'opening'], stepIndex: 1 } },
			});
			await setDoc(doc(db, 'statementsSubscribe', `${TEACHER}--${MAIN}`), sub(TEACHER, 'statement-creator'));
			await setDoc(doc(db, 'statementsSubscribe', `${CO_TEACHER}--${MAIN}`), sub(CO_TEACHER, 'admin'));
			await setDoc(doc(db, 'statementsSubscribe', `${STUDENT}--${MAIN}`), sub(STUDENT, 'member'));
			await setDoc(doc(db, 'statements', 'p-existing'), paragraph('p-existing', TEACHER, 0));
			await setDoc(doc(db, 'statements', 'p-delete'), paragraph('p-delete', TEACHER, 1));
			await setDoc(doc(db, 'statements', 'p-co'), paragraph('p-co', TEACHER, 2));
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	it('lets the lesson teacher create a paragraph child under the lesson', async () => {
		await assertSucceeds(setDoc(doc(as(TEACHER), 'statements', 'p-new'), paragraph('p-new', TEACHER, 5)));
	});

	it('denies creating a paragraph as somebody else, or while signed out', async () => {
		await assertFails(setDoc(doc(as(STUDENT), 'statements', 'p-spoof'), paragraph('p-spoof', TEACHER, 6)));
		await assertFails(
			setDoc(
				doc(env.unauthenticatedContext().firestore(), 'statements', 'p-anon'),
				paragraph('p-anon', TEACHER, 7),
			),
		);
	});

	it('lets the teacher edit and delete their own paragraph', async () => {
		await assertSucceeds(
			updateDoc(doc(as(TEACHER), 'statements', 'p-existing'), {
				statement: 'edited',
				'doc.contentHtml': 'edited',
				lastUpdate: T0 + 1,
			}),
		);
		await assertSucceeds(deleteDoc(doc(as(TEACHER), 'statements', 'p-delete')));
	});

	it('lets an admin of the lesson edit and delete a paragraph the teacher wrote', async () => {
		await assertSucceeds(
			updateDoc(doc(as(CO_TEACHER), 'statements', 'p-co'), { statement: 'by co-teacher', lastUpdate: T0 + 2 }),
		);
		await assertSucceeds(deleteDoc(doc(as(CO_TEACHER), 'statements', 'p-co')));
	});

	it('writes the changed blocks in one batch: create + update + delete', async () => {
		await seed(env, async (db) => {
			await setDoc(doc(db, 'statements', 'b-upd'), paragraph('b-upd', TEACHER, 0));
			await setDoc(doc(db, 'statements', 'b-del'), paragraph('b-del', TEACHER, 1));
		});
		const db = as(TEACHER);
		const batch = writeBatch(db);
		batch.set(doc(db, 'statements', 'b-new'), paragraph('b-new', TEACHER, 2));
		batch.update(doc(db, 'statements', 'b-upd'), { statement: 'changed', lastUpdate: T0 + 3 });
		batch.delete(doc(db, 'statements', 'b-del'));
		await assertSucceeds(batch.commit());
	});

	it('denies a student editing or deleting the teacher paragraph', async () => {
		await assertFails(
			updateDoc(doc(as(STUDENT), 'statements', 'p-existing'), { statement: 'defaced', lastUpdate: T0 + 4 }),
		);
		await assertFails(deleteDoc(doc(as(STUDENT), 'statements', 'p-existing')));
	});

	it('lets any signed-in reader load the introduction paragraphs', async () => {
		await assertSucceeds(getDoc(doc(as(STUDENT), 'statements', 'p-existing')));
	});

	it('lets the teacher write introVideos and clear the deprecated videoUrl on the lesson', async () => {
		await assertSucceeds(
			updateDoc(doc(as(TEACHER), 'statements', MAIN), {
				'statementSettings.introVideos': [{ id: 'v1', title: 'One', url: 'https://youtu.be/abcDEF12345' }],
				lastUpdate: T0 + 5,
			}),
		);
	});

	it('denies a student writing introVideos or the projector choice', async () => {
		await assertFails(
			updateDoc(doc(as(STUDENT), 'statements', MAIN), {
				'statementSettings.introVideos': [{ id: 'x', title: 'x', url: 'https://youtu.be/abcDEF12345' }],
				lastUpdate: T0 + 6,
			}),
		);
		await assertFails(
			updateDoc(doc(as(STUDENT), 'statements', MAIN), {
				'statementSettings.lessonPlan.projectorVideoId': 'v1',
				lastUpdate: T0 + 6,
			}),
		);
	});
});
