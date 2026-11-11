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
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { makeEnv, seed, statementDoc } from '../helpers.mjs';

/**
 * A subscription carries a copy of its statement, so it is read only by its
 * owner, by people in the statement (a member, a host), by a host of its top,
 * and by system admins.
 *
 *   root (open) -> pg (secret) -> q
 */
const PRIVATE_TEXT = 'what the private group said';

describe('reading /statementsSubscribe', () => {
	let env;
	const db = (uid) => env.authenticatedContext(uid).firestore();
	const subs = (uid) => collection(db(uid), 'statementsSubscribe');

	before(async () => {
		env = await makeEnv('subscription-reads');
		await seed(env, async (store) => {
			const put = (id, fields) => setDoc(doc(store, 'statements', id), statementDoc({ statementId: id, uid: 'owner', overrides: fields }));
			await put('root', { statementType: 'group', parentId: 'top', topParentId: 'root', parents: [], accessScope: 'open' });
			await put('pg', { statementType: 'group', parentId: 'root', topParentId: 'root', parents: ['root'], accessScope: 'pg', membership: { access: 'secret' } });
			await put('q', { statementType: 'question', parentId: 'pg', topParentId: 'root', parents: ['root', 'pg'], accessScope: 'pg' });
			for (const [uid, id, role] of [
				['member', 'pg', 'member'],
				['member2', 'pg', 'member'],
				['pg-admin', 'pg', 'admin'],
				['top-host', 'root', 'admin'],
				['waiting', 'pg', 'waiting'],
				['banned', 'pg', 'banned'],
				['member', 'q', 'member'],
			]) {
				await setDoc(doc(store, 'statementsSubscribe', `${uid}--${id}`), {
					userId: uid,
					statementId: id,
					role,
					user: { uid },
					statement: { statementId: id, statement: PRIVATE_TEXT },
				});
			}
			await setDoc(doc(store, 'usersV2', 'sys'), { systemAdmin: true });
		});
	});

	after(async () => {
		await env?.cleanup();
	});

	it('the owner reads their own, by id and by userId', async () => {
		await assertSucceeds(getDoc(doc(db('member'), 'statementsSubscribe', 'member--pg')));
		await assertSucceeds(getDocs(query(subs('member'), where('userId', '==', 'member'))));
	});

	it('anyone may ask for a subscription of their own that does not exist yet', async () => {
		await assertSucceeds(getDoc(doc(db('outsider'), 'statementsSubscribe', 'outsider--pg')));
	});

	it('a stranger learns nothing from a get: someone else’s missing and existing subscriptions are both refused', async () => {
		await assertFails(getDoc(doc(db('outsider'), 'statementsSubscribe', 'member--pg')));
		await assertFails(getDoc(doc(db('outsider'), 'statementsSubscribe', 'never-joined--pg')));
	});

	it('a host of the private level lists the people of a question under it, holding no subscription there', async () => {
		await assertSucceeds(getDocs(query(subs('pg-admin'), where('statementId', '==', 'q'))));
		await assertSucceeds(getDoc(doc(db('pg-admin'), 'statementsSubscribe', 'member--q')));
	});

	it('a stranger cannot read anyone else’s, nor list a group’s members', async () => {
		await assertFails(getDoc(doc(db('outsider'), 'statementsSubscribe', 'member--pg')));
		await assertFails(getDocs(query(subs('outsider'), where('statementId', '==', 'pg'))));
		await assertFails(getDocs(query(subs('outsider'), where('userId', '==', 'member'))));
	});

	it('someone waiting or banned cannot list the members either', async () => {
		await assertFails(getDocs(query(subs('waiting'), where('statementId', '==', 'pg'))));
		await assertFails(getDocs(query(subs('banned'), where('statementId', '==', 'pg'))));
	});

	it('a member lists the others in the statement (join-class roster, table-mates)', async () => {
		await assertSucceeds(getDocs(query(subs('member'), where('statementId', '==', 'pg'))));
		await assertSucceeds(getDoc(doc(db('member'), 'statementsSubscribe', 'member2--pg')));
	});

	it('a host of the level and a host of the top list them (people screens)', async () => {
		await assertSucceeds(getDocs(query(subs('pg-admin'), where('statementId', '==', 'pg'))));
		await assertSucceeds(getDocs(query(subs('top-host'), where('statementId', '==', 'q'))));
		await assertSucceeds(getDoc(doc(db('pg-admin'), 'statementsSubscribe', 'banned--pg')));
	});

	it('a system admin reads any of them, whole-collection queries too', async () => {
		await assertSucceeds(getDocs(query(subs('sys'), where('role', '==', 'admin'))));
	});

	it('nobody lists the whole collection without naming a person or a statement', async () => {
		await assertFails(getDocs(query(subs('member'), where('role', '==', 'admin'))));
	});
});
