import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
import { agoraProposalDoc, evaluationDoc, makeEnv, seed, statementDoc } from './helpers.mjs';

/**
 * The teacher removed a student (agoraRemoveParticipant): the uid is on the
 * session's `removedUids`. From then on that login writes nothing into THAT
 * session — no note, no edit, no rating, no vote — while a classmate in the
 * same room and the same login in another session are untouched. The list
 * itself is the callable's: the teacher's browser cannot edit it.
 */
describe('agora removed participants', () => {
	let env;

	const SESSION = 'session-removal';
	const OTHER_SESSION = 'session-elsewhere';
	const TEACHER = 'teacher-1';
	const REMOVED = 'student-removed';
	const CLASSMATE = 'student-stays';
	const QUESTION = 'question-removal';
	const OTHER_QUESTION = 'question-elsewhere';

	function sessionDoc(sessionId, removedUids) {
		return {
			sessionId,
			teacherId: TEACHER,
			code: sessionId === SESSION ? '11111' : '22222',
			participantCount: 2,
			stage: 'deliberation',
			stageIndex: 2,
			...(removedUids ? { removedUids } : {}),
		};
	}

	before(async () => {
		env = await makeEnv('agora-removal');
		await seed(env, async (db) => {
			await setDoc(doc(db, 'agoraSessions', SESSION), sessionDoc(SESSION, { [REMOVED]: 1000 }));
			await setDoc(doc(db, 'agoraSessions', OTHER_SESSION), sessionDoc(OTHER_SESSION));
			await setDoc(
				doc(db, 'statements', QUESTION),
				statementDoc({
					statementId: QUESTION,
					uid: TEACHER,
					overrides: { statementType: 'question', agoraSessionId: SESSION },
				}),
			);
			await setDoc(
				doc(db, 'statements', OTHER_QUESTION),
				statementDoc({
					statementId: OTHER_QUESTION,
					uid: TEACHER,
					overrides: { statementType: 'question', agoraSessionId: OTHER_SESSION },
				}),
			);
			// A note the removed student wrote before the teacher acted
			await setDoc(
				doc(db, 'statements', 'note-before'),
				agoraProposalDoc({ statementId: 'note-before', uid: REMOVED, sessionId: SESSION }),
			);
			await setDoc(
				doc(db, 'evaluations', `${REMOVED}--note-x`),
				evaluationDoc({
					evaluatorId: REMOVED,
					statementId: 'note-x',
					overrides: { agoraSessionId: SESSION },
				}),
			);
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	describe('statements', () => {
		it('refuses a new note from the removed student', async () => {
			const db = env.authenticatedContext(REMOVED).firestore();
			await assertFails(
				setDoc(
					doc(db, 'statements', 'note-new'),
					agoraProposalDoc({ statementId: 'note-new', uid: REMOVED, sessionId: SESSION }),
				),
			);
		});

		it('refuses an edit of the note they wrote before', async () => {
			const db = env.authenticatedContext(REMOVED).firestore();
			await assertFails(
				updateDoc(doc(db, 'statements', 'note-before'), { statement: 'rewritten', lastUpdate: 2 }),
			);
		});

		it('still lets a classmate in the same session write', async () => {
			const db = env.authenticatedContext(CLASSMATE).firestore();
			await assertSucceeds(
				setDoc(
					doc(db, 'statements', 'note-classmate'),
					agoraProposalDoc({ statementId: 'note-classmate', uid: CLASSMATE, sessionId: SESSION }),
				),
			);
		});

		it('still lets the same login write in another session', async () => {
			const db = env.authenticatedContext(REMOVED).firestore();
			await assertSucceeds(
				setDoc(
					doc(db, 'statements', 'note-elsewhere'),
					agoraProposalDoc({
						statementId: 'note-elsewhere',
						uid: REMOVED,
						sessionId: OTHER_SESSION,
					}),
				),
			);
		});

		it('never touches statements outside Agora', async () => {
			const db = env.authenticatedContext(REMOVED).firestore();
			await assertSucceeds(
				setDoc(
					doc(db, 'statements', 'plain-statement'),
					statementDoc({ statementId: 'plain-statement', uid: REMOVED }),
				),
			);
		});
	});

	describe('evaluations', () => {
		it('refuses a new rating and a changed rating in the session', async () => {
			const db = env.authenticatedContext(REMOVED).firestore();
			await assertFails(
				setDoc(
					doc(db, 'evaluations', `${REMOVED}--note-classmate`),
					evaluationDoc({
						evaluatorId: REMOVED,
						statementId: 'note-classmate',
						overrides: { agoraSessionId: SESSION },
					}),
				),
			);
			await assertFails(
				setDoc(
					doc(db, 'evaluations', `${REMOVED}--note-x`),
					evaluationDoc({
						evaluatorId: REMOVED,
						statementId: 'note-x',
						evaluation: -1,
						overrides: { agoraSessionId: SESSION },
					}),
				),
			);
		});

		it('lets a classmate rate, and the removed login rate elsewhere', async () => {
			await assertSucceeds(
				setDoc(
					doc(env.authenticatedContext(CLASSMATE).firestore(), 'evaluations', `${CLASSMATE}--n1`),
					evaluationDoc({
						evaluatorId: CLASSMATE,
						statementId: 'n1',
						overrides: { agoraSessionId: SESSION },
					}),
				),
			);
			await assertSucceeds(
				setDoc(
					doc(env.authenticatedContext(REMOVED).firestore(), 'evaluations', `${REMOVED}--n2`),
					evaluationDoc({
						evaluatorId: REMOVED,
						statementId: 'n2',
						overrides: { agoraSessionId: OTHER_SESSION },
					}),
				),
			);
		});
	});

	describe('votes', () => {
		function voteDoc(uid, parentId) {
			return {
				voteId: `${uid}--${parentId}`,
				statementId: 'none',
				userId: uid,
				parentId,
				createdAt: 1,
				lastUpdate: 1,
			};
		}

		it('refuses a vote on the session ballot from the removed student', async () => {
			const db = env.authenticatedContext(REMOVED).firestore();
			await assertFails(
				setDoc(doc(db, 'votes', `${REMOVED}--${QUESTION}`), voteDoc(REMOVED, QUESTION)),
			);
		});

		it('lets a classmate vote, and the removed login vote in another session', async () => {
			await assertSucceeds(
				setDoc(
					doc(env.authenticatedContext(CLASSMATE).firestore(), 'votes', `${CLASSMATE}--${QUESTION}`),
					voteDoc(CLASSMATE, QUESTION),
				),
			);
			await assertSucceeds(
				setDoc(
					doc(
						env.authenticatedContext(REMOVED).firestore(),
						'votes',
						`${REMOVED}--${OTHER_QUESTION}`,
					),
					voteDoc(REMOVED, OTHER_QUESTION),
				),
			);
		});
	});

	describe('the block list itself', () => {
		it('cannot be cleared or extended from the teacher browser', async () => {
			const db = env.authenticatedContext(TEACHER).firestore();
			await assertFails(updateDoc(doc(db, 'agoraSessions', SESSION), { removedUids: {} }));
			await assertFails(
				updateDoc(doc(db, 'agoraSessions', OTHER_SESSION), { removedUids: { [CLASSMATE]: 5 } }),
			);
		});

		it('leaves the teacher’s other live fields writable', async () => {
			const db = env.authenticatedContext(TEACHER).firestore();
			await assertSucceeds(updateDoc(doc(db, 'agoraSessions', SESSION), { lastUpdate: 3 }));
		});
	});
});
