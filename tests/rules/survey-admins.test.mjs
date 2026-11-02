import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { makeEnv, seed, statementDoc } from './helpers.mjs';

/**
 * `surveys`, `surveyAdmins` and `surveyAdminInvitations` have no match block in
 * firestore.rules, so they fall to default deny. The recalculateIndices callable
 * reads the first two to decide who may rescore a survey's questions, which makes
 * this silence load-bearing: a client who could write either could grant itself
 * the right. Only the MC server (Admin SDK) writes them.
 */
describe('survey collections are closed to clients', () => {
	let env;

	const ATTACKER = 'user-attacker';
	const OWNER = 'user-owner';
	const SURVEY = 'survey-1';
	const NEW_SURVEY = 'survey-new';
	const VICTIM_QUESTION = 'question-victim';
	const T0 = 1_800_000_000_000;

	const adminId = (surveyId, uid) => `${surveyId}--${uid}`;

	const editorRecord = (surveyId, uid) => ({
		surveyAdminId: adminId(surveyId, uid),
		surveyId,
		userId: uid,
		email: 'attacker@example.com',
		displayName: 'Attacker',
		role: 'editor',
		addedBy: uid,
		addedAt: T0,
		lastUpdate: T0,
	});

	const surveyRecord = (surveyId, creatorId) => ({
		surveyId,
		title: 'A survey',
		creatorId,
		questionIds: [VICTIM_QUESTION],
		createdAt: T0,
		lastUpdate: T0,
	});

	const asAttacker = () => env.authenticatedContext(ATTACKER).firestore();

	before(async () => {
		env = await makeEnv('survey-admins');
		await seed(env, async (db) => {
			await setDoc(doc(db, 'surveys', SURVEY), surveyRecord(SURVEY, OWNER));
			await setDoc(doc(db, 'surveys', 'survey-of-attacker'), surveyRecord('survey-of-attacker', ATTACKER));
			await setDoc(doc(db, 'surveyAdmins', adminId(SURVEY, ATTACKER)), {
				...editorRecord(SURVEY, ATTACKER),
				role: 'viewer',
			});
			await setDoc(doc(db, 'surveyAdminInvitations', 'invitation-1'), {
				invitationId: 'invitation-1',
				surveyId: SURVEY,
				invitedEmail: 'attacker@example.com',
				status: 'pending',
			});
			await setDoc(
				doc(db, 'statements', VICTIM_QUESTION),
				statementDoc({
					statementId: VICTIM_QUESTION,
					uid: OWNER,
					overrides: { statementType: 'question', parentId: 'top', topParentId: VICTIM_QUESTION },
				}),
			);
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	// Without these a broken harness would look like a closed door: every assertFails
	// below would pass on a connection or config failure just as well.
	describe('the harness can tell open from closed', () => {
		it('lets the same client read a statement', async () => {
			await assertSucceeds(getDoc(doc(asAttacker(), 'statements', VICTIM_QUESTION)));
		});

		it('finds the seeded records when rules are off', async () => {
			await env.withSecurityRulesDisabled(async (context) => {
				const record = await getDoc(doc(context.firestore(), 'surveyAdmins', adminId(SURVEY, ATTACKER)));
				assert.equal(record.data()?.role, 'viewer');
			});
		});
	});

	describe('surveyAdmins', () => {
		it('refuses a signed-in user granting themselves editor', async () => {
			await assertFails(
				setDoc(doc(asAttacker(), 'surveyAdmins', adminId(NEW_SURVEY, ATTACKER)), editorRecord(NEW_SURVEY, ATTACKER)),
			);
		});

		it('refuses a viewer raising their own role to editor', async () => {
			await assertFails(
				updateDoc(doc(asAttacker(), 'surveyAdmins', adminId(SURVEY, ATTACKER)), { role: 'editor' }),
			);
		});

		it('refuses overwriting a roster record', async () => {
			await assertFails(
				setDoc(doc(asAttacker(), 'surveyAdmins', adminId(SURVEY, ATTACKER)), editorRecord(SURVEY, ATTACKER)),
			);
		});

		it('refuses deleting a roster record', async () => {
			await assertFails(deleteDoc(doc(asAttacker(), 'surveyAdmins', adminId(SURVEY, ATTACKER))));
		});

		it('refuses reading even your own record', async () => {
			await assertFails(getDoc(doc(asAttacker(), 'surveyAdmins', adminId(SURVEY, ATTACKER))));
		});

		it('refuses a signed-out write', async () => {
			const db = env.unauthenticatedContext().firestore();

			await assertFails(
				setDoc(doc(db, 'surveyAdmins', adminId(NEW_SURVEY, ATTACKER)), editorRecord(NEW_SURVEY, ATTACKER)),
			);
		});
	});

	describe('surveys', () => {
		it('refuses creating a survey that names somebody else\'s question', async () => {
			await assertFails(setDoc(doc(asAttacker(), 'surveys', NEW_SURVEY), surveyRecord(NEW_SURVEY, ATTACKER)));
		});

		it('refuses taking over a survey', async () => {
			await assertFails(updateDoc(doc(asAttacker(), 'surveys', SURVEY), { creatorId: ATTACKER }));
		});

		it('refuses editing the question list of a survey you own, directly', async () => {
			await assertFails(
				updateDoc(doc(asAttacker(), 'surveys', 'survey-of-attacker'), { questionIds: ['another'] }),
			);
		});

		it('refuses deleting a survey', async () => {
			await assertFails(deleteDoc(doc(asAttacker(), 'surveys', SURVEY)));
		});

		it('refuses reading a survey', async () => {
			await assertFails(getDoc(doc(asAttacker(), 'surveys', SURVEY)));
		});
	});

	describe('surveyAdminInvitations', () => {
		it('refuses accepting an invitation directly', async () => {
			await assertFails(
				updateDoc(doc(asAttacker(), 'surveyAdminInvitations', 'invitation-1'), { status: 'accepted' }),
			);
		});

		it('refuses minting an invitation', async () => {
			await assertFails(
				setDoc(doc(asAttacker(), 'surveyAdminInvitations', 'invitation-2'), {
					invitationId: 'invitation-2',
					surveyId: SURVEY,
					invitedEmail: 'attacker@example.com',
					status: 'pending',
				}),
			);
		});
	});
});
