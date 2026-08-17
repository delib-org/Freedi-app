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
		env = await makeEnv('statements');
	});

	after(async () => {
		await env?.cleanup();
	});

	const AUTHOR = 'student-alice';
	const CLASSMATE = 'student-bob';
	const SESSION = 'session-1';

	describe('read', () => {
		// SKIPPED, and the skip is the point.
		//
		// The rule is written and correct, but staged behind four app deploys:
		// the main app, Sign, Join and Chat all read before signing in on their
		// CURRENTLY DEPLOYED versions. The fixes are committed and not shipped.
		// Turning the gate on first would blank Sign's comment panes, Join's
		// shared chat links and Chat's live updates in production.
		//
		// Un-skip together with flipping `allow read` in firestore.rules.
		it.skip('rejects an unauthenticated read (staged behind app deploys)', async () => {
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

/**
 * The permissive branch.
 *
 * `isAllowedToUpdate()` let ANY authenticated user write any statement so long
 * as no "protected field" changed — and `hasProtectedFieldChanges()` was gated
 * on the document HAVING both questionSettings and statementSettings. Questions
 * have them. Chat messages, paragraphs, comments, suggestions, evidence cards
 * and cluster members do not, so for all of those the guard reported "nothing
 * protected changed" and the write went through.
 *
 * Freedi is one deliberation seen through several UIs, so this was not a
 * corner: it is every lightweight statement in the product, editable by anyone
 * with an anonymous session.
 */
describe('/statements — the permissive update branch', () => {
	let env;

	before(async () => {
		env = await makeEnv('statements-permissive');
	});

	after(async () => {
		await env?.cleanup();
	});

	const AUTHOR = 'user-alice';
	const STRANGER = 'user-mallory';

	/** A chat message, paragraph or comment: no questionSettings, no statementSettings. */
	function lightweight(statementId, overrides = {}) {
		return statementDoc({
			statementId,
			uid: AUTHOR,
			overrides: { statementType: 'statement', ...overrides },
		});
	}

	async function seedOne(statementId, overrides) {
		await seed(env, async (db) => {
			await setDoc(doc(db, 'statements', statementId), lightweight(statementId, overrides));
		});
	}

	it('rejects a stranger rewriting someone’s chat message', async () => {
		await seedOne('chat-msg');
		const db = env.authenticatedContext(STRANGER).firestore();
		await assertFails(
			updateDoc(doc(db, 'statements', 'chat-msg'), { statement: 'not what they said' }),
		);
	});

	it('rejects a stranger rewriting a paragraph of someone’s document', async () => {
		await seedOne('para-1', { statementType: 'paragraph' });
		const db = env.authenticatedContext(STRANGER).firestore();
		await assertFails(updateDoc(doc(db, 'statements', 'para-1'), { statement: 'edited' }));
	});

	it('rejects a stranger reparenting someone’s statement', async () => {
		// Reparenting was explicitly allowed by the old comment. Moving another
		// person's contribution under a different question is not a small edit.
		await seedOne('reparent-me');
		const db = env.authenticatedContext(STRANGER).firestore();
		await assertFails(
			updateDoc(doc(db, 'statements', 'reparent-me'), { parentId: 'somewhere-else' }),
		);
	});

	it('rejects a stranger hiding someone’s statement', async () => {
		await seedOne('hide-me');
		const db = env.authenticatedContext(STRANGER).firestore();
		await assertFails(updateDoc(doc(db, 'statements', 'hide-me'), { hide: true }));
	});

	it('still lets the author edit their own', async () => {
		await seedOne('mine-to-edit');
		const db = env.authenticatedContext(AUTHOR).firestore();
		await assertSucceeds(
			updateDoc(doc(db, 'statements', 'mine-to-edit'), {
				statement: 'a second thought',
				lastUpdate: 1_700_000_002_000,
			}),
		);
	});

	// The allowlist: what an ordinary participant legitimately does to a
	// document somebody else wrote.
	it('lets a participant join an option', async () => {
		await seedOne('joinable', { statementType: 'option', joined: [] });
		const db = env.authenticatedContext(STRANGER).firestore();
		await assertSucceeds(
			updateDoc(doc(db, 'statements', 'joinable'), {
				joined: [{ userId: STRANGER }],
				lastUpdate: 1_700_000_002_000,
			}),
		);
	});

	it('lets a participant vote an evidence card helpful', async () => {
		await seedOne('evidence-1', { evidence: { helpfulCount: 0, notHelpfulCount: 0 } });
		const db = env.authenticatedContext(STRANGER).firestore();
		await assertSucceeds(
			updateDoc(doc(db, 'statements', 'evidence-1'), {
				evidence: { helpfulCount: 1, notHelpfulCount: 0 },
				lastUpdate: 1_700_000_002_000,
			}),
		);
	});

	it('lets a child creation bump the parent’s clock', async () => {
		await seedOne('parent-q');
		const db = env.authenticatedContext(STRANGER).firestore();
		await assertSucceeds(
			updateDoc(doc(db, 'statements', 'parent-q'), {
				lastChildUpdate: 1_700_000_002_000,
				lastUpdate: 1_700_000_002_000,
			}),
		);
	});

	it('does not let an allowlisted field smuggle a rewrite alongside it', async () => {
		await seedOne('smuggle');
		const db = env.authenticatedContext(STRANGER).firestore();
		await assertFails(
			updateDoc(doc(db, 'statements', 'smuggle'), {
				lastUpdate: 1_700_000_002_000,
				statement: 'rewritten under cover of a timestamp',
			}),
		);
	});
});
