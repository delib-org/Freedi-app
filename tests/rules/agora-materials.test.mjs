import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * Library materials: the teacher's extracted text is readable by any signed-in
 * user and written by nobody from a browser; a student's AI conversation about
 * it is readable by that student ALONE and written by nobody from a browser
 * (agoraAskMaterials counts the 15-question allowance — a client that could
 * write the doc could reset it).
 */
describe('agora library materials', () => {
	let env;

	const SESSION = 'session-materials';
	const ALICE = 'student-alice';
	const BOB = 'student-bob';
	const TEACHER = 'teacher-1';
	const MATERIALS = 'pkg-1--scene-1';

	before(async () => {
		env = await makeEnv('agora-materials');
		await seed(env, async (db) => {
			await setDoc(doc(db, 'agoraSceneMaterials', MATERIALS), {
				topicPackageId: 'pkg-1',
				sceneId: 'scene-1',
				teacherId: TEACHER,
				items: [],
				lastUpdate: 1,
			});
			await setDoc(doc(db, 'agoraMaterialChats', `${SESSION}--${ALICE}`), {
				sessionId: SESSION,
				userId: ALICE,
				used: 2,
				messages: [],
				lastUpdate: 1,
			});
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	describe('scene materials', () => {
		it('lets any signed-in user read one, but not list them', async () => {
			const db = env.authenticatedContext(ALICE).firestore();
			await assertSucceeds(getDoc(doc(db, 'agoraSceneMaterials', MATERIALS)));
			await assertFails(getDocs(collection(db, 'agoraSceneMaterials')));
		});

		it('refuses a signed-out reader', async () => {
			const db = env.unauthenticatedContext().firestore();
			await assertFails(getDoc(doc(db, 'agoraSceneMaterials', MATERIALS)));
		});

		it('refuses every browser write, the teacher\'s included', async () => {
			for (const uid of [TEACHER, ALICE]) {
				const db = env.authenticatedContext(uid).firestore();
				await assertFails(
					setDoc(doc(db, 'agoraSceneMaterials', 'pkg-1--scene-2'), {
						topicPackageId: 'pkg-1',
						sceneId: 'scene-2',
						teacherId: uid,
						items: [],
						lastUpdate: 1,
					}),
				);
				await assertFails(updateDoc(doc(db, 'agoraSceneMaterials', MATERIALS), { items: [] }));
				await assertFails(deleteDoc(doc(db, 'agoraSceneMaterials', MATERIALS)));
			}
		});
	});

	describe('private chat', () => {
		it('lets the student read their own conversation', async () => {
			const db = env.authenticatedContext(ALICE).firestore();
			await assertSucceeds(getDoc(doc(db, 'agoraMaterialChats', `${SESSION}--${ALICE}`)));
		});

		it('lets the student ask whether they have one yet (a missing doc is not an error)', async () => {
			const db = env.authenticatedContext(BOB).firestore();
			await assertSucceeds(getDoc(doc(db, 'agoraMaterialChats', `${SESSION}--${BOB}`)));
		});

		it('keeps it from a classmate, the teacher, and signed-out readers', async () => {
			for (const context of [
				env.authenticatedContext(BOB),
				env.authenticatedContext(TEACHER),
				env.unauthenticatedContext(),
			]) {
				await assertFails(
					getDoc(doc(context.firestore(), 'agoraMaterialChats', `${SESSION}--${ALICE}`)),
				);
			}
		});

		it('cannot be listed', async () => {
			const db = env.authenticatedContext(ALICE).firestore();
			await assertFails(getDocs(collection(db, 'agoraMaterialChats')));
		});

		it('cannot be written from a browser — the allowance is the server\'s', async () => {
			const db = env.authenticatedContext(ALICE).firestore();
			const ref = doc(db, 'agoraMaterialChats', `${SESSION}--${ALICE}`);
			await assertFails(updateDoc(ref, { used: 0 }));
			await assertFails(setDoc(ref, { sessionId: SESSION, userId: ALICE, used: 0, messages: [], lastUpdate: 2 }));
			await assertFails(deleteDoc(ref));
			await assertFails(
				setDoc(doc(db, 'agoraMaterialChats', `${SESSION}--${BOB}`), {
					sessionId: SESSION,
					userId: BOB,
					used: 0,
					messages: [],
					lastUpdate: 2,
				}),
			);
		});
	});
});
