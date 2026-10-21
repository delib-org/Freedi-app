import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * `classCodes/{code}` is join-class's six-digit class code -> workspace lookup
 * behind /c/:code. Any signed-in user reads it (students are anonymous); only
 * an admin of the workspace it points at creates or updates it; nobody deletes.
 */
describe('classCodes', () => {
	let env;

	const TEACHER = 'user-teacher';
	const STUDENT = 'user-student';
	const OTHER_TEACHER = 'user-other-teacher';
	const MAIN = 'main-1';
	const OTHER_MAIN = 'main-2';
	const CODE = '123456';
	const T0 = 1_800_000_000_000;

	const entry = (mainId = MAIN) => ({ mainId, createdAt: T0 });

	before(async () => {
		env = await makeEnv('class-codes');
		await seed(env, async (db) => {
			await setDoc(doc(db, 'statementsSubscribe', `${TEACHER}--${MAIN}`), {
				statementId: MAIN,
				userId: TEACHER,
				role: 'admin',
			});
			await setDoc(doc(db, 'statementsSubscribe', `${OTHER_TEACHER}--${OTHER_MAIN}`), {
				statementId: OTHER_MAIN,
				userId: OTHER_TEACHER,
				role: 'statement-creator',
			});
			await setDoc(doc(db, 'statementsSubscribe', `${STUDENT}--${MAIN}`), {
				statementId: MAIN,
				userId: STUDENT,
				role: 'member',
			});
			await setDoc(doc(db, 'classCodes', CODE), entry());
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	it('lets any signed-in user resolve a code', async () => {
		await assertSucceeds(getDoc(doc(env.authenticatedContext(STUDENT).firestore(), 'classCodes', CODE)));
	});

	it('refuses an unauthenticated read', async () => {
		await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), 'classCodes', CODE)));
	});

	it('lets an admin of the workspace create a code for it', async () => {
		const db = env.authenticatedContext(TEACHER).firestore();
		await assertSucceeds(setDoc(doc(db, 'classCodes', '654321'), entry()));
	});

	it('refuses a student creating a code', async () => {
		const db = env.authenticatedContext(STUDENT).firestore();
		await assertFails(setDoc(doc(db, 'classCodes', '111111'), entry()));
	});

	it("refuses an admin creating a code that points at someone else's workspace", async () => {
		const db = env.authenticatedContext(TEACHER).firestore();
		await assertFails(setDoc(doc(db, 'classCodes', '222222'), entry(OTHER_MAIN)));
	});

	it('refuses a malformed code id and extra fields', async () => {
		const db = env.authenticatedContext(TEACHER).firestore();
		await assertFails(setDoc(doc(db, 'classCodes', '12345'), entry()));
		await assertFails(setDoc(doc(db, 'classCodes', 'abcdef'), entry()));
		await assertFails(setDoc(doc(db, 'classCodes', '333333'), { ...entry(), extra: true }));
	});

	it('refuses re-pointing an existing code, even by another admin', async () => {
		const other = env.authenticatedContext(OTHER_TEACHER).firestore();
		await assertFails(updateDoc(doc(other, 'classCodes', CODE), { mainId: OTHER_MAIN }));
		const owner = env.authenticatedContext(TEACHER).firestore();
		await assertFails(updateDoc(doc(owner, 'classCodes', CODE), { mainId: OTHER_MAIN }));
	});

	it('lets the workspace admin update its own code, never a stranger', async () => {
		const owner = env.authenticatedContext(TEACHER).firestore();
		await assertSucceeds(setDoc(doc(owner, 'classCodes', CODE), { mainId: MAIN, createdAt: T0 + 1 }));
		const student = env.authenticatedContext(STUDENT).firestore();
		await assertFails(setDoc(doc(student, 'classCodes', CODE), { mainId: MAIN, createdAt: T0 + 2 }));
	});

	it('refuses every client delete', async () => {
		const db = env.authenticatedContext(TEACHER).firestore();
		await assertFails(deleteDoc(doc(db, 'classCodes', CODE)));
	});
});
