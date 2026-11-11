import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { makeEnv, seed, statementDoc } from './helpers.mjs';

/**
 * Answers the automatic language check hid: who may un-hide or move them.
 * Split from statements.test.mjs to keep each file under 500 lines.
 */
describe('/statements — answers hidden by the automatic check', () => {
	let env;

	before(async () => {
		env = await makeEnv('statements-answer-moderation');
		await seed(env, async (db) => {
			for (const id of [QUESTION, 'another-question']) {
				await setDoc(doc(db, 'statements', id), {
					statementId: id,
					parentId: 'top',
					topParentId: id,
					parents: [],
					accessScope: 'open',
				});
			}
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	const AUTHOR = 'user-author';
	const HOST = 'user-host';
	const QUESTION = 'question-1';
	const MARKER = { reason: 'inappropriate-language', hiddenAt: 1, eventId: 'event-1' };

	function answer(statementId, overrides = {}) {
		return statementDoc({
			statementId,
			uid: AUTHOR,
			overrides: {
				statementType: 'option',
				parentId: QUESTION,
				topParentId: QUESTION,
				parents: [QUESTION],
				...overrides,
			},
		});
	}

	/** The main app gives every author an admin subscription on their own answer. */
	async function seedHiddenAnswer(statementId) {
		await seed(env, async (db) => {
			await setDoc(
				doc(db, 'statements', statementId),
				answer(statementId, { hide: true, answerModeration: MARKER }),
			);
			await setDoc(doc(db, 'statementsSubscribe', `${AUTHOR}--${statementId}`), {
				role: 'admin',
				userId: AUTHOR,
				statementId,
			});
			await setDoc(doc(db, 'statementsSubscribe', `${HOST}--${QUESTION}`), {
				role: 'admin',
				userId: HOST,
				statementId: QUESTION,
			});
		});
	}

	it('rejects creating an answer that already carries the mark', async () => {
		const db = env.authenticatedContext(AUTHOR).firestore();
		await assertFails(
			setDoc(doc(db, 'statements', 'forged'), answer('forged', { answerModeration: MARKER })),
		);
	});

	it('still lets an author create a plain answer', async () => {
		const db = env.authenticatedContext(AUTHOR).firestore();
		await assertSucceeds(setDoc(doc(db, 'statements', 'plain'), answer('plain')));
	});

	it('rejects the author restoring their own hidden answer', async () => {
		await seedHiddenAnswer('by-author');
		const db = env.authenticatedContext(AUTHOR).firestore();
		await assertFails(updateDoc(doc(db, 'statements', 'by-author'), { hide: false }));
	});

	it('lets the question host restore it', async () => {
		await seedHiddenAnswer('by-host');
		const db = env.authenticatedContext(HOST).firestore();
		await assertSucceeds(updateDoc(doc(db, 'statements', 'by-host'), { hide: false }));
	});

	it('rejects the author moving the answer, by any of the three fields', async () => {
		await seedHiddenAnswer('move-me');
		const db = env.authenticatedContext(AUTHOR).firestore();
		const ref = doc(db, 'statements', 'move-me');
		await assertFails(updateDoc(ref, { parentId: 'my-own-question' }));
		await assertFails(updateDoc(ref, { topParentId: 'my-own-question' }));
		await assertFails(updateDoc(ref, { parents: ['my-own-question'] }));
	});

	it('lets a host of the original question move it', async () => {
		await seedHiddenAnswer('host-moves');
		const db = env.authenticatedContext(HOST).firestore();
		await assertSucceeds(
			// A move carries the tree fields of the new parent with it.
			updateDoc(doc(db, 'statements', 'host-moves'), {
				parentId: 'another-question',
				topParentId: 'another-question',
				parents: ['another-question'],
			}),
		);
	});

	it('lets a host record the restore in the write that unhides', async () => {
		await seedHiddenAnswer('recorded');
		const db = env.authenticatedContext(HOST).firestore();
		await assertSucceeds(
			updateDoc(doc(db, 'statements', 'recorded'), {
				hide: false,
				'answerModeration.restoredAt': 2,
			}),
		);
	});

	it('rejects the author recording a restore', async () => {
		await seedHiddenAnswer('author-records');
		const db = env.authenticatedContext(AUTHOR).firestore();
		await assertFails(
			updateDoc(doc(db, 'statements', 'author-records'), {
				hide: false,
				'answerModeration.restoredAt': 2,
			}),
		);
	});

	it('rejects restoredAt without clearing hide', async () => {
		await seedHiddenAnswer('no-unhide');
		const db = env.authenticatedContext(HOST).firestore();
		await assertFails(
			updateDoc(doc(db, 'statements', 'no-unhide'), { 'answerModeration.restoredAt': 2 }),
		);
	});

	it('rejects a host changing another field of the mark during a restore', async () => {
		await seedHiddenAnswer('extra-field');
		const db = env.authenticatedContext(HOST).firestore();
		await assertFails(
			updateDoc(doc(db, 'statements', 'extra-field'), {
				hide: false,
				'answerModeration.restoredAt': 2,
				'answerModeration.reason': 'none',
			}),
		);
	});

	it('does not lock an answer the host restored: its author may hide and unhide it', async () => {
		await seed(env, async (db) => {
			await setDoc(
				doc(db, 'statements', 'restored'),
				answer('restored', {
					hide: false,
					answerModeration: { ...MARKER, restoredAt: 2 },
				}),
			);
		});
		const db = env.authenticatedContext(AUTHOR).firestore();
		const ref = doc(db, 'statements', 'restored');
		await assertSucceeds(updateDoc(ref, { hide: true }));
		await assertSucceeds(updateDoc(ref, { hide: false }));
	});

	it('rejects the host editing the mark', async () => {
		await seedHiddenAnswer('mark-edit');
		const db = env.authenticatedContext(HOST).firestore();
		await assertFails(
			updateDoc(doc(db, 'statements', 'mark-edit'), {
				answerModeration: { ...MARKER, eventId: 'other' },
			}),
		);
	});

	it('still lets the author edit the text of a hidden answer', async () => {
		await seedHiddenAnswer('text-edit');
		const db = env.authenticatedContext(AUTHOR).firestore();
		await assertSucceeds(updateDoc(doc(db, 'statements', 'text-edit'), { statement: 'reworded' }));
	});
});
