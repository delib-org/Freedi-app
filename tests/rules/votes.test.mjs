import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * The votes collection was `allow write: if request.auth.uid != null` — with
 * anonymous auth on, that is "anyone at all", and one signed-in stranger could
 * have rewritten a whole class's ballot. These tests pin the id-ownership rule
 * that replaced it: a vote doc is `{userId}--{parentId}`, and you may only
 * write the one that spells out your own uid.
 */
describe('votes', () => {
	let env;

	before(async () => {
		env = await makeEnv('votes');
	});

	after(async () => {
		await env?.cleanup();
	});

	const ALICE = 'user-alice';
	const BOB = 'user-bob';
	const QUESTION = 'question-1';
	const OPTION = 'option-1';

	const voteDoc = ({ userId, parentId = QUESTION, statementId = OPTION }) => ({
		voteId: `${userId}--${parentId}`,
		statementId,
		userId,
		parentId,
		createdAt: 1_700_000_000_000,
		lastUpdate: 1_700_000_000_000,
	});

	it('lets a voter cast their own vote', async () => {
		const db = env.authenticatedContext(ALICE).firestore();
		await assertSucceeds(
			setDoc(doc(db, 'votes', `${ALICE}--${QUESTION}`), voteDoc({ userId: ALICE })),
		);
	});

	it('lets a voter change their mind', async () => {
		await seed(env, async (db) => {
			await setDoc(doc(db, 'votes', `${BOB}--${QUESTION}`), voteDoc({ userId: BOB }));
		});
		const db = env.authenticatedContext(BOB).firestore();
		await assertSucceeds(
			updateDoc(doc(db, 'votes', `${BOB}--${QUESTION}`), {
				statementId: 'option-2',
				lastUpdate: 1_700_000_000_001,
			}),
		);
	});

	// Withdrawal is a write, not a delete: the counting trigger needs the doc to
	// survive so it can decrement the option the voter is leaving.
	it('lets a voter withdraw by writing the none sentinel', async () => {
		await seed(env, async (db) => {
			await setDoc(doc(db, 'votes', `${ALICE}--${QUESTION}`), voteDoc({ userId: ALICE }));
		});
		const db = env.authenticatedContext(ALICE).firestore();
		await assertSucceeds(
			updateDoc(doc(db, 'votes', `${ALICE}--${QUESTION}`), {
				statementId: 'none',
				lastUpdate: 1_700_000_000_002,
			}),
		);
	});

	it('rejects a vote written into someone else’s slot', async () => {
		const db = env.authenticatedContext(ALICE).firestore();
		await assertFails(
			setDoc(doc(db, 'votes', `${BOB}--${QUESTION}`), voteDoc({ userId: BOB })),
		);
	});

	// The doc id is the ownership claim; userId is what the trigger reads. If
	// they can disagree, the id check protects nothing.
	it('rejects a vote whose userId does not match the caller', async () => {
		const db = env.authenticatedContext(ALICE).firestore();
		await assertFails(
			setDoc(doc(db, 'votes', `${ALICE}--${QUESTION}`), voteDoc({ userId: BOB })),
		);
	});

	it('rejects a vote whose doc id does not match its parentId', async () => {
		const db = env.authenticatedContext(ALICE).firestore();
		await assertFails(
			setDoc(
				doc(db, 'votes', `${ALICE}--some-other-question`),
				voteDoc({ userId: ALICE, parentId: QUESTION }),
			),
		);
	});

	it('rejects overwriting another user’s existing vote', async () => {
		await seed(env, async (db) => {
			await setDoc(doc(db, 'votes', `${BOB}--${QUESTION}`), voteDoc({ userId: BOB }));
		});
		const db = env.authenticatedContext(ALICE).firestore();
		await assertFails(
			updateDoc(doc(db, 'votes', `${BOB}--${QUESTION}`), { statementId: 'option-9' }),
		);
	});

	it('rejects an unauthenticated vote', async () => {
		const db = env.unauthenticatedContext().firestore();
		await assertFails(
			setDoc(doc(db, 'votes', `${ALICE}--${QUESTION}`), voteDoc({ userId: ALICE })),
		);
	});

	// Tallies are public to the class (and the admin dashboard counts them).
	it('lets any signed-in user read the votes', async () => {
		await seed(env, async (db) => {
			await setDoc(doc(db, 'votes', `${BOB}--${QUESTION}`), voteDoc({ userId: BOB }));
		});
		const db = env.authenticatedContext(ALICE).firestore();
		await assertSucceeds(getDocs(collection(db, 'votes')));
	});
});
