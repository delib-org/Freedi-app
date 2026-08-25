import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { makeEnv, seed, statementDoc } from './helpers.mjs';

/**
 * WizCol Studio — consultant organizations.
 *
 * Three things are under test:
 *  1. the org collections are read-scoped (member / org admin / sysadmin) and
 *     never client-writable — all writes go through the organization callables;
 *  2. `organizationId` on /statements cannot be set or changed by a client, so
 *     a statement cannot be attached to (or detached from) a tenant from the
 *     browser — only fn_createOrgStatement (Admin SDK) does that;
 *  3. the org-admin model still works through ordinary subscriptions: a user
 *     holding an admin subscription on the TOP question can change a child
 *     question's run-state (`statementSettings.questionStatus`) — that is the
 *     materialized authority the Studio facilitator panel relies on.
 */
describe('organizations', () => {
	let env;

	before(async () => {
		env = await makeEnv('organizations');
	});

	after(async () => {
		await env?.cleanup();
	});

	const SYSADMIN = 'sysadmin-1';
	const OWNER = 'consultant-owner';
	const MEMBER = 'consultant-admin';
	const STRANGER = 'stranger';
	const ORG = 'org-1';
	const NOW = 1_700_000_000_000;

	const orgDoc = {
		organizationId: ORG,
		name: 'Acme Consulting',
		status: 'active',
		createdBy: SYSADMIN,
		createdAt: NOW,
		lastUpdate: NOW,
	};

	function memberDoc(uid, role) {
		return {
			memberId: `${ORG}--${uid}`,
			organizationId: ORG,
			userId: uid,
			email: `${uid}@example.com`,
			displayName: uid,
			role,
			addedAt: NOW,
			addedBy: SYSADMIN,
			lastUpdate: NOW,
		};
	}

	before(async () => {
		await seed(env, async (db) => {
			await setDoc(doc(db, 'usersV2', SYSADMIN), { uid: SYSADMIN, systemAdmin: true });
			await setDoc(doc(db, 'organizations', ORG), orgDoc);
			await setDoc(doc(db, 'organizationMembers', `${ORG}--${OWNER}`), memberDoc(OWNER, 'owner'));
			await setDoc(doc(db, 'organizationMembers', `${ORG}--${MEMBER}`), memberDoc(MEMBER, 'admin'));
		});
	});

	describe('/organizations', () => {
		it('rejects a non-member reading an organization', async () => {
			const db = env.authenticatedContext(STRANGER).firestore();
			await assertFails(getDoc(doc(db, 'organizations', ORG)));
		});

		it('rejects an unauthenticated read', async () => {
			const db = env.unauthenticatedContext().firestore();
			await assertFails(getDoc(doc(db, 'organizations', ORG)));
		});

		it('allows a member to read their organization', async () => {
			const db = env.authenticatedContext(MEMBER).firestore();
			await assertSucceeds(getDoc(doc(db, 'organizations', ORG)));
		});

		it('allows a system admin to list organizations', async () => {
			const db = env.authenticatedContext(SYSADMIN).firestore();
			await assertSucceeds(getDocs(collection(db, 'organizations')));
		});

		it('rejects a member listing organizations', async () => {
			const db = env.authenticatedContext(MEMBER).firestore();
			await assertFails(getDocs(collection(db, 'organizations')));
		});

		it('rejects a client write, even from the owner', async () => {
			const db = env.authenticatedContext(OWNER).firestore();
			await assertFails(updateDoc(doc(db, 'organizations', ORG), { name: 'Renamed' }));
			await assertFails(
				setDoc(doc(db, 'organizations', 'org-2'), { ...orgDoc, organizationId: 'org-2' }),
			);
		});
	});

	describe('/organizationMembers', () => {
		it('allows a member to read a fellow member record', async () => {
			const db = env.authenticatedContext(MEMBER).firestore();
			await assertSucceeds(getDoc(doc(db, 'organizationMembers', `${ORG}--${OWNER}`)));
		});

		it('rejects a non-member reading a member record', async () => {
			const db = env.authenticatedContext(STRANGER).firestore();
			await assertFails(getDoc(doc(db, 'organizationMembers', `${ORG}--${OWNER}`)));
		});

		it('rejects a client self-enrolment', async () => {
			const db = env.authenticatedContext(STRANGER).firestore();
			await assertFails(
				setDoc(doc(db, 'organizationMembers', `${ORG}--${STRANGER}`), memberDoc(STRANGER, 'owner')),
			);
		});
	});

	describe('/organizationInvitations', () => {
		const invitation = {
			invitationId: 'inv-1',
			organizationId: ORG,
			organizationName: 'Acme Consulting',
			invitedEmail: 'new@example.com',
			invitedBy: OWNER,
			invitedByDisplayName: OWNER,
			role: 'admin',
			tokenHash: 'deadbeef',
			status: 'pending',
			createdAt: NOW,
			expiresAt: NOW + 7 * 24 * 60 * 60 * 1000,
		};

		before(async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'organizationInvitations', 'inv-1'), invitation);
			});
		});

		it('allows an org admin to read an invitation', async () => {
			const db = env.authenticatedContext(MEMBER).firestore();
			await assertSucceeds(getDoc(doc(db, 'organizationInvitations', 'inv-1')));
		});

		it('rejects a non-member reading an invitation', async () => {
			const db = env.authenticatedContext(STRANGER).firestore();
			await assertFails(getDoc(doc(db, 'organizationInvitations', 'inv-1')));
		});

		it('rejects a client marking an invitation accepted', async () => {
			const db = env.authenticatedContext(STRANGER).firestore();
			await assertFails(
				updateDoc(doc(db, 'organizationInvitations', 'inv-1'), {
					status: 'accepted',
					acceptedByUserId: STRANGER,
				}),
			);
		});
	});

	describe('/statements organizationId pin', () => {
		it('rejects a client create that sets organizationId', async () => {
			const db = env.authenticatedContext(OWNER).firestore();
			await assertFails(
				setDoc(
					doc(db, 'statements', 'org-create'),
					statementDoc({
						statementId: 'org-create',
						uid: OWNER,
						overrides: { parentId: 'top', topParentId: 'org-create', organizationId: ORG },
					}),
				),
			);
		});

		it('still allows the same create without organizationId', async () => {
			const db = env.authenticatedContext(OWNER).firestore();
			await assertSucceeds(
				setDoc(
					doc(db, 'statements', 'plain-create'),
					statementDoc({
						statementId: 'plain-create',
						uid: OWNER,
						overrides: { parentId: 'top', topParentId: 'plain-create' },
					}),
				),
			);
		});

		it('rejects a creator changing organizationId on their own statement', async () => {
			await seed(env, async (db) => {
				await setDoc(
					doc(db, 'statements', 'org-owned'),
					statementDoc({
						statementId: 'org-owned',
						uid: OWNER,
						overrides: { parentId: 'top', topParentId: 'org-owned', organizationId: ORG },
					}),
				);
			});

			const db = env.authenticatedContext(OWNER).firestore();
			await assertFails(
				updateDoc(doc(db, 'statements', 'org-owned'), { organizationId: 'org-2' }),
			);
		});

		it('rejects a creator detaching organizationId (setting it to null)', async () => {
			const db = env.authenticatedContext(OWNER).firestore();
			await assertFails(
				updateDoc(doc(db, 'statements', 'org-owned'), { organizationId: null }),
			);
		});

		it('allows a creator editing an org statement while organizationId is unchanged', async () => {
			const db = env.authenticatedContext(OWNER).firestore();
			await assertSucceeds(
				updateDoc(doc(db, 'statements', 'org-owned'), {
					statement: 'renamed top question',
					lastUpdate: NOW + 1,
				}),
			);
		});
	});

	describe('/statements run-state via top-parent admin subscription', () => {
		const TOP = 'top-question';
		const CHILD = 'child-question';

		before(async () => {
			await seed(env, async (db) => {
				await setDoc(
					doc(db, 'statements', TOP),
					statementDoc({
						statementId: TOP,
						uid: SYSADMIN,
						overrides: {
							parentId: 'top',
							topParentId: TOP,
							parents: [],
							statementType: 'question',
							organizationId: ORG,
						},
					}),
				);
				await setDoc(
					doc(db, 'statements', CHILD),
					statementDoc({
						statementId: CHILD,
						uid: SYSADMIN,
						overrides: {
							parentId: TOP,
							topParentId: TOP,
							parents: [TOP],
							statementType: 'question',
							statementSettings: { hasChildren: true },
						},
					}),
				);
				// The materialized org-admin authority: an admin subscription on the TOP question only.
				await setDoc(doc(db, 'statementsSubscribe', `${MEMBER}--${TOP}`), {
					statementsSubscribeId: `${MEMBER}--${TOP}`,
					statementId: TOP,
					userId: MEMBER,
					role: 'admin',
					organizationId: ORG,
					createdAt: NOW,
					lastUpdate: NOW,
				});
			});
		});

		it('allows the top-parent admin to freeze a child question', async () => {
			const db = env.authenticatedContext(MEMBER).firestore();
			await assertSucceeds(
				updateDoc(doc(db, 'statements', CHILD), {
					'statementSettings.questionStatus': 'frozen',
					lastUpdate: NOW + 1,
				}),
			);
		});

		it('rejects a stranger freezing the same child question', async () => {
			const db = env.authenticatedContext(STRANGER).firestore();
			await assertFails(
				updateDoc(doc(db, 'statements', CHILD), {
					'statementSettings.questionStatus': 'closed',
					lastUpdate: NOW + 2,
				}),
			);
		});
	});

	describe('/questionProgress', () => {
		const TOP = 'top-question';
		const CHILD = 'child-question';
		const progress = {
			statementId: CHILD,
			topParentId: TOP,
			organizationId: ORG,
			entered: 3,
			suggested: 1,
			evaluated: 2,
			options: 4,
			evaluations: 9,
			lastActivity: NOW,
			lastUpdate: NOW,
		};

		before(async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'questionProgress', CHILD), progress);
			});
		});

		it('allows the top-parent admin to read progress', async () => {
			const db = env.authenticatedContext(MEMBER).firestore();
			await assertSucceeds(getDoc(doc(db, 'questionProgress', CHILD)));
		});

		it('allows an org member without a subscription to read progress', async () => {
			const db = env.authenticatedContext(OWNER).firestore();
			await assertSucceeds(getDoc(doc(db, 'questionProgress', CHILD)));
		});

		it('rejects a stranger reading progress', async () => {
			const db = env.authenticatedContext(STRANGER).firestore();
			await assertFails(getDoc(doc(db, 'questionProgress', CHILD)));
		});

		it('rejects a client write, even from the top-parent admin', async () => {
			const db = env.authenticatedContext(MEMBER).firestore();
			await assertFails(updateDoc(doc(db, 'questionProgress', CHILD), { entered: 999 }));
			await assertFails(
				setDoc(doc(db, 'questionProgress', 'forged'), { ...progress, statementId: 'forged' }),
			);
		});
	});

	describe('/questionParticipation', () => {
		it('is neither readable nor writable by clients', async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'questionParticipation', `child-question--${MEMBER}`), {
					statementId: 'child-question',
					userId: MEMBER,
					entered: true,
				});
			});

			const db = env.authenticatedContext(MEMBER).firestore();
			await assertFails(getDoc(doc(db, 'questionParticipation', `child-question--${MEMBER}`)));
			await assertFails(
				setDoc(doc(db, 'questionParticipation', `child-question--${STRANGER}`), {
					statementId: 'child-question',
					userId: STRANGER,
					suggested: true,
				}),
			);
		});
	});
});
