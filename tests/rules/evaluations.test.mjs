import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, setDoc, updateDoc } from 'firebase/firestore';
import { evaluationDoc, makeEnv, seed } from './helpers.mjs';

/**
 * /evaluations is the input to Agora's entire scoring model: every rating feeds
 * onAgoraEvaluationWritten, which computes bridgingScore, classConsensus, rating
 * credits and the class score. The server owns the score document. These tests
 * exist to make sure it also owns the inputs.
 */
describe('/evaluations', () => {
	let env;

	before(async () => {
		env = await makeEnv('evaluations');
	});

	after(async () => {
		await env?.cleanup();
	});

	const STUDENT = 'student-alice';
	const CLASSMATE = 'student-bob';
	const TARGET = 'proposal-1';

	it('rejects an unauthenticated create', async () => {
		const db = env.unauthenticatedContext().firestore();
		await assertFails(
			setDoc(
				doc(db, 'evaluations', `anon--${TARGET}`),
				evaluationDoc({ evaluatorId: 'anon', statementId: TARGET }),
			),
		);
	});

	it('allows a student to rate as themselves', async () => {
		const db = env.authenticatedContext(STUDENT).firestore();
		await assertSucceeds(
			setDoc(
				doc(db, 'evaluations', `${STUDENT}--${TARGET}`),
				evaluationDoc({ evaluatorId: STUDENT, statementId: TARGET }),
			),
		);
	});

	it('rejects a rating cast under a classmate’s evaluatorId', async () => {
		const db = env.authenticatedContext(STUDENT).firestore();
		await assertFails(
			setDoc(
				doc(db, 'evaluations', `${CLASSMATE}--${TARGET}`),
				evaluationDoc({ evaluatorId: CLASSMATE, statementId: TARGET }),
			),
		);
	});

	// The character raters are written by fn_agoraCharacterReview through the
	// Admin SDK. A client that can mint them can move any proposal's camp
	// aggregates at will.
	it('rejects impersonation of a synthetic agora-ai rater', async () => {
		const db = env.authenticatedContext(STUDENT).firestore();
		const aiUid = 'agora-ai--robespierre--0';
		await assertFails(
			setDoc(
				doc(db, 'evaluations', `${aiUid}--${TARGET}`),
				evaluationDoc({ evaluatorId: aiUid, statementId: TARGET, evaluation: 1 }),
			),
		);
	});

	it('rejects overwriting a classmate’s existing rating', async () => {
		await seed(env, async (db) => {
			await setDoc(
				doc(db, 'evaluations', `${CLASSMATE}--${TARGET}`),
				evaluationDoc({ evaluatorId: CLASSMATE, statementId: TARGET, evaluation: -1 }),
			);
		});

		const db = env.authenticatedContext(STUDENT).firestore();
		await assertFails(
			updateDoc(doc(db, 'evaluations', `${CLASSMATE}--${TARGET}`), {
				evaluation: 1,
				updatedAt: 1_700_000_001_000,
			}),
		);
	});

	it('rejects reassigning an existing rating to a different evaluator', async () => {
		await seed(env, async (db) => {
			await setDoc(
				doc(db, 'evaluations', `${STUDENT}--reassign`),
				evaluationDoc({ evaluatorId: STUDENT, statementId: 'reassign' }),
			);
		});

		const db = env.authenticatedContext(STUDENT).firestore();
		await assertFails(
			updateDoc(doc(db, 'evaluations', `${STUDENT}--reassign`), {
				evaluatorId: CLASSMATE,
				updatedAt: 1_700_000_001_000,
			}),
		);
	});

	it('rejects deleting a classmate’s rating', async () => {
		await seed(env, async (db) => {
			await setDoc(
				doc(db, 'evaluations', `${CLASSMATE}--delete-me`),
				evaluationDoc({ evaluatorId: CLASSMATE, statementId: 'delete-me' }),
			);
		});

		const db = env.authenticatedContext(STUDENT).firestore();
		await assertFails(deleteDoc(doc(db, 'evaluations', `${CLASSMATE}--delete-me`)));
	});

	it('allows deleting your own rating', async () => {
		await seed(env, async (db) => {
			await setDoc(
				doc(db, 'evaluations', `${STUDENT}--mine`),
				evaluationDoc({ evaluatorId: STUDENT, statementId: 'mine' }),
			);
		});

		const db = env.authenticatedContext(STUDENT).firestore();
		await assertSucceeds(deleteDoc(doc(db, 'evaluations', `${STUDENT}--mine`)));
	});
});
