import type { Firestore } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import { createFakeDb, FakeDb } from '../../progress/__tests__/fakeDb';
import { AuthUsers, lookupPersonIdentities, neutralIdentity } from '../personIdentity';

const AUTH_LIMIT = 100;

describe('lookupPersonIdentities', () => {
	let fake: FakeDb;
	const getUsers = jest.fn();
	const auth: AuthUsers = { getUsers };
	const firestore = (): Firestore => fake.db as unknown as Firestore;

	beforeEach(() => {
		fake = createFakeDb();
		getUsers.mockReset();
		getUsers.mockResolvedValue({ users: [], notFound: [] });
	});

	it('returns only uid, displayName and photoURL from usersV2', async () => {
		fake.seed(Collections.users, 'a', {
			displayName: ' Ann ',
			photoURL: 'https://photo/a.png',
			email: 'a@example.org',
			systemAdmin: true,
		});
		const found = await lookupPersonIdentities(firestore(), auth, ['a']);

		expect(found.get('a')).toEqual({
			uid: 'a',
			displayName: 'Ann',
			photoURL: 'https://photo/a.png',
		});
		expect(getUsers).not.toHaveBeenCalled();
	});

	it('asks Auth only for those usersV2 has no name for, keeping a usersV2 photo', async () => {
		fake.seed(Collections.users, 'named', { displayName: 'Named' });
		fake.seed(Collections.users, 'blank', { displayName: '', photoURL: 'https://photo/b.png' });
		getUsers.mockResolvedValue({
			users: [{ uid: 'blank', displayName: 'From Auth', email: 'b@example.org' }],
			notFound: [{ uid: 'nobody' }],
		});
		const found = await lookupPersonIdentities(firestore(), auth, ['named', 'blank', 'nobody']);

		expect(getUsers).toHaveBeenCalledWith([{ uid: 'blank' }, { uid: 'nobody' }]);
		expect(found.get('blank')).toEqual({
			uid: 'blank',
			displayName: 'From Auth',
			photoURL: 'https://photo/b.png',
		});
		expect(found.has('nobody')).toBe(false);
	});

	it('splits Auth lookups at its limit and asks about each uid once', async () => {
		const uids = Array.from({ length: AUTH_LIMIT + 1 }, (_, i) => `u${i}`);
		await lookupPersonIdentities(firestore(), auth, [...uids, 'u0']);

		expect(getUsers).toHaveBeenCalledTimes(2);
		expect(getUsers.mock.calls[0][0]).toHaveLength(AUTH_LIMIT);
		expect(getUsers.mock.calls[1][0]).toHaveLength(1);
	});

	it('rejects on an Auth failure unless the caller tolerates it', async () => {
		fake.seed(Collections.users, 'named', { displayName: 'Named' });
		getUsers.mockRejectedValue(new Error('auth down'));

		await expect(lookupPersonIdentities(firestore(), auth, ['named', 'x'])).rejects.toThrow(
			'auth down',
		);

		const onAuthFailure = jest.fn();
		const found = await lookupPersonIdentities(firestore(), auth, ['named', 'x'], {
			onAuthFailure,
		});
		expect(onAuthFailure).toHaveBeenCalledTimes(1);
		expect(found.get('named')?.displayName).toBe('Named');
	});

	it('reads nothing for no uids', async () => {
		const found = await lookupPersonIdentities(firestore(), auth, []);

		expect(found.size).toBe(0);
		expect(getUsers).not.toHaveBeenCalled();
	});

	it('neutralIdentity holds the uid and no name', () => {
		expect(neutralIdentity('a')).toEqual({ uid: 'a', displayName: '' });
	});
});
