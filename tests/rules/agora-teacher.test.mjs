import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { agoraProposalDoc, makeEnv, seed } from './helpers.mjs';

/**
 * The teacher's live console: real names for the teacher only, a private
 * thread each side can read and neither can write, and a student's text that
 * only the moderation callable may take down, put back or delete.
 */
describe('agora teacher console collections', () => {
	let env;

	before(async () => {
		env = await makeEnv('agora-teacher');
	});

	after(async () => {
		await env?.cleanup();
	});

	const SESSION = 'session-1';
	const TEACHER = 'teacher-1';
	const OTHER_TEACHER = 'teacher-2';
	const STUDENT = 'student-alice';
	const CLASSMATE = 'student-bob';

	function identityDoc(uid) {
		return {
			identityId: `${SESSION}--${uid}`,
			sessionId: SESSION,
			teacherId: TEACHER,
			userId: uid,
			anonName: 'שועל כחול',
			realName: 'Tal Y.',
			createdAt: 1_700_000_000_000,
			lastUpdate: 1_700_000_000_000,
			expiresAt: 1_700_000_000_000,
		};
	}

	function messageDoc(messageId, from) {
		return {
			messageId,
			sessionId: SESSION,
			teacherId: TEACHER,
			studentUid: STUDENT,
			from,
			kind: from === 'teacher' ? 'note' : 'reply',
			text: 'a private line',
			createdAt: 1_700_000_000_000,
		};
	}

	describe('agoraIdentities', () => {
		before(async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'agoraIdentities', `${SESSION}--${STUDENT}`), identityDoc(STUDENT));
				await setDoc(doc(db, 'agoraIdentities', `${SESSION}--${CLASSMATE}`), identityDoc(CLASSMATE));
			});
		});

		it('lets the session teacher list the names with the equality the rule expects', async () => {
			const db = env.authenticatedContext(TEACHER).firestore();
			await assertSucceeds(
				getDocs(
					query(
						collection(db, 'agoraIdentities'),
						where('sessionId', '==', SESSION),
						where('teacherId', '==', TEACHER),
					),
				),
			);
		});

		it('refuses a student reading their OWN real name doc', async () => {
			const db = env.authenticatedContext(STUDENT).firestore();
			await assertFails(getDoc(doc(db, 'agoraIdentities', `${SESSION}--${STUDENT}`)));
		});

		it('refuses a student listing the session names', async () => {
			const db = env.authenticatedContext(STUDENT).firestore();
			await assertFails(
				getDocs(query(collection(db, 'agoraIdentities'), where('sessionId', '==', SESSION))),
			);
		});

		it('refuses another teacher', async () => {
			const db = env.authenticatedContext(OTHER_TEACHER).firestore();
			await assertFails(getDoc(doc(db, 'agoraIdentities', `${SESSION}--${STUDENT}`)));
		});

		it('refuses every client write, the teacher included', async () => {
			const db = env.authenticatedContext(TEACHER).firestore();
			await assertFails(setDoc(doc(db, 'agoraIdentities', `${SESSION}--new`), identityDoc('new')));
			await assertFails(deleteDoc(doc(db, 'agoraIdentities', `${SESSION}--${STUDENT}`)));
		});
	});

	describe('agoraTeacherMessages', () => {
		before(async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'agoraTeacherMessages', 'm-note'), messageDoc('m-note', 'teacher'));
				await setDoc(doc(db, 'agoraTeacherMessages', 'm-reply'), messageDoc('m-reply', 'student'));
			});
		});

		it('lets the student list their own thread', async () => {
			const db = env.authenticatedContext(STUDENT).firestore();
			await assertSucceeds(
				getDocs(
					query(
						collection(db, 'agoraTeacherMessages'),
						where('sessionId', '==', SESSION),
						where('studentUid', '==', STUDENT),
					),
				),
			);
		});

		it('lets the teacher list every thread of the session', async () => {
			const db = env.authenticatedContext(TEACHER).firestore();
			await assertSucceeds(
				getDocs(
					query(
						collection(db, 'agoraTeacherMessages'),
						where('sessionId', '==', SESSION),
						where('teacherId', '==', TEACHER),
					),
				),
			);
		});

		it('refuses a classmate reading the line', async () => {
			const db = env.authenticatedContext(CLASSMATE).firestore();
			await assertFails(getDoc(doc(db, 'agoraTeacherMessages', 'm-note')));
		});

		it('refuses a student writing a reply straight into the collection', async () => {
			const db = env.authenticatedContext(STUDENT).firestore();
			await assertFails(
				setDoc(doc(db, 'agoraTeacherMessages', 'm-forged'), messageDoc('m-forged', 'student')),
			);
		});

		it('refuses the teacher editing a line after the fact', async () => {
			const db = env.authenticatedContext(TEACHER).firestore();
			await assertFails(updateDoc(doc(db, 'agoraTeacherMessages', 'm-note'), { text: 'x' }));
		});
	});

	describe('moderated statements', () => {
		before(async () => {
			await seed(env, async (db) => {
				await setDoc(
					doc(db, 'statements', 'hidden-one'),
					agoraProposalDoc({
						statementId: 'hidden-one',
						uid: STUDENT,
						sessionId: SESSION,
						overrides: {
							statement: '',
							hide: true,
							agoraModeration: { hidden: true, hiddenAt: 1_700_000_000_000 },
						},
					}),
				);
				await setDoc(
					doc(db, 'statements', 'plain-one'),
					agoraProposalDoc({ statementId: 'plain-one', uid: STUDENT, sessionId: SESSION }),
				);
				// The teacher's inherited admin subscription — what used to make
				// isAuthorized() a hard delete on a student's proposal
				await setDoc(doc(db, 'statementsSubscribe', `${TEACHER}--plain-one`), {
					statementsSubscribeId: `${TEACHER}--plain-one`,
					statementId: 'plain-one',
					userId: TEACHER,
					role: 'admin',
					user: { uid: TEACHER, displayName: 'Teacher' },
				});
			});
		});

		it('refuses the author putting their hidden text back', async () => {
			const db = env.authenticatedContext(STUDENT).firestore();
			await assertFails(
				updateDoc(doc(db, 'statements', 'hidden-one'), {
					statement: 'my words again',
					hide: false,
					agoraModeration: { hidden: false },
				}),
			);
		});

		it('refuses the author clearing the moderation record alone', async () => {
			const db = env.authenticatedContext(STUDENT).firestore();
			await assertFails(
				updateDoc(doc(db, 'statements', 'hidden-one'), {
					agoraModeration: { hidden: false },
				}),
			);
		});

		it('still lets the author edit their own visible text', async () => {
			const db = env.authenticatedContext(STUDENT).firestore();
			await assertSucceeds(
				updateDoc(doc(db, 'statements', 'plain-one'), {
					statement: 'a better statement',
					lastUpdate: 1_700_000_000_001,
				}),
			);
		});

		it('refuses the author deleting their proposal', async () => {
			const db = env.authenticatedContext(STUDENT).firestore();
			await assertFails(deleteDoc(doc(db, 'statements', 'plain-one')));
		});

		it('refuses the teacher hard-deleting a proposal, admin subscription or not', async () => {
			const db = env.authenticatedContext(TEACHER).firestore();
			await assertFails(deleteDoc(doc(db, 'statements', 'plain-one')));
		});
	});
});
