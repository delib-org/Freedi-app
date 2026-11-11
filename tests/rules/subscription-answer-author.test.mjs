import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { makeEnv, seed } from './helpers.mjs';

/**
 * Answer notification choices (Trello 6sHeWQgD).
 *  - The legacy modal and "better wording" paths write the author's admin
 *    subscription to an answer they just created; this passes through
 *    isCreator() (statement.creatorId == caller), so the answer must exist.
 *  - Choices and the prompt marker are plain field updates on the person's own
 *    question subscription, with role unchanged.
 */
describe('answer author subscription and notification choices', () => {
	let env;
	const ME = 'u-me';
	const OTHER = 'u-other'; // creator of the question (a host)
	const STRANGER = 'u-stranger';
	const Q = 'q1';
	const ANSWER = 'a1';
	const T0 = 1_800_000_000_000;

	const statement = (id, type, creatorId, parentId) => ({
		statementId: id,
		statement: id,
		statementType: type,
		parentId,
		topParentId: Q,
		parents: parentId === 'top' ? [] : [parentId],
		creatorId,
		creator: { uid: creatorId, displayName: 'X' },
		membership: { access: 'openToAll' },
		createdAt: T0,
		lastUpdate: T0,
		consensus: 0,
	});
	const sub = (uid, statementId, role, extra = {}) => ({
		statementsSubscribeId: `${uid}--${statementId}`,
		userId: uid,
		statementId,
		role,
		user: { uid, displayName: 'Me', photoURL: null, isAnonymous: false },
		lastUpdate: T0,
		createdAt: T0,
		getInAppNotification: true,
		...extra,
	});
	const as = (uid) => env.authenticatedContext(uid).firestore();

	before(async () => {
		env = await makeEnv('subscription-answer-author');
		await seed(env, async (db) => {
			await setDoc(doc(db, 'statements', Q), statement(Q, 'question', OTHER, 'top'));
			await setDoc(doc(db, 'statements', ANSWER), statement(ANSWER, 'option', ME, Q));
			await setDoc(doc(db, 'statementsSubscribe', `${ME}--${Q}`), sub(ME, Q, 'member'));
		});
	});

	after(async () => {
		await env.cleanup();
	});

	it('the author may create an admin subscription to their own answer', async () => {
		await assertSucceeds(
			setDoc(doc(as(ME), 'statementsSubscribe', `${ME}--${ANSWER}`), sub(ME, ANSWER, 'admin')),
		);
	});

	it('someone else may not create an admin subscription to that answer', async () => {
		await assertFails(
			setDoc(
				doc(as(STRANGER), 'statementsSubscribe', `${STRANGER}--${ANSWER}`),
				sub(STRANGER, ANSWER, 'admin'),
			),
		);
	});

	it('the person saves choices and the marker on their question subscription', async () => {
		await assertSucceeds(
			updateDoc(doc(as(ME), 'statementsSubscribe', `${ME}--${Q}`), {
				notifyOnReplies: false,
				notifyOnNewAnswers: true,
				notifyPromptClosedAt: T0,
				statementId: Q,
				lastUpdate: T0 + 1,
			}),
		);
	});

	it('nobody else may write those choices', async () => {
		await assertFails(
			updateDoc(doc(as(STRANGER), 'statementsSubscribe', `${ME}--${Q}`), {
				notifyOnReplies: true,
				statementId: Q,
			}),
		);
	});
});
