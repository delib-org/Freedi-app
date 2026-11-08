import type { Firestore } from 'firebase-admin/firestore';
import { Collections } from '@freedi/shared-types';
import { createFakeDb, FakeDb } from '../../progress/__tests__/fakeDb';
import {
	anonymityFromAuth,
	anonymityFromProfile,
	AuthUsers,
	lookupPersonIdentities,
	neutralIdentity,
} from '../personIdentity';

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

	it('returns only uid, displayName, photoURL and isAnonymous from usersV2', async () => {
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
			isAnonymous: false,
		});
		expect(getUsers).not.toHaveBeenCalled();
	});

	it('asks Auth only for those usersV2 has no name for, keeping a usersV2 photo', async () => {
		fake.seed(Collections.users, 'named', { displayName: 'Named', email: 'n@example.org' });
		fake.seed(Collections.users, 'blank', { displayName: '', photoURL: 'https://photo/b.png' });
		getUsers.mockResolvedValue({
			users: [
				{
					uid: 'blank',
					displayName: 'From Auth',
					email: 'b@example.org',
					providerData: [{ providerId: 'google.com' }],
				},
			],
			notFound: [{ uid: 'nobody' }],
		});
		const found = await lookupPersonIdentities(firestore(), auth, ['named', 'blank', 'nobody']);

		expect(getUsers).toHaveBeenCalledWith([{ uid: 'blank' }, { uid: 'nobody' }]);
		expect(found.get('blank')).toEqual({
			uid: 'blank',
			displayName: 'From Auth',
			photoURL: 'https://photo/b.png',
			isAnonymous: false,
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
		fake.seed(Collections.users, 'named', { displayName: 'Named', email: 'n@example.org' });
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

	it('neutralIdentity holds the uid, no name, and proves no account', () => {
		expect(neutralIdentity('a')).toEqual({ uid: 'a', displayName: '', isAnonymous: true });
	});

	describe('isAnonymous', () => {
		const lookup = async (uid: string) =>
			(await lookupPersonIdentities(firestore(), auth, [uid])).get(uid);

		it('takes an explicit false, with no Auth call', async () => {
			fake.seed(Collections.users, 'a', { displayName: 'A', isAnonymous: false });

			expect((await lookup('a'))?.isAnonymous).toBe(false);
			expect(getUsers).not.toHaveBeenCalled();
		});

		it('reads an email as an account, with no Auth call, and never stores it', async () => {
			fake.seed(Collections.users, 'a', { displayName: 'A', email: 'a@example.org' });
			const identity = await lookup('a');

			expect(identity?.isAnonymous).toBe(false);
			expect(identity).not.toHaveProperty('email');
			expect(getUsers).not.toHaveBeenCalled();
		});

		it('lets Auth overrule a stale true: the account was linked after the doc was made', async () => {
			fake.seed(Collections.users, 'a', { displayName: 'A', isAnonymous: true });
			getUsers.mockResolvedValue({
				users: [{ uid: 'a', providerData: [{ providerId: 'google.com' }] }],
			});

			expect(await lookup('a')).toEqual({ uid: 'a', displayName: 'A', isAnonymous: false });
		});

		it('stays anonymous when Auth confirms no linked provider', async () => {
			fake.seed(Collections.users, 'a', { displayName: 'A', isAnonymous: true });
			getUsers.mockResolvedValue({ users: [{ uid: 'a', providerData: [] }] });

			expect((await lookup('a'))?.isAnonymous).toBe(true);
		});

		it('asks Auth when usersV2 has a name but neither flag nor email', async () => {
			fake.seed(Collections.users, 'a', { displayName: 'A' });
			getUsers.mockResolvedValue({
				users: [{ uid: 'a', providerData: [{ providerId: 'password' }] }],
			});

			expect(await lookup('a')).toEqual({ uid: 'a', displayName: 'A', isAnonymous: false });
		});

		it('counts as anonymous when nothing can tell, keeping the usersV2 name', async () => {
			fake.seed(Collections.users, 'a', { displayName: 'A' });

			expect(await lookup('a')).toEqual({ uid: 'a', displayName: 'A', isAnonymous: true });
		});

		it('keeps a usersV2 true when Auth is down and the caller tolerates it', async () => {
			fake.seed(Collections.users, 'a', { displayName: 'A', isAnonymous: true });
			getUsers.mockRejectedValue(new Error('auth down'));
			const found = await lookupPersonIdentities(firestore(), auth, ['a'], {
				onAuthFailure: jest.fn(),
			});

			expect(found.get('a')?.isAnonymous).toBe(true);
		});

		it('anonymityFromProfile cannot tell from a true, or from nothing', () => {
			expect(anonymityFromProfile({ isAnonymous: true, email: 'a@example.org' })).toBeUndefined();
			expect(anonymityFromProfile({})).toBeUndefined();
			expect(anonymityFromProfile({ email: '  ' })).toBeUndefined();
		});

		it('anonymityFromAuth is true with no provider', () => {
			expect(anonymityFromAuth([])).toBe(true);
			expect(anonymityFromAuth(undefined)).toBe(true);
			expect(anonymityFromAuth([{}])).toBe(false);
		});
	});
});
