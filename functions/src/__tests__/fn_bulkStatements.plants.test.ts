/**
 * Hosts below the private level that governs them, and levels planted inside a
 * private level by someone with no way into it.
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

import { resetFirestore } from '../services/__tests__/helpers/fakeFirestore';
import { load, newId, role, statement, withAccess } from './helpers/bulkAccessHarness';

beforeEach(() => {
	resetFirestore();
});

/** public top -> secret group -> level (made by `levelCreator`, no setting) -> answer. */
function hostedLevel(levelCreator: string): {
	top: string;
	group: string;
	level: string;
	answer: string;
} {
	const top = newId('plant-top');
	const group = newId('plant-group');
	const level = newId('plant-level');
	const answer = newId('plant-answer');
	statement(top, { parentId: 'top', parents: [], topParentId: top, ...withAccess('public') });
	statement(group, {
		parentId: top,
		parents: [top],
		topParentId: top,
		accessScope: group,
		...withAccess('secret'),
	});
	statement(level, {
		parentId: group,
		parents: [top, group],
		topParentId: top,
		accessScope: group,
		creatorId: levelCreator,
	});
	statement(answer, {
		parentId: level,
		parents: [top, group, level],
		topParentId: top,
		accessScope: group,
		creatorId: 'someone',
	});

	return { top, group, level, answer };
}

describe('a host of a level that only inherits', () => {
	it('reads what is under it, when the level was made by a member', async () => {
		const { group, level, answer } = hostedLevel('a-member');
		role('a-member', group, 'member');
		role('level-host', level, 'admin');

		expect((await load('level-host', level, 'descendants')).ids).toContain(answer);
	});

	it('is let in at the root check too', async () => {
		const { group, level } = hostedLevel('a-member');
		role('a-member', group, 'member');
		role('level-host', level, 'admin');

		expect((await load('level-host', level, 'descendants')).status).toBe(200);
	});

	it('reads under it from a tree rooted higher up', async () => {
		const { top, group, level, answer } = hostedLevel('a-member');
		role('a-member', group, 'member');
		role('level-host', level, 'admin');

		const { ids } = await load('level-host', top, 'descendants');
		expect(ids).toContain(answer);
		expect(ids).not.toContain(group);
	});
});

describe('a level planted inside a private one', () => {
	it('gives its creator nothing under it', async () => {
		const { level } = hostedLevel('planter');
		role('planter', level, 'admin');

		expect((await load('planter', level, 'descendants')).status).toBe(403);
	});

	it('gives nothing to someone its creator made a host of it', async () => {
		const { level } = hostedLevel('planter');
		role('accomplice', level, 'admin');

		expect((await load('accomplice', level, 'descendants')).status).toBe(403);
	});

	it('hides what members wrote under it from a tree rooted higher up', async () => {
		const { top, level, answer } = hostedLevel('planter');
		role('planter', level, 'admin');

		expect((await load('planter', top, 'descendants')).ids).not.toContain(answer);
	});

	it('is trusted when its creator hosts the top', async () => {
		const { top, level, answer } = hostedLevel('top-host');
		role('top-host', top, 'admin');
		role('level-host', level, 'admin');

		expect((await load('level-host', level, 'descendants')).ids).toContain(answer);
	});
});
