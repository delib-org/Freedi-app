/**
 * getBulkStatements on trees whose `parents` lists skip levels, and callers with
 * different roles on different levels of one chain.
 */
import type { Request } from 'firebase-functions/v1';

jest.mock(
	'firebase-admin/firestore',
	() => jest.requireActual('../services/__tests__/helpers/fakeFirestore').firestoreModule,
);
jest.mock('../index', () => ({
	db: jest
		.requireActual('../services/__tests__/helpers/fakeFirestore')
		.firestoreModule.getFirestore(),
}));
jest.mock('../db', () => ({
	db: jest
		.requireActual('../services/__tests__/helpers/fakeFirestore')
		.firestoreModule.getFirestore(),
}));
jest.mock('../utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('../utils/rateLimit', () => ({ passesHttpRateLimit: jest.fn() }));
jest.mock('../utils/httpAuth', () => ({
	...jest.requireActual('../utils/httpAuth'),
	verifyAuthToken: async (req: Request) => req.headers['x-test-uid'],
}));

import { getFirestore } from 'firebase-admin/firestore';
import { resetFirestore } from '../services/__tests__/helpers/fakeFirestore';
import {
	MEMBER,
	OUTSIDER,
	load,
	newId,
	role,
	statement,
	withAccess,
} from './helpers/bulkAccessHarness';

/** A top-level statement and a child of it, both with the given access. */
function topWith(id: string, access: string): void {
	statement(id, { parentId: 'top', parents: ['top'], topParentId: id, ...withAccess(access) });
}

function childWith(id: string, top: string, parents: string[], access?: string): void {
	statement(id, {
		parentId: parents[parents.length - 1],
		parents,
		topParentId: top,
		...withAccess(access),
	});
}

beforeEach(() => {
	resetFirestore();
});

describe('a parents list that skips levels', () => {
	/** public top -> secret group -> q -> answer, the last two listing only [top, parent]. */
	function shortLists(): { top: string; group: string; q: string; answer: string } {
		const top = newId('short-top');
		const group = newId('short-group');
		const q = newId('short-q');
		const answer = newId('short-answer');
		topWith(top, 'public');
		childWith(group, top, ['top', top], 'secret');
		childWith(q, top, [top, group]);
		childWith(answer, top, [top, q]);

		return { top, group, q, answer };
	}

	it('still finds the private level for what an outsider gets from the top', async () => {
		const { top } = shortLists();

		const result = await load(OUTSIDER, top, 'descendants');

		expect(result.status).toBe(200);
		expect(result.ids).toEqual([]);
	});

	it('still finds the private level at the root check', async () => {
		const { q, answer } = shortLists();

		expect((await load(OUTSIDER, q)).status).toBe(403);
		expect((await load(OUTSIDER, answer)).status).toBe(403);
	});

	it('still lets a member of the skipped level in', async () => {
		const { top, group, q, answer } = shortLists();
		role(MEMBER, group, 'member');

		expect((await load(MEMBER, q)).ids).toEqual([answer]);
		expect((await load(MEMBER, top, 'descendants')).ids).toEqual([group, q, answer].sort());
	});

	it('falls back to the listed levels past a deleted parent', async () => {
		const top = newId('broken-top');
		const q = newId('broken-q');
		topWith(top, 'secret');
		statement(q, { parentId: newId('deleted'), parents: ['top', top], topParentId: top });

		expect((await load(OUTSIDER, q)).status).toBe(403);
	});

	it('refuses a parent loop rather than following it', async () => {
		const a = newId('loop-a');
		const b = newId('loop-b');
		statement(a, { parentId: b, parents: [b], topParentId: a });
		statement(b, { parentId: a, parents: [a], topParentId: a });

		expect((await load(OUTSIDER, a)).status).toBe(404);
	});

	it('removes a statement below the root whose parents loop', async () => {
		const top = newId('loop-top');
		const a = newId('loop-a');
		const b = newId('loop-b');
		topWith(top, 'public');
		statement(a, { parentId: b, parents: ['top', top, b], topParentId: top });
		statement(b, { parentId: a, parents: ['top', top, a], topParentId: top });

		expect((await load(OUTSIDER, top, 'descendants')).ids).toEqual([]);
	});
});

describe('roles on every level of a nested chain', () => {
	/** public top -> secret A -> secret B -> answer inheriting B. */
	function nestedSecrets(): { top: string; a: string; b: string; answer: string } {
		const top = newId('chain-top');
		const a = newId('chain-a');
		const b = newId('chain-b');
		const answer = newId('chain-answer');
		topWith(top, 'public');
		childWith(a, top, ['top', top], 'secret');
		childWith(b, top, ['top', top, a], 'secret');
		childWith(answer, top, ['top', top, a, b]);

		return { top, a, b, answer };
	}

	it('refuses someone banned above, even as a member of the nearer private level', async () => {
		const { top, a, b } = nestedSecrets();
		role(MEMBER, a, 'banned');
		role(MEMBER, b, 'member');

		expect((await load(MEMBER, top, 'descendants')).ids).toEqual([]);
	});

	it('refuses a host of one level who is banned on another', async () => {
		const { top, a, b } = nestedSecrets();
		role(MEMBER, a, 'admin');
		role(MEMBER, b, 'banned');

		expect((await load(MEMBER, top, 'descendants')).ids).toEqual([a]);
	});

	it('refuses a host of the root who is banned on a level below it', async () => {
		const { top, a, b } = nestedSecrets();
		role(MEMBER, top, 'admin');
		role(MEMBER, b, 'banned');

		expect((await load(MEMBER, top, 'descendants')).ids).toEqual([a]);
	});

	it('lets a host of an outer private level through a nested one', async () => {
		const { top, a, b, answer } = nestedSecrets();
		role(MEMBER, a, 'admin');

		expect((await load(MEMBER, top, 'descendants')).ids).toEqual([a, b, answer].sort());
	});

	it('lets a member of the governing level in, but not a member of an outer one', async () => {
		const { top, a, b, answer } = nestedSecrets();
		role('inner', b, 'member');
		role('outer', a, 'member');

		expect((await load('inner', top, 'descendants')).ids).toEqual([b, answer].sort());
		expect((await load('outer', top, 'descendants')).ids).toEqual([a]);
	});

	it('ignores a membership or a ban placed directly on a level that only inherits', async () => {
		const { top, a, b } = nestedSecrets();
		const inner = newId('chain-inner');
		const leaf = newId('chain-leaf');
		childWith(inner, top, ['top', top, a, b]);
		childWith(leaf, top, ['top', top, a, b, inner]);
		role('inner-member', inner, 'member');
		role('governing-member', b, 'member');
		role('governing-member', inner, 'banned');

		expect((await load('inner-member', top, 'descendants')).ids).toEqual([]);
		expect((await load('governing-member', top, 'descendants')).ids).toContain(leaf);
	});

	it('takes a new ban into account despite a warm cache', async () => {
		const { top, a, b, answer } = nestedSecrets();
		role(MEMBER, b, 'member');
		expect((await load(MEMBER, top, 'descendants')).ids).toEqual([b, answer].sort());

		role(MEMBER, a, 'banned');

		expect((await load(MEMBER, top, 'descendants')).ids).toEqual([]);
	});
});

describe('new statements that store no access setting', () => {
	it('follow the nearest ancestor, while a stored openToAll stays open', async () => {
		const top = newId('inherit-top');
		const group = newId('inherit-group');
		const inherits = newId('inherits');
		const stored = newId('stored-open');
		topWith(top, 'public');
		childWith(group, top, ['top', top], 'secret');
		childWith(inherits, top, ['top', top, group]);
		childWith(stored, top, ['top', top, group], 'openToAll');

		expect((await load(OUTSIDER, top, 'descendants')).ids).toEqual([stored]);
		expect((await load(OUTSIDER, inherits)).status).toBe(403);
		expect((await load(OUTSIDER, stored)).status).toBe(200);
	});
});

describe('an answer-type child with a copy of its parent’s setting', () => {
	type ChildKind = [string, Record<string, unknown>];

	const kinds: ChildKind[] = [
		['an improved answer', { statementType: 'option' }],
		['a ballot', { statementType: 'question', agreementBallot: { questionId: 'x' } }],
		['an agreement', { statementType: 'agreement' }],
	];

	/** public top -> secret question -> a child carrying the same secret setting. */
	function copied(fields: Record<string, unknown>): { top: string; q: string; child: string } {
		const top = newId('copy-top');
		const q = newId('copy-q');
		const child = newId('copy-child');
		topWith(top, 'public');
		statement(q, {
			parentId: top,
			parents: ['top', top],
			topParentId: top,
			statementType: 'question',
			...withAccess('secret'),
		});
		statement(child, {
			parentId: q,
			parents: ['top', top, q],
			topParentId: top,
			...withAccess('secret'),
			...fields,
		});

		return { top, q, child };
	}

	describe.each(kinds)('%s', (_name, fields) => {
		it('is open to a member of the question when the child is the root', async () => {
			const { q, child } = copied(fields);
			role(MEMBER, q, 'member');

			expect((await load(MEMBER, child)).status).toBe(200);
		});

		it('stays on the page for a member loading the question', async () => {
			const { q, child } = copied(fields);
			role(MEMBER, q, 'member');

			expect((await load(MEMBER, q)).ids).toEqual([child]);
		});

		it('stays on the page for a member loading from an open top', async () => {
			const { top, q, child } = copied(fields);
			role(MEMBER, q, 'member');

			expect((await load(MEMBER, top, 'descendants')).ids).toEqual([q, child].sort());
		});

		it('is still refused to an outsider', async () => {
			const { top, child } = copied(fields);

			expect((await load(OUTSIDER, child)).status).toBe(403);
			expect((await load(OUTSIDER, top, 'descendants')).ids).toEqual([]);
		});

		it('is still refused to someone banned on the question', async () => {
			const { q, child } = copied(fields);
			role(MEMBER, q, 'banned');

			expect((await load(MEMBER, child)).status).toBe(403);
		});
	});

	it('keeps a setting that differs from the parent as the child’s own', async () => {
		const { q, child } = copied({ statementType: 'option', membership: { access: 'moderated' } });
		role(MEMBER, q, 'member');

		expect((await load(MEMBER, child)).status).toBe(403);
		expect((await load(MEMBER, q)).ids).toEqual([]);
	});

	it('keeps a real nested question as its own private space, even with the same setting', async () => {
		const { q, child } = copied({ statementType: 'question' });
		role(MEMBER, q, 'member');

		expect((await load(MEMBER, child)).status).toBe(403);
		expect((await load(MEMBER, q)).ids).toEqual([]);
	});
});

describe('read cost', () => {
	const CHILDREN = 40;

	function roleReads(spy: jest.SpyInstance): string[] {
		return spy.mock.calls
			.flat()
			.filter((ref: { collection: string }) => ref.collection === 'statementsSubscribe')
			.map((ref: { id: string }) => ref.id);
	}

	it('reads roles for the levels with a setting, not for each child that inherits', async () => {
		const top = newId('cost-top');
		const group = newId('cost-group');
		topWith(top, 'public');
		childWith(group, top, ['top', top], 'secret');
		for (let index = 0; index < CHILDREN; index++) {
			childWith(`${group}-child-${index}`, top, ['top', top, group]);
		}
		const spy = jest.spyOn(getFirestore(), 'getAll');

		const result = await load(OUTSIDER, top, 'descendants');

		expect(result.ids).toEqual([]);
		expect(roleReads(spy).sort()).toEqual([`${OUTSIDER}--${group}`, `${OUTSIDER}--${top}`].sort());
		spy.mockRestore();
	});
});
