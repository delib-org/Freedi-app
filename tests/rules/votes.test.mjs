import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
	collection,
	doc,
	getCountFromServer,
	getDoc,
	getDocs,
	query,
	setDoc,
	updateDoc,
	where,
} from 'firebase/firestore';
import { makeEnv, seed, statementDoc } from './helpers.mjs';

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

	describe('reading: a vote says who chose what, so it is a secret ballot', () => {
		const ADMIN = 'user-admin';
		const CREATOR = 'user-creator';
		const PARENT_ADMIN = 'user-parent-admin';
		const TOP_ADMIN = 'user-top-admin';
		const SYSTEM_ADMIN = 'user-system-admin';
		const STUDENT = 'user-student';
		const TEACHER = 'user-teacher';
		const NO_DEVICE = 'nd_11111111-2222-3333-4444-555555555555';
		const PROBLEM = 'problem-1';
		const GROUP = 'group-1';
		const TOP = 'top-1';
		const MAIN = 'class-main';
		const CHALLENGE = 'class-challenge';
		const AGORA_QUESTION = 'agora-question';

		const as = (uid) => env.authenticatedContext(uid).firestore();
		const byParent = (uid, parentId) =>
			getDocs(query(collection(as(uid), 'votes'), where('parentId', '==', parentId)));

		before(async () => {
			await seed(env, async (db) => {
				const subscription = (uid, statementId, role) =>
					setDoc(doc(db, 'statementsSubscribe', `${uid}--${statementId}`), {
						userId: uid,
						statementId,
						role,
					});
				await setDoc(
					doc(db, 'statements', PROBLEM),
					statementDoc({
						statementId: PROBLEM,
						uid: CREATOR,
						overrides: { statementType: 'question', parentId: GROUP, topParentId: TOP },
					}),
				);
				await setDoc(
					doc(db, 'statements', MAIN),
					statementDoc({ statementId: MAIN, uid: TEACHER, overrides: { statementType: 'question' } }),
				);
				await setDoc(
					doc(db, 'statements', CHALLENGE),
					statementDoc({
						statementId: CHALLENGE,
						uid: TEACHER,
						overrides: {
							statementType: 'question',
							parentId: MAIN,
							topParentId: MAIN,
							statementSettings: { classRole: 'challenge' },
						},
					}),
				);
				await setDoc(
					doc(db, 'statements', AGORA_QUESTION),
					statementDoc({
						statementId: AGORA_QUESTION,
						uid: TEACHER,
						overrides: { statementType: 'question', agoraSessionId: 'session-1' },
					}),
				);
				await subscription(ADMIN, PROBLEM, 'admin');
				await subscription(PARENT_ADMIN, GROUP, 'admin');
				await subscription(TOP_ADMIN, TOP, 'statement-creator');
				await subscription(STUDENT, PROBLEM, 'member');
				await subscription(TEACHER, MAIN, 'admin');
				await setDoc(doc(db, 'usersV2', SYSTEM_ADMIN), { systemAdmin: true });
				for (const [userId, parentId] of [
					[ALICE, PROBLEM],
					[BOB, PROBLEM],
					[ALICE, CHALLENGE],
					[BOB, CHALLENGE],
					[NO_DEVICE, CHALLENGE],
					[ALICE, AGORA_QUESTION],
				]) {
					await setDoc(doc(db, 'votes', `${userId}--${parentId}`), voteDoc({ userId, parentId }));
				}
			});
		});

		it('lets a voter read their own vote', async () => {
			await assertSucceeds(getDoc(doc(as(ALICE), 'votes', `${ALICE}--${PROBLEM}`)));
		});

		// getToVoteOnParent, listenMyVote and the toggle transaction all read the
		// slot before the first vote: a refusal there would break voting itself.
		it('lets a first-time voter read their own empty slot', async () => {
			await assertSucceeds(getDoc(doc(as(ALICE), 'votes', `${ALICE}--never-voted`)));
		});

		it('lets a voter query their own votes', async () => {
			await assertSucceeds(
				getDocs(query(collection(as(ALICE), 'votes'), where('userId', '==', ALICE))),
			);
		});

		it('refuses reading another voter’s vote', async () => {
			await assertFails(getDoc(doc(as(ALICE), 'votes', `${BOB}--${PROBLEM}`)));
		});

		// Were a missing slot readable, "denied" would mean "this person voted".
		it('refuses another voter’s empty slot too, so a refusal says nothing', async () => {
			await assertFails(getDoc(doc(as(ALICE), 'votes', `${BOB}--never-voted`)));
		});

		it('is not fooled by a uid that only starts the same', async () => {
			await assertFails(getDoc(doc(as('user-ali'), 'votes', `${ALICE}--${PROBLEM}`)));
		});

		it('refuses listing the collection unfiltered', async () => {
			await assertFails(getDocs(collection(as(ALICE), 'votes')));
		});

		it('refuses a member querying a whole question', async () => {
			await assertFails(byParent(STUDENT, PROBLEM));
		});

		it('refuses querying another voter by userId', async () => {
			await assertFails(getDocs(query(collection(as(ALICE), 'votes'), where('userId', '==', BOB))));
		});

		it('refuses an unauthenticated read', async () => {
			const db = env.unauthenticatedContext().firestore();
			await assertFails(getDoc(doc(db, 'votes', `${ALICE}--${PROBLEM}`)));
			await assertFails(getDocs(query(collection(db, 'votes'), where('parentId', '==', PROBLEM))));
		});

		// The host screen's "Get Voters": names of who voted on this question.
		for (const [who, uid] of [
			['the question’s admin', ADMIN],
			['the question’s creator', CREATOR],
			['the admin of its parent', PARENT_ADMIN],
			['the admin of its top parent', TOP_ADMIN],
		]) {
			it(`lets ${who} list that question’s voters`, async () => {
				await assertSucceeds(byParent(uid, PROBLEM));
			});
		}

		it('lets the question’s admin read one vote of that question', async () => {
			await assertSucceeds(getDoc(doc(as(ADMIN), 'votes', `${BOB}--${PROBLEM}`)));
		});

		it('does not let an admin of one question list another question', async () => {
			await assertFails(byParent(ADMIN, AGORA_QUESTION));
		});

		it('does not let an admin list every question at once', async () => {
			await assertFails(getDocs(collection(as(ADMIN), 'votes')));
		});

		// The dashboard reads adminStats now; nothing needs the raw collection.
		it('refuses a system admin the raw collection', async () => {
			await assertFails(getDocs(collection(as(SYSTEM_ADMIN), 'votes')));
			await assertFails(getCountFromServer(collection(as(SYSTEM_ADMIN), 'votes')));
		});

		it('refuses counting the collection through an aggregate query', async () => {
			await assertFails(getCountFromServer(collection(as(ALICE), 'votes')));
		});

		it('lets the Agora teacher see who voted in their session', async () => {
			await assertSucceeds(byParent(TEACHER, AGORA_QUESTION));
		});

		it('refuses an Agora student the class’s ballots', async () => {
			await assertFails(byParent(ALICE, AGORA_QUESTION));
		});

		describe('join-class challenge', () => {
			it('keeps the ballot secret from the teacher who runs the lesson', async () => {
				await assertFails(byParent(TEACHER, CHALLENGE));
				await assertFails(getDoc(doc(as(TEACHER), 'votes', `${BOB}--${CHALLENGE}`)));
			});

			it('keeps it secret from a classmate', async () => {
				await assertFails(byParent(ALICE, CHALLENGE));
				await assertFails(getDoc(doc(as(ALICE), 'votes', `${BOB}--${CHALLENGE}`)));
			});

			it('lets a student read their own', async () => {
				await assertSucceeds(getDoc(doc(as(ALICE), 'votes', `${ALICE}--${CHALLENGE}`)));
			});

			it('lets the teacher follow a student without a device, voted or not', async () => {
				await assertSucceeds(getDoc(doc(as(TEACHER), 'votes', `${NO_DEVICE}--${CHALLENGE}`)));
				await assertSucceeds(
					getDoc(doc(as(TEACHER), 'votes', 'nd_99999999-2222-3333-4444-555555555555--' + CHALLENGE)),
				);
			});

			it('refuses a classmate the no-device student’s slot', async () => {
				await assertFails(getDoc(doc(as(ALICE), 'votes', `${NO_DEVICE}--${CHALLENGE}`)));
			});

			it('refuses a teacher another class’s no-device slot', async () => {
				await assertFails(getDoc(doc(as(ADMIN), 'votes', `${NO_DEVICE}--${CHALLENGE}`)));
			});
		});
	});
});
