import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, query, setDoc, updateDoc, where } from 'firebase/firestore';
import { makeEnv, seed, statementDoc } from './helpers.mjs';

/**
 * join-class replies on a proposal (IA 22):
 *  - a reply (statement with `classReply`) is written only by classPostReply:
 *    no client creates one, and nobody (not even its writer) edits or deletes it;
 *  - the proposal's counters (replyCount, lastReplyAt, replyPushAt,
 *    replyPushCount) are server-only, while the author still edits the text;
 *  - the student writes their own read mark (proposalRepliesReadAt, a number);
 *  - members of the lesson read the replies.
 */
describe('join-class replies rules', () => {
	let env;

	const TEACHER = 'u-teacher';
	const AUTHOR = 'u-author';
	const MATE = 'u-mate';
	const MAIN = 'main-replies';
	const CH = 'ch-replies';
	const PROPOSAL = 'prop-1';
	const REPLY = 'reply-1';
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

	const proposal = statementDoc({
		statementId: PROPOSAL,
		uid: AUTHOR,
		overrides: { parentId: CH, topParentId: MAIN, parents: [MAIN, CH], replyCount: 1, lastReplyAt: T0 },
	});

	const replyDoc = (id, uid) =>
		statementDoc({
			statementId: id,
			uid,
			overrides: {
				statementType: 'statement',
				parentId: PROPOSAL,
				topParentId: MAIN,
				parents: [MAIN, CH, PROPOSAL],
				classReply: { role: 'class', proposalCreatorId: AUTHOR },
			},
		});

	before(async () => {
		env = await makeEnv('join-class-replies');
		await seed(env, async (db) => {
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
			await setDoc(doc(db, 'statementsSubscribe', `${AUTHOR}--${MAIN}`), sub(AUTHOR, 'member'));
			await setDoc(doc(db, 'statementsSubscribe', `${MATE}--${MAIN}`), sub(MATE, 'member'));
			await setDoc(doc(db, 'statements', CH), {
				statementId: CH,
				parentId: MAIN,
				topParentId: MAIN,
				statementType: 'question',
				statementSettings: { classRole: 'challenge' },
			});
			await setDoc(doc(db, 'statements', PROPOSAL), proposal);
			await setDoc(doc(db, 'statements', REPLY), replyDoc(REPLY, MATE));
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	it('lets members read the replies of a proposal', async () => {
		await assertSucceeds(getDoc(doc(as(AUTHOR), 'statements', REPLY)));
		await assertSucceeds(
			getDocs(query(collection(as(MATE), 'statements'), where('parentId', '==', PROPOSAL))),
		);
	});

	it('denies a client creating a reply, even as itself', async () => {
		await assertFails(setDoc(doc(as(MATE), 'statements', 'reply-x'), replyDoc('reply-x', MATE)));
	});

	it('denies a client creating a statement that carries reply counters', async () => {
		await assertFails(
			setDoc(
				doc(as(AUTHOR), 'statements', 'prop-x'),
				statementDoc({ statementId: 'prop-x', uid: AUTHOR, overrides: { replyCount: 5 } }),
			),
		);
	});

	it('still lets a student create a plain option outside the challenge', async () => {
		await assertSucceeds(
			setDoc(doc(as(MATE), 'statements', 'prop-plain'), statementDoc({ statementId: 'prop-plain', uid: MATE })),
		);
	});

	it('denies the writer editing, un-hiding or deleting their reply', async () => {
		await assertFails(updateDoc(doc(as(MATE), 'statements', REPLY), { statement: 'changed' }));
		await assertFails(updateDoc(doc(as(MATE), 'statements', REPLY), { hide: false }));
		await assertFails(deleteDoc(doc(as(MATE), 'statements', REPLY)));
	});

	it('lets the author touch the proposal but not its text (classEditProposal) or its reply counters', async () => {
		await assertSucceeds(
			updateDoc(doc(as(AUTHOR), 'statements', PROPOSAL), { lastUpdate: T0 + 1 }),
		);
		await assertFails(
			updateDoc(doc(as(AUTHOR), 'statements', PROPOSAL), { statement: 'better', lastUpdate: T0 + 1 }),
		);
		await assertFails(updateDoc(doc(as(AUTHOR), 'statements', PROPOSAL), { replyCount: 0 }));
		await assertFails(updateDoc(doc(as(AUTHOR), 'statements', PROPOSAL), { replyPushCount: 0 }));
		await assertFails(updateDoc(doc(as(AUTHOR), 'statements', PROPOSAL), { replyPushAt: 0 }));
	});

	it('lets a student write their own read mark, as a number only', async () => {
		await assertSucceeds(
			updateDoc(doc(as(AUTHOR), 'statementsSubscribe', `${AUTHOR}--${MAIN}`), {
				proposalRepliesReadAt: T0 + 5,
				lastUpdate: T0 + 5,
			}),
		);
		await assertFails(
			updateDoc(doc(as(AUTHOR), 'statementsSubscribe', `${AUTHOR}--${MAIN}`), {
				proposalRepliesReadAt: 'now',
			}),
		);
		await assertFails(
			updateDoc(doc(as(MATE), 'statementsSubscribe', `${AUTHOR}--${MAIN}`), {
				proposalRepliesReadAt: T0 + 6,
			}),
		);
	});
});
