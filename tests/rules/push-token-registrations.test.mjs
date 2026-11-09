import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
	arrayRemove,
	arrayUnion,
	collection,
	deleteDoc,
	doc,
	getDoc,
	getDocs,
	query,
	setDoc,
	updateDoc,
	where,
} from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * Two places besides pushNotifications hold FCM tokens.
 *
 * `askedToBeNotified/{token}_{statementId}` is legacy and belongs to whoever
 * wrote it: nobody else reads it or overwrites it, not even on a shared browser.
 *
 * `statementsSubscribe/{uid}--{statementId}.tokens` decides which devices get a
 * person's pushes, so an admin who may change the rest of a member's doc must
 * not be able to change that field.
 */
const ME = 'user-me';
const VICTIM = 'user-victim';
const ADMIN = 'user-admin';
const CREATOR = 'user-creator';
const STRANGER = 'user-stranger';
const STATEMENT = 'statement-1';
const T0 = 1_800_000_000_000;

describe('push token registrations', () => {
	let env;

	before(async () => {
		env = await makeEnv('push-token-registrations');
	});

	after(async () => {
		await env?.cleanup();
	});

	const as = (uid) => env.authenticatedContext(uid).firestore();

	describe('askedToBeNotified', () => {
		const NAME = 'askedToBeNotified';
		const ref = (db, id) => doc(db, NAME, id);
		const registrations = (db) => collection(db, NAME);
		const registration = (uid, token) => ({
			token,
			userId: uid,
			statementId: STATEMENT,
			lastUpdate: T0,
			subscribed: true,
		});
		const seedRegistration = (id, data) =>
			seed(env, async (db) => {
				await setDoc(ref(db, id), data);
			});

		describe('reading', () => {
			before(async () => {
				await seedRegistration('mine_s1', registration(ME, 'mine'));
				await seedRegistration('theirs_s1', registration(VICTIM, 'theirs'));
				await seedRegistration('no-owner_s1', { token: 'no-owner', statementId: STATEMENT });
			});

			it('reads my own registration', async () => {
				await assertSucceeds(getDoc(ref(as(ME), 'mine_s1')));
			});

			it('queries my own registrations', async () => {
				await assertSucceeds(getDocs(query(registrations(as(ME)), where('userId', '==', ME))));
			});

			it('accepts the debug query: mine, narrowed by token and statement', async () => {
				await assertSucceeds(
					getDocs(
						query(
							registrations(as(ME)),
							where('userId', '==', ME),
							where('token', '==', 'mine'),
							where('statementId', '==', STATEMENT),
						),
					),
				);
			});

			it('reads an id that does not exist, which reveals nothing', async () => {
				await assertSucceeds(getDoc(ref(as(ME), 'never-registered_s1')));
			});

			it('refuses a stranger reading someone’s registration', async () => {
				await assertFails(getDoc(ref(as(STRANGER), 'theirs_s1')));
			});

			it('refuses reading an old registration with no owner', async () => {
				await assertFails(getDoc(ref(as(ME), 'no-owner_s1')));
			});

			it('refuses querying another person’s registrations', async () => {
				await assertFails(getDocs(query(registrations(as(STRANGER)), where('userId', '==', VICTIM))));
			});

			it('refuses listing the collection', async () => {
				await assertFails(getDocs(registrations(as(STRANGER))));
			});

			it('refuses a query by statement alone', async () => {
				await assertFails(
					getDocs(query(registrations(as(STRANGER)), where('statementId', '==', STATEMENT))),
				);
			});

			it('refuses a query by token alone', async () => {
				await assertFails(
					getDocs(query(registrations(as(STRANGER)), where('token', '==', 'theirs'))),
				);
			});

			it('refuses an unauthenticated read', async () => {
				const db = env.unauthenticatedContext().firestore();
				await assertFails(getDoc(ref(db, 'mine_s1')));
				await assertFails(getDocs(registrations(db)));
			});
		});

		describe('overwriting', () => {
			it('refuses a stranger putting their name on someone’s registration', async () => {
				await seedRegistration('claim_s1', registration(VICTIM, 'claim'));
				await assertFails(
					setDoc(ref(as(STRANGER), 'claim_s1'), registration(STRANGER, 'claim'), { merge: true }),
				);
			});

			it('refuses a stranger replacing it outright', async () => {
				await seedRegistration('replace_s1', registration(VICTIM, 'replace'));
				await assertFails(setDoc(ref(as(STRANGER), 'replace_s1'), registration(STRANGER, 'replace')));
			});

			it('refuses a stranger claiming an old registration with no owner', async () => {
				await seedRegistration('old_s1', { token: 'old', statementId: STATEMENT });
				await assertFails(
					setDoc(ref(as(STRANGER), 'old_s1'), registration(STRANGER, 'old'), { merge: true }),
				);
			});

			it('refuses an owner giving it to someone else', async () => {
				await seedRegistration('give_s1', registration(ME, 'give'));
				await assertFails(updateDoc(ref(as(ME), 'give_s1'), { userId: VICTIM }));
			});

			it('refuses creating one in someone else’s name', async () => {
				await assertFails(setDoc(ref(as(STRANGER), 'forged_s1'), registration(VICTIM, 'forged')));
			});

			it('refuses a stranger deleting it', async () => {
				await seedRegistration('del_s1', registration(VICTIM, 'del'));
				await assertFails(deleteDoc(ref(as(STRANGER), 'del_s1')));
			});
		});

		describe('the writes that must keep working', () => {
			it('registers a new device and statement', async () => {
				await assertSucceeds(
					setDoc(ref(as(ME), 'fresh_s1'), registration(ME, 'fresh'), { merge: true }),
				);
			});

			it('re-registers with the same merge when the document is already mine', async () => {
				await seedRegistration('again_s1', registration(ME, 'again'));
				await assertSucceeds(
					setDoc(ref(as(ME), 'again_s1'), { ...registration(ME, 'again'), lastUpdate: T0 + 1 }, { merge: true }),
				);
			});

			it('removes my own registration, and one already gone', async () => {
				await seedRegistration('own-del_s1', registration(ME, 'own-del'));
				await assertSucceeds(deleteDoc(ref(as(ME), 'own-del_s1')));
				await assertSucceeds(deleteDoc(ref(as(ME), 'already-gone_s1')));
			});
		});

		// What happens when B signs in on the browser A used, same token, same
		// statement. The legacy write is refused and stays A's; the client swallows
		// that refusal. B's real registration is the tokens[] write, tested with it.
		describe('shared browser', () => {
			const SHARED_ID = 'shared-token_s1';
			const subId = `${ME}--${STATEMENT}`;

			before(async () => {
				await seedRegistration(SHARED_ID, registration(VICTIM, 'shared-token'));
				await seed(env, async (db) => {
					await setDoc(doc(db, 'statements', STATEMENT), {
						statementId: STATEMENT,
						creatorId: CREATOR,
						creator: { uid: CREATOR, displayName: 'Creator' },
						membership: { access: 'openToAll' },
						topParentId: STATEMENT,
						parents: [],
						parentId: 'top',
					});
					await setDoc(doc(db, 'statementsSubscribe', subId), {
						userId: ME,
						statementId: STATEMENT,
						role: 'member',
						lastUpdate: T0,
					});
				});
			});

			it('still adds the device to my own subscription, which is what delivers', async () => {
				await assertSucceeds(
					updateDoc(doc(as(ME), 'statementsSubscribe', subId), {
						tokens: arrayUnion('shared-token'),
						statementId: STATEMENT,
					}),
				);
			});

			it('refuses taking over the legacy document, and leaves it with its owner', async () => {
				await assertFails(
					setDoc(ref(as(ME), SHARED_ID), registration(ME, 'shared-token'), { merge: true }),
				);
				await assertSucceeds(getDoc(ref(as(VICTIM), SHARED_ID)));
			});

			it('refuses deleting it on unregister', async () => {
				await assertFails(deleteDoc(ref(as(ME), SHARED_ID)));
			});
		});
	});

	describe('statementsSubscribe.tokens', () => {
		const MEMBER_SUB = `${VICTIM}--${STATEMENT}`;
		const ref = (db, id) => doc(db, 'statementsSubscribe', id);
		const sub = (uid, role, extra = {}) => ({
			statementsSubscribeId: `${uid}--${STATEMENT}`,
			userId: uid,
			statementId: STATEMENT,
			role,
			user: { uid, displayName: uid, photoURL: null, isAnonymous: false },
			lastUpdate: T0,
			createdAt: T0,
			...extra,
		});
		const seedSub = (id, data) =>
			seed(env, async (db) => {
				await setDoc(ref(db, id), data);
			});
		const resetMember = (extra = { tokens: ['victim-device'] }) =>
			seedSub(MEMBER_SUB, sub(VICTIM, 'member', extra));

		before(async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'statements', STATEMENT), {
					statementId: STATEMENT,
					creatorId: CREATOR,
					creator: { uid: CREATOR, displayName: 'Creator' },
					membership: { access: 'openToAll' },
					topParentId: STATEMENT,
					parents: [],
					parentId: 'top',
				});
				await setDoc(ref(db, `${ADMIN}--${STATEMENT}`), sub(ADMIN, 'admin', { tokens: ['admin-device'] }));
			});
		});

		describe('an admin or creator changing a member’s tokens', () => {
			for (const [who, uid] of [
				['admin', ADMIN],
				['creator', CREATOR],
			]) {
				it(`refuses the ${who} adding a device`, async () => {
					await resetMember();
					await assertFails(updateDoc(ref(as(uid), MEMBER_SUB), { tokens: arrayUnion('attacker-device') }));
				});

				it(`refuses the ${who} removing the member’s device`, async () => {
					await resetMember();
					await assertFails(updateDoc(ref(as(uid), MEMBER_SUB), { tokens: arrayRemove('victim-device') }));
				});

				it(`refuses the ${who} deleting the field`, async () => {
					await resetMember();
					await assertFails(setDoc(ref(as(uid), MEMBER_SUB), sub(VICTIM, 'member')));
				});

				it(`refuses the ${who} adding tokens to a doc that has none`, async () => {
					await resetMember({});
					await assertFails(updateDoc(ref(as(uid), MEMBER_SUB), { tokens: ['attacker-device'] }));
				});

				it(`refuses the ${who} smuggling tokens in with a role change`, async () => {
					await resetMember();
					await assertFails(
						updateDoc(ref(as(uid), MEMBER_SUB), { role: 'admin', tokens: arrayUnion('attacker-device') }),
					);
				});

				it(`lets the ${who} change the member’s role`, async () => {
					await resetMember();
					await assertSucceeds(
						updateDoc(ref(as(uid), MEMBER_SUB), { role: 'admin', statementId: STATEMENT, lastUpdate: T0 + 1 }),
					);
				});
			}

			it('lets an admin approve a member (updateDoc of role only)', async () => {
				await resetMember();
				await assertSucceeds(updateDoc(ref(as(ADMIN), MEMBER_SUB), { role: 'unsubscribed', lastUpdate: T0 + 2 }));
			});

			it('lets an admin set a role with the merge setRoleToDB uses', async () => {
				await resetMember();
				await assertSucceeds(
					setDoc(ref(as(ADMIN), MEMBER_SUB), { role: 'member', lastUpdate: T0 + 3 }, { merge: true }),
				);
			});

			it('lets an admin rewrite the doc when tokens stay exactly the same', async () => {
				await resetMember();
				await assertSucceeds(
					setDoc(ref(as(ADMIN), MEMBER_SUB), sub(VICTIM, 'member', { tokens: ['victim-device'], lastUpdate: T0 + 4 })),
				);
			});

			it('lets an admin change the role of a member with no tokens field', async () => {
				await resetMember({});
				await assertSucceeds(updateDoc(ref(as(ADMIN), MEMBER_SUB), { role: 'member', lastUpdate: T0 + 5 }));
			});

			it('refuses a stranger changing a member’s tokens', async () => {
				await resetMember();
				await assertFails(updateDoc(ref(as(STRANGER), MEMBER_SUB), { tokens: arrayUnion('attacker-device') }));
			});
		});

		describe('my own tokens', () => {
			it('lets a member add their device, as addTokenToSubscription does', async () => {
				await resetMember();
				await assertSucceeds(
					updateDoc(ref(as(VICTIM), MEMBER_SUB), {
						tokens: arrayUnion('new-device'),
						statementId: STATEMENT,
					}),
				);
			});

			it('lets a member remove their device, as removeTokenFromSubscription does', async () => {
				await resetMember();
				await assertSucceeds(
					updateDoc(ref(as(VICTIM), MEMBER_SUB), {
						tokens: arrayRemove('victim-device'),
						statementId: STATEMENT,
					}),
				);
			});

			it('lets a member add the first token to a doc that has none', async () => {
				await resetMember({});
				await assertSucceeds(updateDoc(ref(as(VICTIM), MEMBER_SUB), { tokens: arrayUnion('first-device') }));
			});

			it('lets an admin change the tokens on their own subscription', async () => {
				await assertSucceeds(
					updateDoc(ref(as(ADMIN), `${ADMIN}--${STATEMENT}`), {
						tokens: arrayUnion('second-admin-device'),
						statementId: STATEMENT,
					}),
				);
			});

			it('lets an admin change tokens on their own old doc that has no userId', async () => {
				const id = `${ADMIN}--legacy-owned`;
				await seed(env, async (db) => {
					await setDoc(doc(db, 'statements', 'legacy-owned'), {
						statementId: 'legacy-owned',
						creatorId: ADMIN,
						creator: { uid: ADMIN, displayName: 'Admin' },
						membership: { access: 'openToAll' },
						topParentId: 'legacy-owned',
						parents: [],
						parentId: 'top',
					});
					await setDoc(ref(db, id), { statementId: 'legacy-owned', role: 'admin', lastUpdate: T0 });
				});
				await assertSucceeds(updateDoc(ref(as(ADMIN), id), { tokens: arrayUnion('old-doc-device') }));
			});

			it('refuses an admin changing tokens on another person’s old doc that has no userId', async () => {
				const id = `${VICTIM}--legacy-owned`;
				await seed(env, async (db) => {
					await setDoc(ref(db, id), { statementId: 'legacy-owned', role: 'member', lastUpdate: T0 });
				});
				// The admin does have rights over this doc, so the refusal below is the tokens check.
				await assertSucceeds(updateDoc(ref(as(ADMIN), id), { lastUpdate: T0 + 1 }));
				await assertFails(updateDoc(ref(as(ADMIN), id), { tokens: arrayUnion('attacker-device') }));
			});
		});

		it('still refuses creating a subscription, with tokens, for someone else', async () => {
			await assertFails(
				setDoc(ref(as(ADMIN), `${STRANGER}--${STATEMENT}`), sub(STRANGER, 'member', { tokens: ['attacker-device'] })),
			);
		});
	});
});
