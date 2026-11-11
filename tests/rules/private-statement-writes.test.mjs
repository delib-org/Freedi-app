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
import { statementDoc, seed } from './helpers.mjs';
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

describe('writing /statements inside a private level', () => {
	const { world, contextOf, statementsAs, subscribe } = useWorld('private-statement-writes');

	describe('writing accessScope', () => {
		const create = (uid, id, fields) =>
			setDoc(
				doc(contextOf(uid).firestore(), 'statements', id),
				statementDoc({ statementId: id, uid, overrides: fields }),
			);

		it('accepts a child carrying its parent’s scope', async () => {
			await assertSucceeds(create(MEMBER, 'w1', { parentId: 'pg-q', topParentId: 'pg-root', parents: ['pg-root', 'pg', 'pg-q'], accessScope: 'pg' }));
		});

		it('refuses a child opening itself inside a private level', async () => {
			await assertFails(create(MEMBER, 'w2', { parentId: 'pg-q', topParentId: 'pg-root', parents: ['pg-root', 'pg', 'pg-q'], accessScope: 'open' }));
		});

		it('accepts a child with no scope yet (an old client)', async () => {
			await assertSucceeds(create(MEMBER, 'w3', { parentId: 'pg-q', topParentId: 'pg-root', parents: ['pg-root', 'pg', 'pg-q'] }));
		});

		it('accepts an explicit public child as open', async () => {
			await assertSucceeds(create(MEMBER, 'w4', { parentId: 'pg-q', topParentId: 'pg-root', parents: ['pg-root', 'pg', 'pg-q'], membership: { access: 'public' }, accessScope: 'open' }));
		});

		it('accepts a private child as its own scope, and refuses it as open', async () => {
			await assertSucceeds(create(MEMBER, 'w5', { parentId: 'ns-q', topParentId: 'ns-top', parents: ['ns-top', 'ns-q'], membership: { access: 'secret' }, accessScope: 'w5' }));
			await assertFails(create(MEMBER, 'w6', { parentId: 'ns-q', topParentId: 'ns-top', parents: ['ns-top', 'ns-q'], membership: { access: 'secret' }, accessScope: 'open' }));
		});

		it('accepts a top statement as open', async () => {
			await assertSucceeds(create(MEMBER, 'w7', { parentId: 'top', topParentId: 'w7', parents: [], accessScope: 'open' }));
		});

		it('refuses any client changing a scope, even a host', async () => {
			await assertFails(updateDoc(doc(contextOf(CREATOR).firestore(), 'statements', 'pg-a'), { accessScope: 'open' }));
		});

		it('leaves an update that does not touch it alone', async () => {
			await assertSucceeds(updateDoc(doc(contextOf(CREATOR).firestore(), 'statements', 'pg-a'), { statement: 'edited' }));
		});
	});

	describe('planting a statement inside a private level', () => {
		const make = (uid, id, fields) =>
			setDoc(doc(contextOf(uid).firestore(), 'statements', id), statementDoc({ statementId: id, uid, overrides: fields }));
		const underPg = { parentId: 'pg', topParentId: 'pg-root', parents: ['pg-root', 'pg'], accessScope: 'pg', statementType: 'question' };

		it('refuses an outsider creating under the private level', async () => {
			await assertFails(make(OUTSIDER, 'plant-1', underPg));
		});

		it('refuses it with the scope left off, or with an own public setting', async () => {
			const { accessScope: _scope, ...noScope } = underPg;
			await assertFails(make(OUTSIDER, 'plant-2', noScope));
			await assertFails(make(OUTSIDER, 'plant-3', { ...underPg, accessScope: 'open', membership: { access: 'public' } }));
		});

		it('refuses a banned or waiting person, and an anonymous one', async () => {
			await assertFails(make(BANNED, 'plant-4', underPg));
			await assertFails(make(WAITING, 'plant-5', underPg));
			await assertFails(make(ANONYMOUS, 'plant-6', underPg));
		});

		it('lets a member and a host above write there', async () => {
			await assertSucceeds(make(MEMBER, 'grow-1', underPg));
			await assertSucceeds(make(HOST, 'grow-2', underPg));
			await assertSucceeds(make(MEMBER, 'grow-3', { ...underPg, accessScope: 'open', membership: { access: 'public' } }));
		});

		it('still lets anyone write under an open level', async () => {
			await assertSucceeds(make(OUTSIDER, 'open-1', { parentId: 'ns-q', topParentId: 'ns-top', parents: ['ns-top', 'ns-q'], accessScope: 'open', statementType: 'option' }));
		});

		it('refuses moving one’s own statement under the private level', async () => {
			await assertSucceeds(make(OUTSIDER, 'mytop', { parentId: 'top', topParentId: 'mytop', parents: [], accessScope: 'open' }));
			await assertFails(updateDoc(doc(contextOf(OUTSIDER).firestore(), 'statements', 'mytop'), { parentId: 'pg', topParentId: 'pg-root', parents: ['pg-root', 'pg'] }));
		});

		it('lets a member move a statement within the private level', async () => {
			await assertSucceeds(make(MEMBER, 'mover', underPg));
			await assertSucceeds(updateDoc(doc(contextOf(MEMBER).firestore(), 'statements', 'mover'), { parentId: 'pg-q', parents: ['pg-root', 'pg', 'pg-q'] }));
		});

		describe('a plant made before creates checked the parent', () => {
			before(async () => {
				await seed(world.env, async (db) => {
					await setDoc(doc(db, 'statements', 'old-plant'), statementDoc({ statementId: 'old-plant', uid: 'planter', overrides: underPg }));
					await subscribe(db, 'planter', 'old-plant', 'admin');
					await setDoc(doc(db, 'statements', 'old-plant-reply'), statementDoc({ statementId: 'old-plant-reply', uid: MEMBER, overrides: { parentId: 'old-plant', topParentId: 'pg-root', parents: ['pg-root', 'pg', 'old-plant'], accessScope: 'pg' } }));
					await setDoc(doc(db, 'statements', 'real-level'), statementDoc({ statementId: 'real-level', uid: MEMBER, overrides: underPg }));
					await subscribe(db, 'real-host', 'real-level', 'admin');
				});
			});

			it('gives its creator and its hosts no unscoped list', async () => {
				await assertFails(getDocs(query(statementsAs('planter'), where('parentId', '==', 'old-plant'))));
			});

			it('gives a host of a level below the private one nothing, whoever made it (rule A)', async () => {
				await assertFails(getDocs(query(statementsAs('real-host'), where('parentId', '==', 'real-level'))));
			});

			it('leaves a member reading it as usual', async () => {
				await assertSucceeds(getDocs(query(statementsAs(MEMBER), where('parents', 'array-contains', 'old-plant'), where('accessScope', 'in', ['open', 'pg']))));
			});
		});
	});

	describe('following a question inside a private group', () => {
		const followAs = (uid, statementId, role = 'member') =>
			setDoc(doc(contextOf(uid).firestore(), 'statementsSubscribe', `${uid}--${statementId}`), {
				userId: uid,
				user: { uid },
				statementId,
				statementsSubscribeId: `${uid}--${statementId}`,
				role,
			});

		it('a member of the top may follow a child with no own setting', async () => {
			await seed(world.env, async (db) => {
				await setDoc(doc(db, 'statements', 'f-top'), statementDoc({ statementId: 'f-top', uid: CREATOR, overrides: { parentId: 'top', topParentId: 'f-top', parents: [], accessScope: 'f-top', membership: { access: 'secret' } } }));
				await setDoc(doc(db, 'statements', 'f-q'), statementDoc({ statementId: 'f-q', uid: CREATOR, overrides: { parentId: 'f-top', topParentId: 'f-top', parents: ['f-top'], accessScope: 'f-top' } }));
				await subscribe(db, 'f-member', 'f-top', 'member');
			});
			await assertSucceeds(followAs('f-member', 'f-q'));
		});

		it('an outsider may not', async () => {
			await assertFails(followAs('f-outsider', 'f-q'));
		});
	});
});
