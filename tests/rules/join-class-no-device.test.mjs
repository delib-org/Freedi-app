import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc } from 'firebase/firestore';
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
	const MAIN = 'main-nd';
	const CH = 'ch-nd';
	const GUIDING = 'guiding-nd';
	const PROPOSAL = 'prop-student';
	const ND_PROPOSAL = 'prop-nd';
	const ANSWER = 'answer-student';
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

		it('a student cannot stamp or hand over their own table-talk answer', async () => {
			const ref = doc(as(STUDENT), 'statements', ANSWER);
			await assertFails(updateDoc(ref, { 'classTable.enteredByUid': TEACHER }));
			await assertFails(updateDoc(ref, { creatorId: ND }));
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
