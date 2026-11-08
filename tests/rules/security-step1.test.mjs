import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
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
import { evaluationDoc, makeEnv, seed, statementDoc } from './helpers.mjs';

/**
 * Step 1 of the rules hardening: identity and range, role self-grant, and the
 * evaluate-someone-else's-option flow that all of it must leave alone.
 * The collection locks are in security-step1-collections.test.mjs.
 */
const ME = 'user-me';
const OTHER = 'user-other';
const ANON = 'anon-visitor';
const ANON_TOKEN = { firebase: { sign_in_provider: 'anonymous' } };
const PUBLIC_QUESTION = 'public-question';

function subscriptionDoc({ statementId, userId, role }) {
	return { statementId, userId, role, lastUpdate: 1_700_000_000_000 };
}

describe('security step 1: identity', () => {
	let env;

	before(async () => {
		env = await makeEnv('security-step1');
		await seed(env, async (db) => {
			await setDoc(
				doc(db, 'statements', PUBLIC_QUESTION),
				statementDoc({
					statementId: PUBLIC_QUESTION,
					uid: OTHER,
					overrides: { membership: { access: 'public' } },
				}),
			);
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	const asMe = () => env.authenticatedContext(ME).firestore();
	const asAnon = () => env.authenticatedContext(ANON, ANON_TOKEN).firestore();

	describe('statementsSubscribe role self-grant', () => {
		const subId = (uid) => `${uid}--${PUBLIC_QUESTION}`;
		const write = (db, uid, role) =>
			setDoc(
				doc(db, 'statementsSubscribe', subId(uid)),
				subscriptionDoc({ statementId: PUBLIC_QUESTION, userId: uid, role }),
			);

		it('rejects the literal "creator" role, which the server counts as admin', async () => {
			await assertFails(write(asAnon(), ANON, 'creator'));
		});

		it('rejects a role nobody has heard of', async () => {
			await assertFails(write(asMe(), ME, 'superuser'));
		});

		it('still rejects admin and statement-creator', async () => {
			await assertFails(write(asMe(), ME, 'admin'));
			await assertFails(write(asMe(), ME, 'statement-creator'));
		});

		it('lets a participant join as a member', async () => {
			await assertSucceeds(write(asAnon(), ANON, 'member'));
		});

		it('lets the real creator hold an admin subscription', async () => {
			const db = env.authenticatedContext(OTHER).firestore();
			await assertSucceeds(write(db, OTHER, 'admin'));
		});

		it('rejects promoting yourself to "creator" by update', async () => {
			await seed(env, async (db) => {
				await write(db, ME, 'member');
			});
			await assertFails(
				updateDoc(doc(asMe(), 'statementsSubscribe', subId(ME)), { role: 'creator' }),
			);
		});
	});

	describe('evaluations', () => {
		const OPTION = 'option-by-someone-else';
		const write = (db, id, data) => setDoc(doc(db, 'evaluations', id), data);
		const mine = (statementId, evaluation, overrides = {}) =>
			evaluationDoc({
				evaluatorId: ME,
				statementId,
				evaluation,
				overrides: { evaluator: { uid: ME, displayName: 'Me' }, ...overrides },
			});

		it('lets an anonymous user evaluate an option someone else wrote', async () => {
			await seed(env, async (db) => {
				await setDoc(
					doc(db, 'statements', OPTION),
					statementDoc({ statementId: OPTION, uid: OTHER, overrides: { parentId: PUBLIC_QUESTION } }),
				);
			});
			await assertSucceeds(
				write(
					asAnon(),
					`${ANON}--${OPTION}`,
					evaluationDoc({
						evaluatorId: ANON,
						statementId: OPTION,
						evaluation: 1,
						overrides: { evaluator: { uid: ANON, displayName: 'Guest', isAnonymous: true } },
					}),
				),
			);
		});

		for (const value of [1000, 2, 1.01, -1.01, -1000]) {
			it(`rejects the out-of-range value ${value}`, async () => {
				await assertFails(write(asMe(), `${ME}--range-${value}`, mine(`range-${value}`, value)));
			});
		}

		for (const value of [-1, -0.5, 0, 0.25, 0.5, 0.75, 1]) {
			it(`accepts the app-scale value ${value}`, async () => {
				await assertSucceeds(write(asMe(), `${ME}--scale-${value}`, mine(`scale-${value}`, value)));
			});
		}

		it('rejects raising an existing vote out of range', async () => {
			await assertSucceeds(write(asMe(), `${ME}--raise`, mine('raise', 1)));
			await assertFails(updateDoc(doc(asMe(), 'evaluations', `${ME}--raise`), { evaluation: 500 }));
		});

		it('rejects a forged evaluator, which is the field the trigger counts by', async () => {
			await assertFails(
				write(
					asMe(),
					`${ME}--forged`,
					mine('forged', 1, { evaluator: { uid: OTHER, displayName: 'Other' } }),
				),
			);
		});

		it('rejects a document id that names someone else', async () => {
			await assertFails(
				write(asMe(), `${OTHER}--stolen-slot`, mine('stolen-slot', 1, { evaluationId: `${OTHER}--stolen-slot` })),
			);
		});

		it('rejects a document id for a different option than the one voted on', async () => {
			await assertFails(
				write(asMe(), `${ME}--option-a`, mine('option-b', 1, { evaluationId: `${ME}--option-a` })),
			);
		});

		it('rejects an evaluationId field that disagrees with the document id', async () => {
			await assertFails(write(asMe(), `${ME}--field`, mine('field', 1, { evaluationId: 'something-else' })));
		});

		it('still accepts a vote with no evaluator map, as Flow writes it', async () => {
			await assertSucceeds(
				write(asMe(), `${ME}--flow`, evaluationDoc({ evaluatorId: ME, statementId: 'flow', evaluation: 0.5 })),
			);
		});
	});

	describe('statements authorship and counters', () => {
		const STATEMENT = 'statement-under-admin';
		const ADMIN = 'statement-admin';

		before(async () => {
			await seed(env, async (db) => {
				await setDoc(
					doc(db, 'statements', STATEMENT),
					statementDoc({ statementId: STATEMENT, uid: OTHER }),
				);
				await setDoc(
					doc(db, 'statementsSubscribe', `${ADMIN}--${STATEMENT}`),
					subscriptionDoc({ statementId: STATEMENT, userId: ADMIN, role: 'admin' }),
				);
			});
		});

		const asAdmin = () => env.authenticatedContext(ADMIN).firestore();

		it('rejects an admin taking over authorship', async () => {
			await assertFails(updateDoc(doc(asAdmin(), 'statements', STATEMENT), { creatorId: ADMIN }));
		});

		it('still lets an admin edit the statement', async () => {
			await assertSucceeds(updateDoc(doc(asAdmin(), 'statements', STATEMENT), { statement: 'edited by admin' }));
		});

		it('rejects a participant setting consensus', async () => {
			await assertFails(updateDoc(doc(asMe(), 'statements', STATEMENT), { consensus: 99 }));
		});

		it('rejects a participant setting evaluation counters', async () => {
			await assertFails(
				updateDoc(doc(asMe(), 'statements', STATEMENT), { evaluation: { sumEvaluations: 999 } }),
			);
		});

		it('rejects a participant changing creatorId', async () => {
			await assertFails(updateDoc(doc(asMe(), 'statements', STATEMENT), { creatorId: ME }));
		});
	});

	describe('usersV2', () => {
		const SYS_ADMIN = 'sys-admin';

		before(async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'usersV2', OTHER), { uid: OTHER, email: 'other@example.com' });
				await setDoc(doc(db, 'usersV2', ME), { uid: ME, email: 'me@example.com' });
				await setDoc(doc(db, 'usersV2', SYS_ADMIN), { uid: SYS_ADMIN, systemAdmin: true });
			});
		});

		const asSysAdmin = () => env.authenticatedContext(SYS_ADMIN).firestore();

		it('rejects reading another user', async () => {
			await assertFails(getDoc(doc(asMe(), 'usersV2', OTHER)));
			await assertFails(getDoc(doc(asAnon(), 'usersV2', OTHER)));
		});

		it('lets a user read their own document, existing or not', async () => {
			await assertSucceeds(getDoc(doc(asMe(), 'usersV2', ME)));
			await assertSucceeds(getDoc(doc(asAnon(), 'usersV2', ANON)));
		});

		it('rejects listing users', async () => {
			await assertFails(getDocs(collection(asMe(), 'usersV2')));
		});

		it('lets a system admin read and list', async () => {
			await assertSucceeds(getDoc(doc(asSysAdmin(), 'usersV2', OTHER)));
			await assertSucceeds(getDocs(collection(asSysAdmin(), 'usersV2')));
		});

		it('still rejects self-promotion to system admin', async () => {
			await assertFails(setDoc(doc(asMe(), 'usersV2', ME), { uid: ME, systemAdmin: true }));
		});

		it('still lets a user update their own profile', async () => {
			await assertSucceeds(setDoc(doc(asMe(), 'usersV2', ME), { displayName: 'Me' }, { merge: true }));
		});
	});

	describe('delegate invitations stay with the question admin', () => {
		const QUESTION = 'question-with-delegates';
		const QUESTION_ADMIN = 'question-admin';

		before(async () => {
			await seed(env, async (db) => {
				await setDoc(
					doc(db, 'statements', QUESTION),
					statementDoc({ statementId: QUESTION, uid: OTHER }),
				);
				await setDoc(
					doc(db, 'statementsSubscribe', `${QUESTION_ADMIN}--${QUESTION}`),
					subscriptionDoc({ statementId: QUESTION, userId: QUESTION_ADMIN, role: 'admin' }),
				);
				await setDoc(doc(db, 'joinDelegateInvitations', 'invite-1'), {
					questionId: QUESTION,
					token: 'raw-secret-token',
					invitedEmail: 'd@example.com',
					status: 'pending',
				});
			});
		});

		const forQuestion = (db) =>
			query(collection(db, 'joinDelegateInvitations'), where('questionId', '==', QUESTION));

		it('rejects a stranger listing them, with or without a filter', async () => {
			await assertFails(getDocs(forQuestion(asMe())));
			await assertFails(getDocs(collection(asAnon(), 'joinDelegateInvitations')));
		});

		it('lets the question admin list them', async () => {
			const db = env.authenticatedContext(QUESTION_ADMIN).firestore();
			await assertSucceeds(getDocs(forQuestion(db)));
		});

		it('lets the question creator list them', async () => {
			const db = env.authenticatedContext(OTHER).firestore();
			await assertSucceeds(getDocs(forQuestion(db)));
		});
	});

	describe('organization invitations stay with org admins', () => {
		const ORG = 'org-1';
		const ORG_ADMIN = 'org-admin';
		const ORG_VIEWER = 'org-viewer';
		const SYS_ADMIN = 'sys-admin-org';

		before(async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'organizationMembers', `${ORG}--${ORG_ADMIN}`), {
					organizationId: ORG,
					userId: ORG_ADMIN,
					role: 'admin',
				});
				await setDoc(doc(db, 'organizationMembers', `${ORG}--${ORG_VIEWER}`), {
					organizationId: ORG,
					userId: ORG_VIEWER,
					role: 'viewer',
				});
				await setDoc(doc(db, 'usersV2', SYS_ADMIN), { uid: SYS_ADMIN, systemAdmin: true });
				await setDoc(doc(db, 'organizationInvitations', 'org-invite-1'), {
					organizationId: ORG,
					invitedEmail: 'someone@example.com',
					tokenHash: 'abc',
					status: 'pending',
				});
			});
		});

		const forOrg = (db) =>
			query(collection(db, 'organizationInvitations'), where('organizationId', '==', ORG));

		it('rejects a stranger and an org viewer', async () => {
			await assertFails(getDocs(forOrg(asMe())));
			await assertFails(getDocs(forOrg(env.authenticatedContext(ORG_VIEWER).firestore())));
		});

		it('lets an org admin and a system admin list them', async () => {
			await assertSucceeds(getDocs(forOrg(env.authenticatedContext(ORG_ADMIN).firestore())));
			await assertSucceeds(getDocs(forOrg(env.authenticatedContext(SYS_ADMIN).firestore())));
		});
	});

	describe('PIN invitations are never rewritten', () => {
		const INVITE = { statementId: 'q', pathname: '/statement/q', lastUpdate: 1_700_000_000_000, number: 7 };

		it('lets a signed-in user create one and look it up by number', async () => {
			await assertSucceeds(setDoc(doc(asMe(), 'invitations', 'pin-new'), INVITE));
			await assertSucceeds(
				getDocs(query(collection(asMe(), 'invitations'), where('number', '==', 7))),
			);
		});

		it('rejects rewriting or deleting one', async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'invitations', 'pin-existing'), INVITE);
			});
			await assertFails(updateDoc(doc(asMe(), 'invitations', 'pin-existing'), { pathname: '/statement/evil' }));
			await assertFails(deleteDoc(doc(asMe(), 'invitations', 'pin-existing')));
		});

		it('rejects a pathname that leaves the app', async () => {
			await assertFails(setDoc(doc(asMe(), 'invitations', 'pin-evil'), { ...INVITE, pathname: '//evil.example.com' }));
		});
	});
});
