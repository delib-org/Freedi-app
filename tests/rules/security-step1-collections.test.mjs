import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * Collections any signed-in user could write. Each block pairs the attack with
 * the flow that really uses the collection, so a lock that broke the flow fails
 * here too.
 */
const ME = 'user-me';
const OTHER = 'user-other';
const ANON = 'anon-visitor';

describe('security step 1: collection locks', () => {
	let env;

	before(async () => {
		env = await makeEnv('security-step1-collections');
	});

	after(async () => {
		await env?.cleanup();
	});

	const asMe = () => env.authenticatedContext(ME).firestore();
	const asOther = () => env.authenticatedContext(OTHER).firestore();
	const asAnon = () =>
		env.authenticatedContext(ANON, { firebase: { sign_in_provider: 'anonymous' } }).firestore();

	describe('server-only collections', () => {
		for (const name of ['signatures', 'choseBy', 'massConsensusProcesses', 'resultsTriggers', 'tokens', 'admins']) {
			it(`rejects a client write to ${name}`, async () => {
				await assertFails(setDoc(doc(asMe(), name, 'x'), { userId: ME, user: { uid: ME } }));
			});
		}

		it('keeps the signature counts readable for the Sign live counter', async () => {
			await assertSucceeds(
				getDocs(query(collection(asMe(), 'signatures'), where('documentId', '==', 'doc-1'))),
			);
		});
	});

	for (const name of ['pushNotifications', 'askedToBeNotified']) {
		describe(name, () => {
			const write = (db, id, data, options) => setDoc(doc(db, name, id), data, options ?? {});

			it('lets a user register their own device', async () => {
				await assertSucceeds(write(asMe(), 'tok-mine', { token: 'tok-mine', userId: ME }));
			});

			it('rejects registering a device in someone else’s name', async () => {
				await assertFails(write(asMe(), 'tok-forged', { token: 'tok-forged', userId: OTHER }));
			});

			// askedToBeNotified has no takeover: see push-token-registrations.test.mjs
			if (name === 'pushNotifications') {
				it('lets the next person on a shared device take the token over', async () => {
					await seed(env, async (db) => {
						await write(db, 'tok-shared', { token: 'tok-shared', userId: OTHER });
					});
					await assertSucceeds(
						write(asMe(), 'tok-shared', { token: 'tok-shared', userId: ME }, { merge: true }),
					);
				});
			}

			it('rejects changing a document while leaving it in someone else’s name', async () => {
				await seed(env, async (db) => {
					await write(db, 'tok-theirs', { token: 'tok-theirs', userId: OTHER });
				});
				await assertFails(updateDoc(doc(asMe(), name, 'tok-theirs'), { lastUpdate: 1 }));
			});

			it('lets a user update and remove their own', async () => {
				await seed(env, async (db) => {
					await write(db, 'tok-own', { token: 'tok-own', userId: ME });
				});
				await assertSucceeds(updateDoc(doc(asMe(), name, 'tok-own'), { quietHours: { enabled: true } }));
				await assertSucceeds(deleteDoc(doc(asMe(), name, 'tok-own')));
			});

			it('rejects deleting someone else’s, and allows deleting one already gone', async () => {
				await seed(env, async (db) => {
					await write(db, 'tok-del', { token: 'tok-del', userId: OTHER });
				});
				await assertFails(deleteDoc(doc(asMe(), name, 'tok-del')));
				await assertSucceeds(deleteDoc(doc(asMe(), name, 'tok-never-existed')));
			});
		});
	}

	for (const name of ['usersData', 'usersSettings']) {
		describe(name, () => {
			it('lets a user create and update their own', async () => {
				await assertSucceeds(setDoc(doc(asMe(), name, 'mine'), { userId: ME, answer: 'a' }));
				await assertSucceeds(setDoc(doc(asMe(), name, 'mine'), { userId: ME, answer: 'b' }));
			});

			it('rejects overwriting another user’s document by stamping your own uid', async () => {
				await seed(env, async (db) => {
					await setDoc(doc(db, name, 'theirs'), { userId: OTHER, answer: 'x' });
				});
				await assertFails(setDoc(doc(asMe(), name, 'theirs'), { userId: ME, answer: 'hijack' }));
			});

			it('rejects writing a new document in someone else’s name', async () => {
				await assertFails(setDoc(doc(asMe(), name, 'new-forged'), { userId: OTHER }));
			});

			it('lets an anonymous user store their own answer', async () => {
				await assertSucceeds(setDoc(doc(asAnon(), name, `q--${ANON}`), { userId: ANON, answer: 'a' }));
			});
		});
	}

	describe('odysseyJourneys', () => {
		const GAME = 'default';
		const journey = (uid) => ({ journeyId: `${uid}--${GAME}`, gameId: GAME, userId: uid });

		it('lets a player save their own journey, creating then updating', async () => {
			const id = `${ME}--${GAME}`;
			await assertSucceeds(setDoc(doc(asMe(), 'odysseyJourneys', id), journey(ME), { merge: true }));
			await assertSucceeds(
				setDoc(doc(asMe(), 'odysseyJourneys', id), { ...journey(ME), lastUpdate: 2 }, { merge: true }),
			);
		});

		it('rejects a journey under another player’s id', async () => {
			await assertFails(setDoc(doc(asMe(), 'odysseyJourneys', `${OTHER}--fresh`), { ...journey(ME), gameId: 'fresh' }));
		});

		it('rejects overwriting another player’s journey', async () => {
			const id = `${OTHER}--${GAME}`;
			await seed(env, async (db) => {
				await setDoc(doc(db, 'odysseyJourneys', id), journey(OTHER));
			});
			await assertFails(setDoc(doc(asMe(), 'odysseyJourneys', id), journey(ME)));
		});
	});

	describe('typingStatus', () => {
		const P = 'paragraph-1';

		it('lets a user announce their own typing and clear it', async () => {
			await assertSucceeds(setDoc(doc(asMe(), 'typingStatus', `${P}--${ME}`), { userId: ME, paragraphId: P }));
			await assertSucceeds(deleteDoc(doc(asMe(), 'typingStatus', `${P}--${ME}`)));
		});

		it('rejects a typing document under another user’s id', async () => {
			await assertFails(setDoc(doc(asMe(), 'typingStatus', `${P}--${OTHER}`), { userId: ME, paragraphId: P }));
		});

		it('rejects overwriting another user’s typing document', async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'typingStatus', `${P}--${OTHER}`), { userId: OTHER, paragraphId: P });
			});
			await assertFails(setDoc(doc(asMe(), 'typingStatus', `${P}--${OTHER}`), { userId: ME, paragraphId: P }));
		});
	});

	describe('researchConsent', () => {
		const TOP = 'top-1';
		const consent = (userId, consented = true) => ({
			consentId: `${userId}_${TOP}`,
			userId,
			topParentId: TOP,
			consented,
		});
		const write = (db, userId, consented) =>
			setDoc(doc(db, 'researchConsent', `${userId}_${TOP}`), consent(userId, consented));

		it('lets a signed-in user record their own consent and change it', async () => {
			await assertSucceeds(write(asMe(), ME, true));
			await assertSucceeds(write(asMe(), ME, false));
		});

		it('rejects giving consent for another signed-in account', async () => {
			await assertFails(write(asMe(), OTHER, true));
		});

		it('rejects withdrawing another signed-in account’s consent', async () => {
			await seed(env, async (db) => {
				await write(db, 'real-account', true);
			});
			await assertFails(write(asMe(), 'real-account', false));
		});

		it('keeps the MC and Sign flow, where the id is a browser-minted anon_ id', async () => {
			const anonId = 'anon_1700000000000_abc123def';
			await assertSucceeds(write(asAnon(), anonId, true));
			await assertSucceeds(write(asAnon(), anonId, false));
		});

		it('lets the owner read theirs', async () => {
			await assertSucceeds(getDocs(query(collection(asOther(), 'researchConsent'), where('topParentId', '==', TOP))));
		});
	});
});
