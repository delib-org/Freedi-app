import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { agoraParticipantDoc, makeEnv, seed } from './helpers.mjs';

/**
 * Agora's own collections. The server-owned ones are already closed; these
 * tests pin that shut and cover the remaining gaps — a student rewriting the
 * camp census, listing classmates' private answers, or a teacher writing the
 * class score that computeSessionResults is supposed to own.
 */
describe('agora collections', () => {
	let env;

	before(async () => {
		env = await makeEnv('agora');
	});

	after(async () => {
		await env?.cleanup();
	});

	const SESSION = 'session-1';
	const STUDENT = 'student-alice';
	const CLASSMATE = 'student-bob';
	const TEACHER = 'teacher-1';

	describe('agoraScores / agoraCharacterReviews (server-owned)', () => {
		it('rejects any client write to a proposal score', async () => {
			const db = env.authenticatedContext(STUDENT).firestore();
			await assertFails(
				setDoc(doc(db, 'agoraScores', 'proposal-1'), {
					statementId: 'proposal-1',
					sessionId: SESSION,
					bridgingScore: 100,
				}),
			);
		});

		it('rejects any client write to a character review', async () => {
			const db = env.authenticatedContext(STUDENT).firestore();
			await assertFails(
				setDoc(doc(db, 'agoraCharacterReviews', 'proposal-1--robespierre'), {
					reviewId: 'proposal-1--robespierre',
					sessionId: SESSION,
					verdict: 'excellent',
				}),
			);
		});
	});

	describe('agoraParticipants', () => {
		it('allows a student to update their own lastActive', async () => {
			await seed(env, async (db) => {
				await setDoc(
					doc(db, 'agoraParticipants', `${SESSION}--${STUDENT}`),
					agoraParticipantDoc({ sessionId: SESSION, uid: STUDENT }),
				);
			});

			const db = env.authenticatedContext(STUDENT).firestore();
			await assertSucceeds(
				updateDoc(doc(db, 'agoraParticipants', `${SESSION}--${STUDENT}`), {
					lastActive: 1_700_000_001_000,
				}),
			);
		});

		it('rejects a student writing their own points', async () => {
			await seed(env, async (db) => {
				await setDoc(
					doc(db, 'agoraParticipants', `${SESSION}--${STUDENT}`),
					agoraParticipantDoc({ sessionId: SESSION, uid: STUDENT }),
				);
			});

			const db = env.authenticatedContext(STUDENT).firestore();
			await assertFails(
				updateDoc(doc(db, 'agoraParticipants', `${SESSION}--${STUDENT}`), {
					points: { valueAccuracy: 0, proposals: 0, helping: 0, total: 9999 },
				}),
			);
		});

		it('rejects a student updating a classmate’s participant doc', async () => {
			await seed(env, async (db) => {
				await setDoc(
					doc(db, 'agoraParticipants', `${SESSION}--${CLASSMATE}`),
					agoraParticipantDoc({ sessionId: SESSION, uid: CLASSMATE }),
				);
			});

			const db = env.authenticatedContext(STUDENT).firestore();
			await assertFails(
				updateDoc(doc(db, 'agoraParticipants', `${SESSION}--${CLASSMATE}`), {
					lastActive: 1_700_000_001_000,
				}),
			);
		});

		// Positioning is one-shot in the UI (Positioning.ts:33). camp is the
		// bridging denominator and feeds eligiblePoolFor, so a student who can
		// re-position at will can move every proposal's score.
		it('rejects re-positioning after a camp is already set', async () => {
			await seed(env, async (db) => {
				await setDoc(
					doc(db, 'agoraParticipants', `${SESSION}--${STUDENT}`),
					agoraParticipantDoc({
						sessionId: SESSION,
						uid: STUDENT,
						overrides: { camp: 'left', campPosition: -0.8 },
					}),
				);
			});

			const db = env.authenticatedContext(STUDENT).firestore();
			await assertFails(
				updateDoc(doc(db, 'agoraParticipants', `${SESSION}--${STUDENT}`), {
					camp: 'right',
					campPosition: 0.9,
				}),
			);
		});

		it('allows setting a camp for the first time', async () => {
			await seed(env, async (db) => {
				await setDoc(
					doc(db, 'agoraParticipants', `${SESSION}--${CLASSMATE}`),
					agoraParticipantDoc({ sessionId: SESSION, uid: CLASSMATE }),
				);
			});

			const db = env.authenticatedContext(CLASSMATE).firestore();
			await assertSucceeds(
				updateDoc(doc(db, 'agoraParticipants', `${SESSION}--${CLASSMATE}`), {
					camp: 'center',
					campPosition: 0.1,
				}),
			);
		});
	});

	describe('agoraValueAnswers', () => {
		it('rejects listing the whole class’s answers', async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'agoraValueAnswers', `${SESSION}--${CLASSMATE}--robespierre`), {
					answerId: `${SESSION}--${CLASSMATE}--robespierre`,
					sessionId: SESSION,
					userId: CLASSMATE,
					characterId: 'robespierre',
					answer: 'liberty',
				});
			});

			const db = env.authenticatedContext(STUDENT).firestore();
			await assertFails(getDocs(collection(db, 'agoraValueAnswers')));
		});
	});

	describe('agoraSessions', () => {
		it('rejects a teacher writing the server-owned class score', async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'agoraSessions', SESSION), {
					sessionId: SESSION,
					teacherId: TEACHER,
					code: '1234',
					stage: 'deliberation',
					participantCount: 3,
				});
			});

			const db = env.authenticatedContext(TEACHER).firestore();
			await assertFails(
				updateDoc(doc(db, 'agoraSessions', SESSION), {
					classScore: { total: 100, outcome: 'triumph' },
				}),
			);
		});

		it('rejects a student advancing the stage', async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'agoraSessions', SESSION), {
					sessionId: SESSION,
					teacherId: TEACHER,
					code: '1234',
					stage: 'deliberation',
					participantCount: 3,
				});
			});

			const db = env.authenticatedContext(STUDENT).firestore();
			await assertFails(updateDoc(doc(db, 'agoraSessions', SESSION), { stage: 'results' }));
		});

		// The stage plan, the pointer into it and its runtime state move only
		// through callables — a stale teacher tab writing `stage` without
		// `stageIndex` would leave the room's two positions disagreeing.
		it('rejects a teacher writing the stage pointer or the plan directly', async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'agoraSessions', SESSION), {
					sessionId: SESSION,
					teacherId: TEACHER,
					code: '1234',
					stage: 'question',
					stageIndex: 1,
					stagePlan: [
						{ itemId: 'lobby', stage: 'lobby' },
						{ itemId: 'question-1', stage: 'question', title: 'What do I want?' },
						{ itemId: 'results', stage: 'results' },
					],
					stageState: {},
					identity: 'named',
					participantCount: 3,
				});
			});

			const db = env.authenticatedContext(TEACHER).firestore();
			await assertFails(updateDoc(doc(db, 'agoraSessions', SESSION), { stage: 'results' }));
			await assertFails(updateDoc(doc(db, 'agoraSessions', SESSION), { stageIndex: 2 }));
			await assertFails(
				updateDoc(doc(db, 'agoraSessions', SESSION), {
					stagePlan: [{ itemId: 'lobby', stage: 'lobby' }],
				}),
			);
			await assertFails(
				updateDoc(doc(db, 'agoraSessions', SESSION), {
					'stageState.question-1': { outcome: { selected: [], computedAt: 1 } },
				}),
			);
			await assertFails(updateDoc(doc(db, 'agoraSessions', SESSION), { identity: 'pseudonym' }));
			await assertFails(
				updateDoc(doc(db, 'agoraSessions', SESSION), {
					agreement: { ranked: [], computedAt: 1 },
				}),
			);
			// while the fields the teacher does own still move
			await assertSucceeds(
				updateDoc(doc(db, 'agoraSessions', SESSION), {
					votingSettings: { selection: { resultsBy: 'consensus', cutoffBy: 'topOptions', numberOfResults: 2 } },
					lastUpdate: 1_700_000_000_001,
				}),
			);
		});

		// The teacher decides HOW the vote runs...
		it('allows a teacher to set the voting settings', async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'agoraSessions', SESSION), {
					sessionId: SESSION,
					teacherId: TEACHER,
					code: '1234',
					stage: 'deliberation',
					participantCount: 3,
				});
			});

			const db = env.authenticatedContext(TEACHER).firestore();
			await assertSucceeds(
				updateDoc(doc(db, 'agoraSessions', SESSION), {
					votingSettings: {
						enabled: true,
						selection: { resultsBy: 'consensus', cutoffBy: 'topOptions', numberOfResults: 3 },
					},
				}),
			);
		});

		// ...but not WHO is standing in it. The ballot is drawn up server-side
		// when the stage opens, and a teacher who could edit it could hand the
		// election to a proposal the class never rated highly.
		it('rejects a teacher rewriting the server-drawn ballot', async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'agoraSessions', SESSION), {
					sessionId: SESSION,
					teacherId: TEACHER,
					code: '1234',
					stage: 'voting',
					participantCount: 3,
					voting: {
						candidateIds: ['proposal-1', 'proposal-2'],
						candidates: [],
						computedAt: 1_700_000_000_000,
					},
				});
			});

			const db = env.authenticatedContext(TEACHER).firestore();
			await assertFails(
				updateDoc(doc(db, 'agoraSessions', SESSION), {
					voting: {
						candidateIds: ['teachers-favourite'],
						candidates: [],
						computedAt: 1_700_000_000_001,
					},
				}),
			);
		});

		it('rejects a student setting the voting settings', async () => {
			await seed(env, async (db) => {
				await setDoc(doc(db, 'agoraSessions', SESSION), {
					sessionId: SESSION,
					teacherId: TEACHER,
					code: '1234',
					stage: 'deliberation',
					participantCount: 3,
				});
			});

			const db = env.authenticatedContext(STUDENT).firestore();
			await assertFails(
				updateDoc(doc(db, 'agoraSessions', SESSION), {
					votingSettings: { winningConsensusThreshold: 0 },
				}),
			);
		});
	});
});
