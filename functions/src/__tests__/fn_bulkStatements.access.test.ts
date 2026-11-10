/**
 * Who may read a tree through getBulkStatements. Runs the real handler, access
 * rules and response cache against the fake Firestore.
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

import { resetFirestore, seed } from '../services/__tests__/helpers/fakeFirestore';
import {
	MEMBER,
	OUTSIDER,
	load,
	newId,
	role,
	statement,
	tree,
	withAccess,
} from './helpers/bulkAccessHarness';

beforeEach(() => {
	resetFirestore();
});

describe('getBulkStatements access', () => {
	describe('a private tree', () => {
		it('refuses an outsider and returns no statements', async () => {
			const { top } = tree({ top: 'secret' });

			const result = await load(OUTSIDER, top);

			expect(result.status).toBe(403);
			expect(result.body).toEqual({ ok: false, error: expect.any(String) });
		});

		it('refuses an outsider even when a member has just warmed the cache', async () => {
			const { top } = tree({ top: 'secret' });
			role(MEMBER, top, 'member');

			const warm = await load(MEMBER, top);
			const refused = await load(OUTSIDER, top);

			expect(warm.status).toBe(200);
			expect(warm.ids.length).toBeGreaterThan(0);
			expect(refused.status).toBe(403);
			expect(refused.body.statements).toBeUndefined();
		});

		it('lets a member in', async () => {
			const { top, q } = tree({ top: 'secret' });
			role(MEMBER, top, 'member');

			const result = await load(MEMBER, top);

			expect(result.status).toBe(200);
			expect(result.ids).toEqual([q]);
		});

		it('lets a host of an ancestor in', async () => {
			const { top, q } = tree({ top: 'secret', question: 'secret' });
			role(MEMBER, top, 'admin');

			const result = await load(MEMBER, q);

			expect(result.status).toBe(200);
			expect(result.ids).toEqual([`${q}-answer`]);
		});

		it('lets a system admin in', async () => {
			const { top, q } = tree({ top: 'secret' });
			seed('usersV2', 'root-user', { systemAdmin: true });

			const result = await load('root-user', top);

			expect(result.status).toBe(200);
			expect(result.ids).toEqual([q]);
		});

		it('lets the creator in without a subscription, as the app does', async () => {
			const { top, q } = tree({ top: 'secret' });
			statement(top, {
				parentId: 'top',
				parents: ['top'],
				topParentId: top,
				creatorId: 'author',
				...withAccess('secret'),
			});

			const result = await load('author', top);

			expect(result.status).toBe(200);
			expect(result.ids).toEqual([q]);
		});

		it('refuses someone banned', async () => {
			const { top } = tree({ top: 'secret' });
			role('banned-user', top, 'banned');

			expect((await load('banned-user', top)).status).toBe(403);
		});

		it('refuses someone waiting for approval', async () => {
			const { top } = tree({ top: 'moderated' });
			role('waiting-user', top, 'waiting');

			expect((await load('waiting-user', top)).status).toBe(403);
		});

		it('takes a ban or a removal into account at once, despite the settings cache', async () => {
			const { top } = tree({ top: 'secret' });
			role(MEMBER, top, 'member');
			expect((await load(MEMBER, top)).status).toBe(200);

			role(MEMBER, top, 'banned');

			expect((await load(MEMBER, top)).status).toBe(403);
		});

		it('honours a private group between the root and an open top', async () => {
			const { top, q } = tree({ top: 'public', question: 'secret' });

			expect((await load(OUTSIDER, q)).status).toBe(403);
			expect((await load(OUTSIDER, top)).status).toBe(200);
		});

		it('sees a private level above the old twelve-level limit', async () => {
			const top = newId('deep-top');
			const chain = Array.from({ length: 15 }, (_, index) => `${top}-level-${index}`);
			statement(top, { parentId: 'top', parents: ['top'], topParentId: top });
			chain.forEach((id, index) => {
				const parents = ['top', top, ...chain.slice(0, index)];
				statement(id, {
					parentId: parents[parents.length - 1],
					parents,
					topParentId: top,
					...(index === 0 ? withAccess('secret') : {}),
				});
			});

			expect((await load(OUTSIDER, chain[chain.length - 1])).status).toBe(403);
		});
	});

	describe('an open tree', () => {
		it('opens a public question inside a private group', async () => {
			const { q } = tree({ top: 'secret', question: 'public' });

			const result = await load('anonymous-user', q);

			expect(result.status).toBe(200);
			expect(result.ids).toEqual([`${q}-answer`]);
		});

		it('treats no setting on any level as open', async () => {
			const { top, q } = tree({});

			const result = await load(OUTSIDER, top);

			expect(result.status).toBe(200);
			expect(result.ids).toEqual([q]);
		});

		it('lets an anonymous person into a public question', async () => {
			const { top, q } = tree({ top: 'public' });

			const result = await load('anonymous-user', top, 'descendants');

			expect(result.status).toBe(200);
			expect(result.ids).toEqual([q, `${q}-answer`].sort());
		});

		it('lets someone waiting into a public question, as the app does', async () => {
			const { top } = tree({ top: 'public' });
			role('waiting-user', top, 'waiting');

			expect((await load('waiting-user', top)).status).toBe(200);
		});
	});

	describe('a missing or hidden root', () => {
		it('is 404 for a statement that does not exist', async () => {
			expect((await load(OUTSIDER, newId('missing'))).status).toBe(404);
		});

		it('is 404 for a hidden root, so its existence is not revealed', async () => {
			const top = newId('hidden');
			statement(top, { parentId: 'top', parents: ['top'], topParentId: top, hide: true });

			expect((await load(OUTSIDER, top)).status).toBe(404);
		});
	});

	describe('a private level inside an open tree', () => {
		/** public top -> secret group -> answer inheriting the group; plus an open sibling. */
		function nested(answerAccess?: string): { top: string; group: string; answer: string } {
			const top = newId('open-top');
			const group = newId('secret-group');
			const answer = newId('answer');
			statement(top, {
				parentId: 'top',
				parents: ['top'],
				topParentId: top,
				...withAccess('public'),
			});
			statement(group, {
				parentId: top,
				parents: ['top', top],
				topParentId: top,
				...withAccess('secret'),
			});
			statement(answer, {
				parentId: group,
				parents: ['top', top, group],
				topParentId: top,
				...withAccess(answerAccess),
			});
			statement(`${top}-open`, {
				parentId: top,
				parents: ['top', top],
				topParentId: top,
				...withAccess('openToAll'),
			});

			return { top, group, answer };
		}

		it('removes it from what an outsider gets', async () => {
			const { top } = nested();

			const result = await load(OUTSIDER, top, 'descendants');

			expect(result.status).toBe(200);
			expect(result.ids).toEqual([`${top}-open`]);
		});

		it('removes it even when a member warmed the cache with it', async () => {
			const { top, group, answer } = nested();
			role(MEMBER, group, 'member');

			const warm = await load(MEMBER, top, 'descendants');
			const outsider = await load(OUTSIDER, top, 'descendants');

			expect(warm.ids).toEqual([`${top}-open`, group, answer].sort());
			expect(outsider.ids).toEqual([`${top}-open`]);
		});

		it('removes it for someone banned from or waiting on that level', async () => {
			const { top, group } = nested();
			role('banned-user', group, 'banned');
			role('waiting-user', group, 'waiting');

			expect((await load('banned-user', top, 'descendants')).ids).toEqual([`${top}-open`]);
			expect((await load('waiting-user', top, 'descendants')).ids).toEqual([`${top}-open`]);
		});

		it('keeps it for a host of the root and for a system admin', async () => {
			const { top, group, answer } = nested();
			const everything = [`${top}-open`, group, answer].sort();
			role('host', top, 'admin');
			seed('usersV2', 'root-user', { systemAdmin: true });

			expect((await load('host', top, 'descendants')).ids).toEqual(everything);
			expect((await load('root-user', top, 'descendants')).ids).toEqual(everything);
		});

		it('lets a statement’s own open setting win inside it', async () => {
			const { top, answer } = nested('public');

			const result = await load(OUTSIDER, top, 'descendants');

			expect(result.ids).toEqual([`${top}-open`, answer].sort());
		});

		it('finds the private level when it is not on the same page as the answer', async () => {
			const { top, group, answer } = nested();
			// Ids sort as answer < open-top < secret-group, so one doc per page splits them.
			const seen: string[] = [];
			let cursor: string | null = '';
			while (cursor !== null) {
				const page: Awaited<ReturnType<typeof load>> = await load(OUTSIDER, top, 'descendants', {
					pageSize: '1',
					cursor,
				});
				seen.push(...page.ids);
				cursor = page.body.nextCursor ?? null;
			}

			expect(seen).toEqual([`${top}-open`]);
			expect(seen).not.toContain(group);
			expect(seen).not.toContain(answer);
		});
	});
});
