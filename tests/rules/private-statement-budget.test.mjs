import { after, before, describe, it } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc, updateDoc, writeBatch } from 'firebase/firestore';
import { makeEnv, seed, statementDoc } from './helpers.mjs';

/**
 * Ordinary writes inside a private level stay within what one request may
 * evaluate: 1000 expressions, and ten document reads for one write (twenty for
 * a batch), where exists() and get() of the same document count as two.
 *
 *   root (open) -> l1 .. l5 (open) -> G (moderated, its own scope) -> q -> s -> a, a2
 *   pt (moderated top) -> p1, p2 -> po (an answer)
 */
const OPEN_LEVELS = 5;
const CHAIN = ['top', 'root', ...Array.from({ length: OPEN_LEVELS }, (_, i) => `l${i + 1}`)];

function subscription(uid, statementId, role) {
	return { userId: uid, statementId, role, user: { uid } };
}

describe('ordinary writes inside a private level fit the limits', () => {
	let env;
	const db = (uid) => env.authenticatedContext(uid).firestore();
	const make = (uid, id, fields) => statementDoc({ statementId: id, uid, overrides: fields });
	const inG = (more = []) => ({ topParentId: 'root', parents: [...CHAIN, 'G', ...more], accessScope: 'G' });

	before(async () => {
		env = await makeEnv('private-statement-budget');
		await seed(env, async (store) => {
			const put = (id, uid, fields) => setDoc(doc(store, 'statements', id), make(uid, id, fields));
			await put('root', 'owner', { statementType: 'group', parentId: 'top', topParentId: 'root', parents: [], accessScope: 'open', membership: { access: 'openToAll' } });
			for (let i = 1; i <= OPEN_LEVELS; i++) {
				await put(`l${i}`, 'owner', { statementType: 'group', parentId: CHAIN[i], topParentId: 'root', parents: CHAIN.slice(0, i + 1), accessScope: 'open', membership: { access: 'openToAll' } });
			}
			await put('G', 'owner', { statementType: 'group', parentId: CHAIN.at(-1), topParentId: 'root', parents: CHAIN, accessScope: 'G', membership: { access: 'moderated' } });
			await put('q', 'member', { statementType: 'question', parentId: 'G', ...inG() });
			await put('s', 'member', { statementType: 'question', parentId: 'q', ...inG(['q']) });
			for (const id of ['a', 'a2']) await put(id, 'member', { parentId: 's', ...inG(['q', 's']) });
			await put('pt', 'owner', { statementType: 'group', parentId: 'top', topParentId: 'pt', parents: [], accessScope: 'pt', membership: { access: 'moderated' } });
			for (const id of ['p1', 'p2']) await put(id, 'member', { statementType: 'question', parentId: 'pt', topParentId: 'pt', parents: ['pt'], accessScope: 'pt' });
			await put('po', 'member', { parentId: 'p1', topParentId: 'pt', parents: ['pt', 'p1'], accessScope: 'pt' });
			for (const [uid, id, role] of [
				['member', 'G', 'member'],
				['member', 'pt', 'member'],
				['owner', 'root', 'admin'],
				['owner', 'pt', 'admin'],
				['g-admin', 'G', 'admin'],
				// A host four levels above G: rule A lets them in, and the rules still see
				// it (they read G's four nearest ancestors).
				['mid-host', 'l2', 'admin'],
			]) {
				await setDoc(doc(store, 'statementsSubscribe', `${uid}--${id}`), subscription(uid, id, role));
			}
			await setDoc(doc(store, 'usersV2', 'sys'), { systemAdmin: true });
			await setDoc(doc(store, 'usersV2', 'member'), { systemAdmin: false });
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	describe('creating an answer five open levels down', () => {
		for (const uid of ['member', 'g-admin', 'owner', 'mid-host', 'sys']) {
			it(`works for ${uid}`, async () => {
				const id = `o-${uid}`;
				await assertSucceeds(setDoc(doc(db(uid), 'statements', id), make(uid, id, { parentId: 's', ...inG(['q', 's']) })));
			});
		}

		it('is refused to an outsider', async () => {
			await assertFails(setDoc(doc(db('outsider'), 'statements', 'o-x'), make('outsider', 'o-x', { parentId: 's', ...inG(['q', 's']) })));
		});
	});

	describe('moving a member’s answer between questions inside the private level', () => {
		it('works for a host of the top, five open levels down', async () => {
			await assertSucceeds(updateDoc(doc(db('owner'), 'statements', 'a2'), { parentId: 'q', parents: [...CHAIN, 'G', 'q'] }));
		});

		it('works for a host of a private top', async () => {
			await assertSucceeds(updateDoc(doc(db('owner'), 'statements', 'po'), { parentId: 'p2', parents: ['pt', 'p2'] }));
		});

		it('works for a system admin', async () => {
			await assertSucceeds(updateDoc(doc(db('sys'), 'statements', 'a2'), { parentId: 's', parents: [...CHAIN, 'G', 'q', 's'] }));
		});
	});

	describe('batches', () => {
		it('accepts a question and 17 paragraphs inside the private level', async () => {
			const m = db('member');
			const batch = writeBatch(m);
			batch.set(doc(m, 'statements', 'bq'), make('member', 'bq', { statementType: 'question', parentId: 'G', ...inG() }));
			for (let i = 0; i < 17; i++) {
				batch.set(doc(m, 'statements', `bq-p${i}`), make('member', `bq-p${i}`, { statementType: 'paragraph', parentId: 'bq', topParentId: 'root', parents: ['root', 'bq'], accessScope: 'G' }));
			}
			await assertSucceeds(batch.commit());
		});

		it('accepts an Odyssey seed of a root, 8 islands and 4 stances each', async () => {
			const t = db('teacher');
			const batch = writeBatch(t);
			batch.set(doc(t, 'statements', 'R'), make('teacher', 'R', { statementType: 'question', parentId: 'top', topParentId: 'top', parents: ['top'], accessScope: 'open' }));
			for (let i = 0; i < 8; i++) {
				batch.set(doc(t, 'statements', `R-i${i}`), make('teacher', `R-i${i}`, { statementType: 'question', parentId: 'R', topParentId: 'R', parents: ['R'], accessScope: 'open' }));
				for (let j = 0; j < 4; j++) {
					batch.set(doc(t, 'statements', `R-i${i}-s${j}`), make('teacher', `R-i${i}-s${j}`, { parentId: `R-i${i}`, topParentId: 'R', parents: ['R', `R-i${i}`], accessScope: 'open' }));
				}
			}
			await assertSucceeds(batch.commit());
		});
	});
});
