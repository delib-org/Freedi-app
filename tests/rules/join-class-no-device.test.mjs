import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteField, doc, setDoc, updateDoc } from 'firebase/firestore';
import { makeEnv, seed, statementDoc } from './helpers.mjs';

/**
 * join-class students without a device: the teacher writes and votes for them through
 * classPostProposal / classCastVoteFor (Admin SDK). These pin the other side: nobody can
 * do it from a browser. A client can never write `enteredByUid`, on a vote or a statement,
 * and can never make a vote or a statement a no-device student's.
 */
describe('join-class no-device rules', () => {
	let env;

	const TEACHER = 'u-teacher';
	const STUDENT = 'u-student';
	const CLASSMATE = 'u-classmate';
	const MAIN = 'main-nd';
	const CH = 'ch-nd';
	const GUIDING = 'guiding-nd';
	const PROPOSAL = 'prop-student';
	const ND_PROPOSAL = 'prop-nd';
	const ANSWER = 'answer-student';
	const ANSWER_TO_MOVE = 'answer-to-move';
	const OWN_QUESTION = 'own-question';
	const PLAIN_QUESTION = 'plain-question';
	const PLAIN_QUESTION_2 = 'plain-question-2';
	const PLAIN_OPTION = 'plain-option';
	const ND = 'nd_11111111';
	const T0 = 1_800_000_000_000;

	const as = (uid) => env.authenticatedContext(uid).firestore();

	const sub = (uid, role) => ({
		statementsSubscribeId: `${uid}--${MAIN}`,
		userId: uid,
		statementId: MAIN,
		role,
		lastUpdate: T0,
		createdAt: T0,
	});

	const option = (id, parentId, uid, extra = {}) =>
		statementDoc({
			statementId: id,
			uid,
			overrides: { parentId, topParentId: MAIN, parents: [MAIN, parentId], ...extra },
		});

	const vote = (userId, extra = {}) => ({
		voteId: `${userId}--${CH}`,
		statementId: 'prop-student',
		parentId: CH,
		userId,
		createdAt: T0,
		lastUpdate: T0,
		...extra,
	});

	const marker = (extra = {}) => ({ tableId: `${MAIN}--1`, shared: false, coAuthors: [], ...extra });

	before(async () => {
		env = await makeEnv('join-class-no-device');
		await seed(env, async (db) => {
			const question = (id, settings) =>
				setDoc(doc(db, 'statements', id), {
					statementId: id,
					parentId: MAIN,
					topParentId: MAIN,
					statementType: 'question',
					statementSettings: settings,
				});
			await setDoc(doc(db, 'statements', MAIN), {
				statementId: MAIN,
				parentId: 'top',
				topParentId: MAIN,
				statementType: 'question',
				creatorId: TEACHER,
				creator: { uid: TEACHER, displayName: 'T' },
				membership: { access: 'openToAll' },
			});
			await setDoc(doc(db, 'statementsSubscribe', `${TEACHER}--${MAIN}`), sub(TEACHER, 'admin'));
			await setDoc(doc(db, 'statementsSubscribe', `${STUDENT}--${MAIN}`), sub(STUDENT, 'member'));
			await question(CH, {
				classRole: 'challenge',
				ballot: { candidateIds: ['prop-student', ND_PROPOSAL], frozenAt: T0 },
			});
			await question(GUIDING, { classRole: 'guiding' });
			await setDoc(
				doc(db, 'statements', PROPOSAL),
				option(PROPOSAL, CH, STUDENT, { classTable: marker() }),
			);
			await setDoc(
				doc(db, 'statements', ND_PROPOSAL),
				option(ND_PROPOSAL, CH, ND, { classTable: marker({ enteredByUid: TEACHER }) }),
			);
			await setDoc(
				doc(db, 'statements', ANSWER),
				option(ANSWER, GUIDING, STUDENT, { classTable: marker() }),
			);
			await setDoc(
				doc(db, 'statements', ANSWER_TO_MOVE),
				option(ANSWER_TO_MOVE, GUIDING, STUDENT, { classTable: marker() }),
			);
			await setDoc(
				doc(db, 'statements', OWN_QUESTION),
				option(OWN_QUESTION, MAIN, STUDENT, {
					statementType: 'question',
					statementSettings: { classRole: 'guiding' },
					classTable: marker(),
				}),
			);
			// An ordinary discussion, nothing to do with a class.
			for (const id of [PLAIN_QUESTION, PLAIN_QUESTION_2]) {
				await setDoc(
					doc(db, 'statements', id),
					statementDoc({
						statementId: id,
						uid: STUDENT,
						overrides: { parentId: 'top', topParentId: id, statementType: 'question' },
					}),
				);
			}
			await setDoc(
				doc(db, 'statements', PLAIN_OPTION),
				statementDoc({
					statementId: PLAIN_OPTION,
					uid: STUDENT,
					overrides: {
						parentId: PLAIN_QUESTION,
						topParentId: PLAIN_QUESTION,
						parents: [PLAIN_QUESTION],
					},
				}),
			);
			await setDoc(doc(db, 'votes', `${ND}--${CH}`), vote(ND, { enteredByUid: TEACHER }));
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	describe('votes', () => {
		it('a student still votes in their own slot', async () => {
			await assertSucceeds(setDoc(doc(as(STUDENT), 'votes', `${STUDENT}--${CH}`), vote(STUDENT)));
		});

		it('a student cannot write enteredByUid on their own vote', async () => {
			await assertFails(
				setDoc(
					doc(as(STUDENT), 'votes', `${STUDENT}--${CH}`),
					vote(STUDENT, { enteredByUid: STUDENT }),
				),
			);
			await assertFails(
				updateDoc(doc(as(STUDENT), 'votes', `${STUDENT}--${CH}`), { enteredByUid: TEACHER }),
			);
		});

		it('nobody votes in a no-device slot from a browser, the teacher included', async () => {
			for (const uid of [STUDENT, TEACHER]) {
				await assertFails(
					setDoc(doc(as(uid), 'votes', `${ND}--${CH}`), vote(ND, { statementId: PROPOSAL })),
				);
				await assertFails(
					updateDoc(doc(as(uid), 'votes', `${ND}--${CH}`), {
						statementId: ND_PROPOSAL,
						lastUpdate: T0 + 1,
					}),
				);
			}
		});

		it('a student cannot put a no-device id on a vote in their own slot', async () => {
			await assertFails(setDoc(doc(as(STUDENT), 'votes', `${STUDENT}--${CH}`), vote(ND)));
		});
	});

	// A proposal comes from classPostProposal alone: that is where the limit and the language
	// check live. Nothing a browser does may leave a live option under a class challenge.
	describe('a proposal comes only from the server', () => {
		it('denies a direct create of an option under the challenge, the teacher included', async () => {
			for (const uid of [STUDENT, TEACHER]) {
				await assertFails(
					setDoc(doc(as(uid), 'statements', `direct-${uid}`), option(`direct-${uid}`, CH, uid)),
				);
			}
		});

		it('denies moving an option under the challenge, the teacher included', async () => {
			await assertFails(
				updateDoc(doc(as(STUDENT), 'statements', ANSWER_TO_MOVE), { parentId: CH }),
			);
			await assertFails(updateDoc(doc(as(TEACHER), 'statements', ANSWER_TO_MOVE), { parentId: CH }));
		});

		it('denies moving an option there by a whole-document merge', async () => {
			await assertFails(
				setDoc(
					doc(as(STUDENT), 'statements', ANSWER_TO_MOVE),
					{ parentId: CH, parents: [MAIN, CH] },
					{ merge: true },
				),
			);
		});

		it('denies making a non-option under the challenge into an option', async () => {
			const ref = doc(as(STUDENT), 'statements', 'flip-in-place');
			await assertSucceeds(
				setDoc(ref, option('flip-in-place', CH, STUDENT, { statementType: 'statement' })),
			);
			await assertFails(updateDoc(ref, { statementType: 'option' }));
			await assertFails(
				updateDoc(doc(as(TEACHER), 'statements', 'flip-in-place'), { statementType: 'option' }),
			);
		});

		it('denies the two steps in either order, and both at once', async () => {
			const moved = doc(as(STUDENT), 'statements', 'move-then-flip');
			await assertSucceeds(
				setDoc(moved, option('move-then-flip', GUIDING, STUDENT, { statementType: 'statement' })),
			);
			// A move carries the new parent's tree fields, as every client move does.
			await assertFails(updateDoc(moved, { parentId: CH, parents: [MAIN, CH], statementType: 'option' }));
			await assertSucceeds(updateDoc(moved, { parentId: CH, parents: [MAIN, CH] }));
			await assertFails(updateDoc(moved, { statementType: 'option' }));
		});

		it('denies handing over a proposal that has no marker, like an old one', async () => {
			const ref = doc(as(STUDENT), 'statements', 'prop-no-marker');
			await seed(env, (db) =>
				setDoc(doc(db, 'statements', 'prop-no-marker'), option('prop-no-marker', CH, STUDENT)),
			);
			await assertFails(updateDoc(ref, { creatorId: CLASSMATE }));
			await assertFails(updateDoc(ref, { creator: { uid: CLASSMATE, displayName: 'C' } }));
		});

		it('denies moving an existing proposal away or changing its type', async () => {
			const ref = doc(as(STUDENT), 'statements', PROPOSAL);
			await assertFails(updateDoc(ref, { parentId: GUIDING }));
			await assertFails(updateDoc(ref, { statementType: 'statement' }));
		});
	});

	// These rules are global and deployed whole: a false denial is worse than the hole.
	describe('the writes that must keep working', () => {
		it('a whole-document merge with the author unchanged, as the main app writes it', async () => {
			await assertSucceeds(
				setDoc(
					doc(as(STUDENT), 'statements', ANSWER),
					option(ANSWER, GUIDING, STUDENT, { classTable: marker(), lastUpdate: T0 + 5 }),
					{ merge: true },
				),
			);
			await assertSucceeds(
				setDoc(
					doc(as(TEACHER), 'statements', ND_PROPOSAL),
					option(ND_PROPOSAL, CH, ND, {
						classTable: marker({ enteredByUid: TEACHER }),
						lastUpdate: T0 + 5,
					}),
					{ merge: true },
				),
			);
		});

		it('a teacher update on a proposal: the clocks and hiding', async () => {
			const ref = doc(as(TEACHER), 'statements', PROPOSAL);
			await assertSucceeds(updateDoc(ref, { lastUpdate: T0 + 6 }));
			await assertSucceeds(updateDoc(ref, { hide: true, lastUpdate: T0 + 7 }));
			await assertSucceeds(updateDoc(ref, { hide: false, lastUpdate: T0 + 8 }));
		});

		it('a participant moving the clocks on a proposal they did not write', async () => {
			await assertSucceeds(
				updateDoc(doc(as(CLASSMATE), 'statements', PROPOSAL), {
					lastUpdate: T0 + 9,
					lastChildUpdate: T0 + 9,
				}),
			);
		});

		it('the author editing the text of an answer or of their own table question', async () => {
			await assertSucceeds(
				updateDoc(doc(as(STUDENT), 'statements', ANSWER), { statement: 'edit', lastUpdate: T0 + 1 }),
			);
			await assertSucceeds(
				updateDoc(doc(as(STUDENT), 'statements', OWN_QUESTION), {
					statement: 'edit',
					lastUpdate: T0 + 1,
				}),
			);
		});

		it('a non-class option keeps its freedoms: rename, marker, move, type', async () => {
			const ref = doc(as(STUDENT), 'statements', PLAIN_OPTION);
			await assertSucceeds(updateDoc(ref, { creator: { uid: STUDENT, displayName: 'New name' } }));
			await assertSucceeds(updateDoc(ref, { creatorId: STUDENT, lastUpdate: T0 + 1 }));
			await assertSucceeds(
				updateDoc(ref, {
					parentId: PLAIN_QUESTION_2,
					parents: [PLAIN_QUESTION_2],
					topParentId: PLAIN_QUESTION_2,
				}),
			);
			await assertSucceeds(updateDoc(ref, { statementType: 'statement' }));
			await assertSucceeds(updateDoc(ref, { statementType: 'option' }));
			await assertSucceeds(updateDoc(ref, { classTable: { tableId: 'x' } }));
		});

		it('a non-option may still be written under the challenge, and moved inside the lesson', async () => {
			const ref = doc(as(STUDENT), 'statements', 'chat-under-challenge');
			await assertSucceeds(
				setDoc(ref, option('chat-under-challenge', CH, STUDENT, { statementType: 'statement' })),
			);
			await assertSucceeds(updateDoc(ref, { parentId: GUIDING, parents: [MAIN, GUIDING] }));
		});

		it('moving an option between guiding questions stays open', async () => {
			const ref = doc(as(STUDENT), 'statements', 'answer-other-q');
			await assertSucceeds(setDoc(ref, option('answer-other-q', GUIDING, STUDENT)));
			await assertSucceeds(updateDoc(ref, { parentId: OWN_QUESTION, parents: [MAIN, OWN_QUESTION] }));
		});
	});

	describe('statements', () => {
		it('a student cannot create a table-talk answer stamped as entered by the teacher', async () => {
			await assertFails(
				setDoc(
					doc(as(STUDENT), 'statements', 'answer-forged'),
					option('answer-forged', GUIDING, STUDENT, {
						classTable: marker({ enteredByUid: TEACHER }),
					}),
				),
			);
		});

		it('a student cannot create a statement under a no-device id', async () => {
			await assertFails(
				setDoc(doc(as(STUDENT), 'statements', 'answer-nd'), option('answer-nd', GUIDING, ND)),
			);
		});

		it('still lets a student create an answer with an honest marker', async () => {
			await assertSucceeds(
				setDoc(
					doc(as(STUDENT), 'statements', 'answer-ok'),
					option('answer-ok', GUIDING, STUDENT, { classTable: marker() }),
				),
			);
		});

		it('a student cannot stamp or hand over their own proposal', async () => {
			const ref = doc(as(STUDENT), 'statements', PROPOSAL);
			await assertFails(updateDoc(ref, { 'classTable.enteredByUid': TEACHER }));
			await assertFails(updateDoc(ref, { creatorId: ND }));
			await assertFails(updateDoc(ref, { creator: { uid: ND, displayName: '' } }));
			await assertFails(updateDoc(ref, { classTable: marker({ tableId: 'other' }) }));
		});

		it('a student cannot stamp their answer, or give it to a student without a device', async () => {
			const ref = doc(as(STUDENT), 'statements', ANSWER);
			await assertFails(updateDoc(ref, { 'classTable.enteredByUid': TEACHER }));
			await assertFails(updateDoc(ref, { creatorId: ND }));
		});

		it('a student cannot hand their answer to a classmate, field by field or whole', async () => {
			const ref = doc(as(STUDENT), 'statements', ANSWER);
			await assertFails(updateDoc(ref, { creatorId: CLASSMATE }));
			await assertFails(updateDoc(ref, { creator: { uid: CLASSMATE, displayName: 'C' } }));
			await assertFails(updateDoc(ref, { 'creator.displayName': 'Somebody else' }));
			await assertFails(
				updateDoc(ref, { creatorId: CLASSMATE, creator: { uid: CLASSMATE, displayName: 'C' } }),
			);
		});

		it("a student cannot rewrite or remove their answer's table marker", async () => {
			const ref = doc(as(STUDENT), 'statements', ANSWER);
			await assertFails(updateDoc(ref, { classTable: marker({ tableId: 'other' }) }));
			await assertFails(updateDoc(ref, { 'classTable.coAuthors': [CLASSMATE] }));
			await assertFails(updateDoc(ref, { classTable: deleteField() }));
		});

		it('the same goes for a question a table wrote for itself', async () => {
			const ref = doc(as(STUDENT), 'statements', OWN_QUESTION);
			await assertFails(updateDoc(ref, { creatorId: CLASSMATE }));
			await assertFails(updateDoc(ref, { classTable: marker({ tableId: 'other' }) }));
		});

		it('still lets a student edit their own answer', async () => {
			await assertSucceeds(
				updateDoc(doc(as(STUDENT), 'statements', ANSWER), {
					statement: 'better',
					lastUpdate: T0 + 1,
				}),
			);
		});

		it('nobody takes the stamp or the author off a no-device proposal from a browser', async () => {
			const asTeacher = doc(as(TEACHER), 'statements', ND_PROPOSAL);
			await assertFails(updateDoc(asTeacher, { classTable: marker() }));
			await assertFails(updateDoc(asTeacher, { creatorId: TEACHER }));
			await assertFails(updateDoc(asTeacher, { statement: 'rewritten' }));
			await assertFails(
				updateDoc(doc(as(STUDENT), 'statements', ND_PROPOSAL), { statement: 'mine now' }),
			);
		});

		it('a student cannot rate as a no-device student', async () => {
			await assertFails(
				setDoc(doc(as(STUDENT), 'evaluations', `${ND}--${PROPOSAL}`), {
					evaluationId: `${ND}--${PROPOSAL}`,
					parentId: CH,
					statementId: PROPOSAL,
					evaluatorId: ND,
					evaluation: 1,
					updatedAt: T0,
				}),
			);
		});
	});
});
