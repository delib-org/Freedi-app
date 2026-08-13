import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { agoraProposalDoc, makeEnv, seed, statementDoc } from './helpers.mjs';

/**
 * /statements is shared by every Freedi app, and Agora's proposals live in it.
 * The Agora cases below are the sharp end: those documents carry neither
 * questionSettings nor statementSettings, and hasProtectedFieldChanges() is
 * gated on the document having both keys — so they currently fall through the
 * only guard the collection has.
 */
describe('/statements', () => {
	let env;

	before(async () => {
		env = await makeEnv();
	});

	after(async () => {
		await env?.cleanup();
	});

	const AUTHOR = 'student-alice';
	const CLASSMATE = 'student-bob';
	const SESSION = 'session-1';

	describe('read', () => {
		it('rejects an unauthenticated read', async () => {
			await seed(env, async (db) => {
				await setDoc(
					doc(db, 'statements', 'public-read'),
					agoraProposalDoc({ statementId: 'public-read', uid: AUTHOR, sessionId: SESSION }),
				);
			});

			const db = env.unauthenticatedContext().firestore();
			await assertFails(getDoc(doc(db, 'statements', 'public-read')));
		});

		it('allows an authenticated read', async () => {
			await seed(env, async (db) => {
				await setDoc(
					doc(db, 'statements', 'authed-read'),
					statementDoc({ statementId: 'authed-read', uid: AUTHOR }),
				);
			});

			const db = env.authenticatedContext(CLASSMATE).firestore();
			await assertSucceeds(getDoc(doc(db, 'statements', 'authed-read')));
		});
	});

	describe('create', () => {
		it('allows creating a statement as yourself', async () => {
			const db = env.authenticatedContext(AUTHOR).firestore();
			await assertSucceeds(
				setDoc(
					doc(db, 'statements', 'mine-1'),
					statementDoc({ statementId: 'mine-1', uid: AUTHOR }),
				),
			);
		});

		it('rejects creating a statement under a classmate’s identity', async () => {
			const db = env.authenticatedContext(AUTHOR).firestore();
			await assertFails(
				setDoc(
					doc(db, 'statements', 'forged-1'),
					statementDoc({ statementId: 'forged-1', uid: CLASSMATE }),
				),
			);
		});

		it('rejects an unauthenticated create', async () => {
			const db = env.unauthenticatedContext().firestore();
			await assertFails(
				setDoc(
					doc(db, 'statements', 'anon-1'),
					statementDoc({ statementId: 'anon-1', uid: 'nobody' }),
				),
			);
		});
	});

	describe('update', () => {
		it('allows an author to edit their own proposal', async () => {
			await seed(env, async (db) => {
				await setDoc(
					doc(db, 'statements', 'own-edit'),
					agoraProposalDoc({ statementId: 'own-edit', uid: AUTHOR, sessionId: SESSION }),
				);
			});

			const db = env.authenticatedContext(AUTHOR).firestore();
			await assertSucceeds(
				updateDoc(doc(db, 'statements', 'own-edit'), {
					statement: 'my improved proposal',
					lastUpdate: 1_700_000_001_000,
				}),
			);
		});

		// The headline classroom exploit: rewriting a classmate's work.
		it('rejects a classmate rewriting an Agora proposal', async () => {
			await seed(env, async (db) => {
				await setDoc(
					doc(db, 'statements', 'victim-proposal'),
					agoraProposalDoc({ statementId: 'victim-proposal', uid: AUTHOR, sessionId: SESSION }),
				);
			});

			const db = env.authenticatedContext(CLASSMATE).firestore();
			await assertFails(
				updateDoc(doc(db, 'statements', 'victim-proposal'), {
					statement: 'vandalised',
					lastUpdate: 1_700_000_001_000,
				}),
			);
		});

		// Feeds creditWeaves in fn_onAgoraProposal, which trusts sibling docs'
		// suggestionStatus and creatorId to pay out weave credit.
		it('rejects a classmate flipping suggestionStatus to thanked', async () => {
			await seed(env, async (db) => {
				await setDoc(
					doc(db, 'statements', 'suggestion-1'),
					agoraProposalDoc({
						statementId: 'suggestion-1',
						uid: AUTHOR,
						sessionId: SESSION,
						overrides: { statementType: 'suggestion', suggestionStatus: 'open' },
					}),
				);
			});

			const db = env.authenticatedContext(CLASSMATE).firestore();
			await assertFails(
				updateDoc(doc(db, 'statements', 'suggestion-1'), {
					suggestionStatus: 'thanked',
					statusChangedAt: 1_700_000_001_000,
				}),
			);
		});

		it('rejects a classmate awarding points on someone else’s statement', async () => {
			await seed(env, async (db) => {
				await setDoc(
					doc(db, 'statements', 'points-target'),
					agoraProposalDoc({ statementId: 'points-target', uid: AUTHOR, sessionId: SESSION }),
				);
			});

			const db = env.authenticatedContext(CLASSMATE).firestore();
			await assertFails(
				updateDoc(doc(db, 'statements', 'points-target'), { agoraPointsAwarded: 999 }),
			);
		});
	});
});
