import { after, before, describe, it } from 'node:test';
import { assertFails } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * evaluationParticipants/{parentId}--{userId} marks a user as already counted
 * in a question's evaluator total. Only the Admin SDK (evaluation triggers,
 * backfill) touches it; no client may read, write or delete it - not even the
 * user the marker is about.
 */
describe('evaluationParticipants', () => {
	let env;

	before(async () => {
		env = await makeEnv('evaluation-participants');
	});

	after(async () => {
		await env?.cleanup();
	});

	const ALICE = 'user-alice';
	const MARKER = `question-1--${ALICE}`;
	const marker = { parentId: 'question-1', userId: ALICE, createdAt: 1_700_000_000_000 };

	it('denies a signed-in user creating their own marker', async () => {
		const db = env.authenticatedContext(ALICE).firestore();
		await assertFails(setDoc(doc(db, 'evaluationParticipants', MARKER), marker));
	});

	it('denies an anonymous client any write', async () => {
		const db = env.unauthenticatedContext().firestore();
		await assertFails(setDoc(doc(db, 'evaluationParticipants', MARKER), marker));
	});

	it('denies reading and deleting an existing marker, even for its own user', async () => {
		await seed(env, async (db) => {
			await setDoc(doc(db, 'evaluationParticipants', MARKER), marker);
		});
		const db = env.authenticatedContext(ALICE).firestore();
		await assertFails(getDoc(doc(db, 'evaluationParticipants', MARKER)));
		await assertFails(deleteDoc(doc(db, 'evaluationParticipants', MARKER)));
	});
});
