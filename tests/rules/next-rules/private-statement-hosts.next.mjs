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
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import {
	and,
	collection,
	doc,
	documentId,
	getCountFromServer,
	getDoc,
	getDocs,
	limit,
	or,
	orderBy,
	query,
	setDoc,
	startAt,
	updateDoc,
	where,
} from 'firebase/firestore';
import { statementDoc, seed } from '../helpers.mjs';
import {
	ADMIN,
	ANONYMOUS,
	BANNED,
	CREATOR,
	HOST,
	MEMBER,
	OUTSIDER,
	PEOPLE,
	SCANS,
	SHAPES,
	SIGNED_OUT,
	SPACES,
	UNSCOPED,
	WAITING,
	inScopes,
	labelOf,
	mayEnter,
	typeIsQuestionOrOption,
	useWorld,
} from './privateReadsWorld.mjs';

describe('listing /statements: hosts and named shapes', () => {
	const { world, contextOf, statementsAs, subscribe } = useWorld('private-statement-hosts');

	describe('hosts', () => {
		it('lists every child of a level under what it hosts, with no scope', async () => {
			await assertSucceeds(getDocs(query(statementsAs(HOST), where('parentId', '==', 'pg-q'))));
		});

		it('lists a whole tree it tops, with no scope', async () => {
			await assertSucceeds(getDocs(query(statementsAs(HOST), where('topParentId', '==', 'pg-root'))));
		});

		it('finds the private levels of a tree it tops', async () => {
			const snapshot = await assertSucceeds(
				getDocs(query(statementsAs(HOST), where('topParentId', '==', 'pg-root'), where('membership.access', 'in', ['moderated', 'secret']))),
			);
			assert.deepEqual(snapshot.docs.map((d) => d.id), ['pg']);
		});

		it('a member of a level is not a host of it', async () => {
			await assertFails(getDocs(query(statementsAs(MEMBER), where('parentId', '==', 'pg-q'))));
			await assertFails(getDocs(query(statementsAs(MEMBER), where('topParentId', '==', 'pg-root'))));
		});

		it('a ban anywhere in the tree beats a host role', async () => {
			await seed(world.env, (db) => subscribe(db, 'banned-host', 'pg-root', 'admin'));
			await seed(world.env, (db) => subscribe(db, 'banned-host', 'pg', 'banned'));
			await assertFails(getDocs(query(statementsAs('banned-host'), where('parents', 'array-contains', 'pg-q'), where('accessScope', '==', 'pg'))));
		});

		it('a ban above a member keeps them out', async () => {
			await seed(world.env, (db) => subscribe(db, 'banned-above', 'pg-root', 'banned'));
			await seed(world.env, (db) => subscribe(db, 'banned-above', 'pg', 'member'));
			await assertFails(getDocs(query(statementsAs('banned-above'), where('parents', 'array-contains', 'pg-q'), where('accessScope', '==', 'pg'))));
		});

		it('the creator of a private level reads it only with a role there (rule A)', async () => {
			await assertFails(getDocs(query(statementsAs(CREATOR), where('parents', 'array-contains', 'pg-q'), where('accessScope', '==', 'pg'))));
		});

		it('allows a host deep in a tree, within the read limit', async () => {
			await seed(world.env, async (db) => {
				const parents = ['deep-0', 'deep-1', 'deep-2', 'deep-3', 'deep-4'];
				await setDoc(doc(db, 'statements', 'deep-5'), statementDoc({ statementId: 'deep-5', uid: CREATOR, overrides: { parentId: 'deep-4', topParentId: 'deep-0', parents, accessScope: 'deep-5', membership: { access: 'secret' } } }));
				await subscribe(db, 'deep-host', 'deep-3', 'admin');
			});
			await assertSucceeds(getDocs(query(statementsAs('deep-host'), where('accessScope', '==', 'deep-5'))));
		});
	});

	describe('system admins', () => {
		for (const [name, build] of Object.entries(SCANS).slice(0, 3)) {
			it(`may run ${name}`, async () => {
				await assertSucceeds(getDocs(build(statementsAs(ADMIN))));
			});
		}

		it('may count the whole collection', async () => {
			await assertSucceeds(getCountFromServer(statementsAs(ADMIN)));
		});

		it('may read any scope', async () => {
			await assertSucceeds(getDocs(query(statementsAs(ADMIN), where('accessScope', '==', 'pg'))));
		});
	});

	describe('other named shapes', () => {
		it('by id: the same as get, for anyone', async () => {
			const C = statementsAs(OUTSIDER);
			await assertSucceeds(getDocs(query(C, where(documentId(), 'in', ['pg-q', 'pg-a']))));
			await assertSucceeds(getDocs(query(C, where('__name__', '==', 'pg-q'))));
			await assertSucceeds(getDocs(query(C, where('statementId', '==', 'pg-q'))));
		});

		it('Agora: session plus open', async () => {
			await assertSucceeds(getDocs(query(statementsAs(ANONYMOUS), where('agoraSessionId', '==', 'session-1'), where('accessScope', '==', 'open'))));
		});

		it('Agora: a session with no scope is refused', async () => {
			await assertFails(getDocs(query(statementsAs(ANONYMOUS), where('agoraSessionId', '==', 'session-1'))));
		});

		it('Studio: an organization for its members only', async () => {
			await assertSucceeds(getDocs(query(statementsAs(MEMBER), where('organizationId', '==', 'org-1'))));
			await assertFails(getDocs(query(statementsAs(OUTSIDER), where('organizationId', '==', 'org-1'))));
		});

		it('Flow: one’s own statements', async () => {
			await assertSucceeds(getDocs(query(statementsAs(CREATOR), where('creatorId', '==', CREATOR), where('parentId', '==', 'top'), where('statementType', '==', 'group'), orderBy('createdAt', 'desc'))));
		});

		it('a root that names itself and turns out to be open passes for anyone', async () => {
			await assertSucceeds(getDocs(query(statementsAs(ANONYMOUS), where('parents', 'array-contains', 'ns-top'), where('accessScope', 'in', ['open', 'ns-top']))));
		});
	});

	describe('a child of a private level in an open top', () => {
		const SUB = (uid, id, role) => ({
			userId: uid,
			user: { uid },
			statementId: id,
			statementsSubscribeId: `${uid}--${id}`,
			role,
		});
		const selfSubscribe = (uid, id, role = 'member') =>
			setDoc(doc(contextOf(uid).firestore(), 'statementsSubscribe', `${uid}--${id}`), SUB(uid, id, role));

		before(async () => {
			await seed(world.env, async (db) => {
				await setDoc(doc(db, 'statements', 'k-top'), statementDoc({ statementId: 'k-top', uid: CREATOR, overrides: { parentId: 'top', topParentId: 'k-top', parents: [], accessScope: 'open', membership: { access: 'openToAll' } } }));
				await setDoc(doc(db, 'statements', 'k-q'), statementDoc({ statementId: 'k-q', uid: CREATOR, overrides: { parentId: 'k-top', topParentId: 'k-top', parents: ['k-top'], accessScope: 'k-q', statementType: 'question', membership: { access: 'secret' } } }));
				await setDoc(doc(db, 'statements', 'k'), statementDoc({ statementId: 'k', uid: 'k-creator', overrides: { parentId: 'k-q', topParentId: 'k-top', parents: ['k-top', 'k-q'], accessScope: 'k-q', statementType: 'question' } }));
				await setDoc(doc(db, 'statements', 'k-m'), statementDoc({ statementId: 'k-m', uid: CREATOR, overrides: { parentId: 'k-top', topParentId: 'k-top', parents: ['k-top'], accessScope: 'k-m', statementType: 'question', membership: { access: 'moderated' } } }));
				await setDoc(doc(db, 'statements', 'k-m-child'), statementDoc({ statementId: 'k-m-child', uid: CREATOR, overrides: { parentId: 'k-m', topParentId: 'k-top', parents: ['k-top', 'k-m'], accessScope: 'k-m', statementType: 'question' } }));
				await subscribe(db, 'k-q-member', 'k-q', 'member');
				await subscribe(db, 'k-top-member', 'k-top', 'member');
				await subscribe(db, 'k-host', 'k', 'admin');
				// Only someone in the private level can have made a level inside it.
				await subscribe(db, 'k-creator', 'k-q', 'member');
			});
		});

		it('refuses an outsider a member role on the child', async () => {
			await assertFails(selfSubscribe('k-outsider', 'k'));
		});

		it('refuses a plain member of the open top a role on the child', async () => {
			await assertFails(selfSubscribe('k-top-member', 'k'));
		});

		it('lets a member of the governing level follow the child', async () => {
			await assertSucceeds(selfSubscribe('k-q-member', 'k'));
		});

		it('judges a moderated governing level: waiting yes, member no', async () => {
			await assertSucceeds(selfSubscribe('k-asker', 'k-m-child', 'waiting'));
			await assertFails(selfSubscribe('k-asker-2', 'k-m-child', 'member'));
		});

		it('a host of the child who holds no role in the private level gets nothing (rule A)', async () => {
			await assertFails(getDocs(query(statementsAs('k-host'), where('parentId', '==', 'k'))));
			await assertFails(
				getDocs(query(statementsAs('k-host'), where('parentId', '==', 'k'), where('accessScope', 'in', ['open', 'k-q']))),
			);
		});

		it('nor does its creator, however the child was made', async () => {
			await assertFails(getDocs(query(statementsAs('k-creator'), where('parentId', '==', 'k'))));
		});

		it('a host of the child who is a member of the private level reads with the scope named', async () => {
			await seed(world.env, (db) => subscribe(db, 'k-host', 'k-q', 'member'));
			await assertSucceeds(
				getDocs(query(statementsAs('k-host'), where('parentId', '==', 'k'), where('accessScope', 'in', ['open', 'k-q']))),
			);
		});

		it('an outsider still may not list the children', async () => {
			await assertFails(getDocs(query(statementsAs('k-outsider'), where('parentId', '==', 'k'))));
		});
	});
});
