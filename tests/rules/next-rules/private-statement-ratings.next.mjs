/**
 * STAGE 1 NOTE (private-level reads, `accessScope`): this file tests the NEW
 * firestore.rules from `fix/private-statement-reads`, which are NOT on dev yet.
 * Stage 1 shipped the stamping, the backfill, the indexes and the clients but
 * kept dev's old rules, so these assertions fail against the rules on dev.
 * That is why the file is named `*.next.mjs` and lives in `next-rules/`:
 * `npm run test:rules` (node --test) does not pick it up.
 *
 * The rules ship LAST, after Tal's separate yes, from `fix/private-statement-reads`
 * rebased onto dev at that time. See docs/security/access-scope-release.md,
 * "Stage 2: the rules". Shipping them reverts the stage-1 commit that restored
 * dev's rules, which moves this file back to `tests/rules/*.test.mjs`.
 * Run it against the new rules only: `npm run test:rules:next`.
 */
import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, increment, setDoc } from 'firebase/firestore';
import { makeEnv, seed, statementDoc } from '../helpers.mjs';

/**
 * Writes tied to a statement inside a private level (ratings, votes) need a way
 * into the level, as writing a statement there does.
 *
 *   root (open) -> pg (secret) -> q -> a        root -> oq -> oa
 */
const PEOPLE = {
	member: 'member',
	outsider: 'outsider',
	waiting: 'waiting-person',
	banned: 'banned-person',
	host: 'top-host',
};

function rating(uid, statementId, parentId) {
	return {
		evaluationId: `${uid}--${statementId}`,
		parentId,
		statementId,
		evaluatorId: uid,
		evaluator: { uid },
		evaluation: 1,
		updatedAt: 1_700_000_000_000,
	};
}

function vote(uid, parentId, statementId) {
	return { voteId: `${uid}--${parentId}`, userId: uid, parentId, statementId, lastUpdate: 1 };
}

describe('ratings and votes inside a private level', () => {
	let env;
	const db = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore();
	const anonymous = () => env.authenticatedContext('anon', { firebase: { sign_in_provider: 'anonymous' } }).firestore();

	before(async () => {
		env = await makeEnv('private-statement-ratings');
		await seed(env, async (store) => {
			const put = (id, fields) => setDoc(doc(store, 'statements', id), statementDoc({ statementId: id, uid: 'owner', overrides: fields }));
			await put('root', { statementType: 'group', parentId: 'top', topParentId: 'root', parents: [], accessScope: 'open' });
			await put('pg', { statementType: 'group', parentId: 'root', topParentId: 'root', parents: ['root'], accessScope: 'pg', membership: { access: 'secret' } });
			await put('q', { statementType: 'question', parentId: 'pg', topParentId: 'root', parents: ['root', 'pg'], accessScope: 'pg' });
			await put('a', { parentId: 'q', topParentId: 'root', parents: ['root', 'pg', 'q'], accessScope: 'pg' });
			await put('oq', { statementType: 'question', parentId: 'root', topParentId: 'root', parents: ['root'], accessScope: 'open' });
			await put('oa', { parentId: 'oq', topParentId: 'root', parents: ['root', 'oq'], accessScope: 'open' });
			await put('legacy', { parentId: 'oq', topParentId: 'root', parents: ['root', 'oq'] });
			for (const [uid, id, role] of [
				[PEOPLE.member, 'pg', 'member'],
				[PEOPLE.waiting, 'pg', 'waiting'],
				[PEOPLE.banned, 'pg', 'banned'],
				[PEOPLE.host, 'root', 'admin'],
			]) {
				await setDoc(doc(store, 'statementsSubscribe', `${uid}--${id}`), { userId: uid, statementId: id, role, user: { uid } });
			}
			await setDoc(doc(store, 'usersV2', 'sys'), { systemAdmin: true });
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	describe('rating an answer inside the private level', () => {
		for (const uid of [PEOPLE.member, PEOPLE.host, 'sys']) {
			it(`works for ${uid}`, async () => {
				await assertSucceeds(setDoc(doc(db(uid), 'evaluations', `${uid}--a`), rating(uid, 'a', 'q')));
			});
		}
		for (const uid of [PEOPLE.outsider, PEOPLE.waiting, PEOPLE.banned]) {
			it(`is refused to ${uid}`, async () => {
				await assertFails(setDoc(doc(db(uid), 'evaluations', `${uid}--a`), rating(uid, 'a', 'q')));
			});
		}
		it('is refused to an anonymous visitor', async () => {
			await assertFails(setDoc(doc(anonymous(), 'evaluations', 'anon--a'), rating('anon', 'a', 'q')));
		});
	});

	describe('rating an open answer', () => {
		it('still works for anyone signed in, an anonymous visitor too', async () => {
			await assertSucceeds(setDoc(doc(db(PEOPLE.outsider), 'evaluations', 'outsider--oa'), rating(PEOPLE.outsider, 'oa', 'oq')));
			await assertSucceeds(setDoc(doc(anonymous(), 'evaluations', 'anon--oa'), rating('anon', 'oa', 'oq')));
		});
		it('works on a statement not stamped yet', async () => {
			await assertSucceeds(setDoc(doc(db(PEOPLE.outsider), 'evaluations', 'outsider--legacy'), rating(PEOPLE.outsider, 'legacy', 'oq')));
		});
	});

	describe('voting on a question inside the private level', () => {
		it('works for a member', async () => {
			await assertSucceeds(setDoc(doc(db(PEOPLE.member), 'votes', 'member--q'), vote(PEOPLE.member, 'q', 'a')));
		});
		for (const uid of [PEOPLE.outsider, PEOPLE.waiting, PEOPLE.banned]) {
			it(`is refused to ${uid}`, async () => {
				await assertFails(setDoc(doc(db(uid), 'votes', `${uid}--q`), vote(uid, 'q', 'a')));
			});
		}
		it('on an open question still works for anyone signed in', async () => {
			await assertSucceeds(setDoc(doc(db(PEOPLE.outsider), 'votes', 'outsider--oq'), vote(PEOPLE.outsider, 'oq', 'oa')));
		});
	});

	describe('collections tied to a statement that clients no longer use', () => {
		for (const name of ['agrees', 'importance', 'statementSegments', 'statementsSignatures', 'statementRoomsAsked', 'statementEvaluators']) {
			it(`${name} is closed`, async () => {
				await assertFails(setDoc(doc(db(PEOPLE.member), name, 'x'), { statementId: 'a' }));
				await assertFails(getDoc(doc(db(PEOPLE.member), name, 'x')));
			});
		}
		it('statementsMeta and approval take no client writes', async () => {
			await assertFails(setDoc(doc(db(PEOPLE.member), 'statementsMeta', 'a'), { numberOfMembers: 1 }));
			await assertFails(setDoc(doc(db(PEOPLE.member), 'approval', 'x'), { statementId: 'a' }));
		});
		it('a question view is the person’s own, and its count grows by one', async () => {
			const view = (uid, viewed) => ({ statementId: 'q', userId: uid, viewed, lastViewed: 1 });
			const mine = doc(db(PEOPLE.member), 'statementViews', 'member--q');
			await assertSucceeds(setDoc(mine, { ...view(PEOPLE.member, increment(1)), parentDocumentId: 'root' }, { merge: true }));
			await assertSucceeds(setDoc(mine, view(PEOPLE.member, increment(1)), { merge: true }));
			await assertSucceeds(getDoc(mine));
			await assertFails(setDoc(mine, view(PEOPLE.member, 1000), { merge: true }));
			await assertFails(setDoc(mine, view(PEOPLE.member, 'many'), { merge: true }));
			await assertFails(setDoc(mine, view(PEOPLE.outsider, increment(1)), { merge: true }));
			await assertFails(setDoc(doc(db(PEOPLE.member), 'statementViews', 'member--oq'), { ...view(PEOPLE.member, 1), statementId: 'q' }));
			await assertFails(setDoc(doc(db(PEOPLE.outsider), 'statementViews', 'member--q'), view(PEOPLE.member, 1)));
			await assertFails(getDoc(doc(db(PEOPLE.outsider), 'statementViews', 'member--q')));
		});
	});
});
