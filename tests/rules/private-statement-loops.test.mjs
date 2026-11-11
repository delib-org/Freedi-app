import { after, before, beforeEach, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
	collection,
	deleteDoc,
	doc,
	getDocs,
	query,
	setDoc,
	updateDoc,
	where,
	writeBatch,
} from 'firebase/firestore';
import { makeEnv, seed, statementDoc } from './helpers.mjs';

/**
 * A statement's place in the tree cannot loop back on itself, a private
 * statement cannot be deleted and made again as an open one, and a quarantined
 * statement (the stamp the server puts on a loop) is listed to no one.
 *
 *   root (open) -> pg (secret, its own scope) -> q (made by `leaver`) -> a
 *   root -> oq (open)
 */
const ROOT = 'root';
const PG = 'pg';

function subscription(uid, statementId, role) {
	return { userId: uid, statementId, role, user: { uid } };
}

describe('loops, deletes and quarantine in /statements', () => {
	let env;
	const db = (uid) => env.authenticatedContext(uid).firestore();
	const create = (uid, id, fields) =>
		setDoc(doc(db(uid), 'statements', id), statementDoc({ statementId: id, uid, overrides: fields }));
	const forgedInPg = { topParentId: ROOT, parents: ['top', ROOT, PG], accessScope: 'open' };

	before(async () => {
		env = await makeEnv('private-statement-loops');
	});

	beforeEach(async () => {
		await env.clearFirestore();
		await seed(env, async (store) => {
			const put = (id, uid, fields) =>
				setDoc(doc(store, 'statements', id), statementDoc({ statementId: id, uid, overrides: fields }));
			await put(ROOT, 'owner', {
				statementType: 'group',
				parentId: 'top',
				topParentId: ROOT,
				parents: [],
				accessScope: 'open',
				membership: { access: 'openToAll' },
			});
			await put(PG, 'owner', {
				statementType: 'group',
				parentId: ROOT,
				topParentId: ROOT,
				parents: [ROOT],
				accessScope: PG,
				membership: { access: 'secret' },
			});
			await put('q', 'leaver', {
				statementType: 'question',
				parentId: PG,
				topParentId: ROOT,
				parents: [ROOT, PG],
				accessScope: PG,
			});
			await put('a', 'member', {
				parentId: 'q',
				topParentId: ROOT,
				parents: [ROOT, PG, 'q'],
				accessScope: PG,
			});
			await put('oq', 'owner', {
				statementType: 'question',
				parentId: ROOT,
				topParentId: ROOT,
				parents: [ROOT],
				accessScope: 'open',
			});
			await put('loop', 'outsider', {
				statementType: 'question',
				parentId: 'loop2',
				...forgedInPg,
				accessScope: 'quarantined',
			});
			await put('loop-reply', 'member', {
				parentId: 'loop',
				...forgedInPg,
				accessScope: 'quarantined',
			});
			for (const [uid, id, role] of [
				['member', PG, 'member'],
				['owner', PG, 'admin'],
				['owner', ROOT, 'admin'],
				['leaver', 'q', 'admin'],
				['outsider', 'loop', 'admin'],
			]) {
				await setDoc(doc(store, 'statementsSubscribe', `${uid}--${id}`), subscription(uid, id, role));
			}
			await setDoc(doc(store, 'usersV2', 'sys'), { systemAdmin: true });
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	describe('a statement is never its own ancestor', () => {
		it('refuses a statement that names itself as parent', async () => {
			await assertFails(create('outsider', 'S', { parentId: 'S', ...forgedInPg }));
		});

		it('refuses moving a statement under itself', async () => {
			await create('outsider', 'T', { parentId: 'top', topParentId: 'T', parents: [], accessScope: 'open' });
			await assertFails(
				updateDoc(doc(db('outsider'), 'statements', 'T'), { parentId: 'T', topParentId: ROOT, parents: ['top', ROOT, PG] }),
			);
		});

		it('refuses two statements swapped under each other in one batch', async () => {
			for (const id of ['A', 'B']) {
				await create('outsider', id, { parentId: 'top', topParentId: id, parents: [], accessScope: 'open' });
			}
			const out = db('outsider');
			const batch = writeBatch(out);
			batch.update(doc(out, 'statements', 'A'), { parentId: 'B', topParentId: ROOT, parents: ['top', ROOT, PG, 'B'] });
			batch.update(doc(out, 'statements', 'B'), { parentId: 'A', topParentId: ROOT, parents: ['top', ROOT, PG, 'A'] });
			await assertFails(batch.commit());
		});

		it('refuses a batch of new statements that closes a loop of three', async () => {
			const out = db('outsider');
			const batch = writeBatch(out);
			for (const [id, parentId] of [['X1', 'X2'], ['X2', 'X3'], ['X3', 'X1']]) {
				batch.set(
					doc(out, 'statements', id),
					statementDoc({ statementId: id, uid: 'outsider', overrides: { parentId, ...forgedInPg, parents: ['top', ROOT, PG, parentId] } }),
				);
			}
			await assertFails(batch.commit());
		});

		it('still accepts a new root, its child and its grandchild in one batch (Odyssey seeds)', async () => {
			const out = db('outsider');
			const batch = writeBatch(out);
			const docs = [
				['G', { parentId: 'top', topParentId: 'G', parents: [], accessScope: 'open', statementType: 'question' }],
				['G1', { parentId: 'G', topParentId: 'G', parents: ['G'], accessScope: 'open', statementType: 'question' }],
				['G2', { parentId: 'G1', topParentId: 'G', parents: ['G', 'G1'], accessScope: 'open' }],
			];
			for (const [id, fields] of docs) {
				batch.set(doc(out, 'statements', id), statementDoc({ statementId: id, uid: 'outsider', overrides: fields }));
			}
			await assertSucceeds(batch.commit());
		});

		it('refuses the id the server uses for quarantine', async () => {
			await assertFails(
				create('outsider', 'quarantined', { parentId: 'top', topParentId: 'quarantined', parents: [], accessScope: 'open' }),
			);
		});
	});

	describe('a quarantined statement', () => {
		const list = (uid, ...constraints) =>
			getDocs(query(collection(db(uid), 'statements'), ...constraints));

		it('is listed to no one by its scope', async () => {
			await assertFails(list('member', where('parentId', '==', 'loop'), where('accessScope', 'in', ['open', 'quarantined'])));
			await assertFails(list('outsider', where('accessScope', '==', 'quarantined')));
		});

		it('gives a host of the loop itself nothing below it', async () => {
			await assertFails(list('outsider', where('parentId', '==', 'loop')));
		});

		it('has no answers anyone can list', async () => {
			await assertFails(list('stranger', where('parentId', '==', 'loop'), where('statementType', '==', 'option')));
		});

		it('takes no new children', async () => {
			await assertFails(create('member', 'r2', { parentId: 'loop', ...forgedInPg, parents: ['top', ROOT, PG, 'loop'], accessScope: 'quarantined' }));
		});

		it('is still listed to a system admin', async () => {
			await assertSucceeds(list('sys', where('parentId', '==', 'loop')));
		});
	});

	describe('deleting inside a private level', () => {
		it('needs a way into it: a creator who left cannot delete their question', async () => {
			await assertFails(deleteDoc(doc(db('leaver'), 'statements', 'q')));
		});

		it('is open to a host of the private level', async () => {
			await assertSucceeds(deleteDoc(doc(db('owner'), 'statements', 'q')));
		});

		it('is open to a system admin', async () => {
			await assertSucceeds(deleteDoc(doc(db('sys'), 'statements', 'a')));
		});

		it('still lets anyone with the right delete in an open space', async () => {
			await assertSucceeds(deleteDoc(doc(db('owner'), 'statements', 'oq')));
		});
	});

	describe('an id deleted from a private level', () => {
		beforeEach(async () => {
			await seed(env, async (store) => {
				await setDoc(doc(store, 'statementDeletions', 'gone'), {
					statementId: 'gone',
					parentId: PG,
					deletedAtMs: 1,
					accessScope: PG,
				});
				await setDoc(doc(store, 'statementDeletions', 'gone-open'), {
					statementId: 'gone-open',
					parentId: 'oq',
					deletedAtMs: 1,
					accessScope: 'open',
				});
			});
		});

		// The rules no longer read the tombstone (one read per statement broke
		// batches of 15 or more); the create trigger quarantines a reused id
		// (functions/src/accessScope/recreatedStatements.ts).
		it('can be made again; the server judges it, not the rules', async () => {
			await assertSucceeds(create('leaver', 'gone', { parentId: 'top', topParentId: 'gone', parents: [], accessScope: 'open' }));
		});

		it('an id deleted from an open space can', async () => {
			await assertSucceeds(
				create('leaver', 'gone-open', { parentId: 'top', topParentId: 'gone-open', parents: [], accessScope: 'open' }),
			);
		});
	});

	describe('a join request on a moderated level that names itself', () => {
		beforeEach(async () => {
			await seed(env, async (store) => {
				await setDoc(
					doc(store, 'statements', 'pt'),
					statementDoc({
						statementId: 'pt',
						uid: 'owner',
						overrides: {
							statementType: 'group',
							parentId: 'top',
							topParentId: 'pt',
							parents: [],
							accessScope: 'pt',
							membership: { access: 'moderated' },
						},
					}),
				);
			});
		});

		const join = (uid, role) =>
			setDoc(doc(db(uid), 'statementsSubscribe', `${uid}--pt`), subscription(uid, 'pt', role));

		it('accepts a waiting request on the level itself', async () => {
			await assertSucceeds(join('newbie', 'waiting'));
		});

		it('still refuses joining it straight as a member', async () => {
			await assertFails(join('newbie', 'member'));
		});

		it('lets the person drop back to waiting, and not raise themselves', async () => {
			await join('newbie', 'waiting');
			const ref = doc(db('newbie'), 'statementsSubscribe', 'newbie--pt');
			await assertFails(updateDoc(ref, { role: 'member' }));
			await assertSucceeds(updateDoc(ref, { role: 'waiting', lastUpdate: 2 }));
		});
	});
});
