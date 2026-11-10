import { getDoc } from 'firebase/firestore';
import type { Creator } from '@freedi/shared-types';
import { setUserToDB } from '../setUser';
import { syncUserLanguage } from '../userLanguage';

jest.mock('firebase/firestore', () => ({
	doc: jest.fn(() => 'user-ref'),
	getDoc: jest.fn(),
	setDoc: jest.fn().mockResolvedValue(undefined),
	updateDoc: jest.fn(),
}));
jest.mock('../../config', () => ({ DB: {} }));
jest.mock('@/redux/store', () => ({ store: { dispatch: jest.fn() } }));
jest.mock('@/redux/creator/creatorSlice', () => ({
	setUserAdvanceUser: jest.fn(),
	setUserSystemAdmin: jest.fn(),
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));
jest.mock('../userLanguage', () => ({ syncUserLanguage: jest.fn() }));

const USER = { uid: 'u1', displayName: 'A' } as Creator;

function serverHolds(data: Record<string, unknown>, fromCache = false): void {
	jest.mocked(getDoc).mockResolvedValue({
		exists: () => true,
		data: () => data,
		metadata: { fromCache },
	} as unknown as Awaited<ReturnType<typeof getDoc>>);
}

describe('setUserToDB language sync', () => {
	beforeEach(() => jest.clearAllMocks());

	it('compares against the language the server already has', async () => {
		serverHolds({ defaultLanguage: 'he' });

		await setUserToDB(USER);

		expect(syncUserLanguage).toHaveBeenCalledWith('u1', 'he');
	});

	it('reports a missing server language as undefined', async () => {
		serverHolds({});

		await setUserToDB(USER);

		expect(syncUserLanguage).toHaveBeenCalledWith('u1', undefined);
	});

	it('does not trust an offline copy of the user document', async () => {
		serverHolds({}, true);

		await setUserToDB(USER);

		expect(syncUserLanguage).not.toHaveBeenCalled();
	});
});
