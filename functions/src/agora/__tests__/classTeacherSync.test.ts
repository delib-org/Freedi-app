import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const classUpdate = jest.fn<() => Promise<void>>();
const aggregateUpdate = jest.fn<() => Promise<void>>();

jest.mock('../../db', () => ({
	db: {
		collection: (name: string) => ({
			doc: () => ({
				update: name === 'agoraClassAggregates' ? aggregateUpdate : classUpdate,
			}),
		}),
	},
}));
jest.mock('firebase-admin/firestore', () => ({
	FieldValue: {
		increment: jest.fn(),
		arrayUnion: jest.fn(),
		arrayRemove: jest.fn(),
		delete: jest.fn(),
	},
}));
jest.mock('../joinCodes', () => ({ generateUniqueClassCode: async () => '123456' }));
jest.mock('../../utils/errorHandling', () => ({ logError: jest.fn() }));
const revokeHome = jest.fn<(db: unknown, classId: string, uid: string) => Promise<number>>();
jest.mock('../../classroom/classHome', () => ({
	revokeClassHomeTeacher: (db: unknown, classId: string, uid: string) =>
		revokeHome(db, classId, uid),
}));

import { addClassTeacher, removeClassTeacher } from '../classes';

describe('the aggregate follows the class teacher map', () => {
	beforeEach(() => {
		classUpdate.mockReset().mockResolvedValue(undefined);
		aggregateUpdate.mockReset();
		revokeHome.mockReset().mockResolvedValue(0);
	});

	it('a removed teacher loses the join-class home of the class; an added one is not touched', async () => {
		aggregateUpdate.mockResolvedValue(undefined);
		await removeClassTeacher('c1', 'u1');
		expect(revokeHome).toHaveBeenCalledWith(expect.anything(), 'c1', 'u1');
		revokeHome.mockClear();
		await addClassTeacher('c1', 'u2');
		expect(revokeHome).not.toHaveBeenCalled();
	});

	it('a failed home revoke fails the removal, so the admin retries', async () => {
		aggregateUpdate.mockResolvedValue(undefined);
		revokeHome.mockRejectedValue(new Error('unavailable'));
		await expect(removeClassTeacher('c1', 'u1')).rejects.toThrow('unavailable');
	});

	it('a class that never finished a game has no aggregate to update', async () => {
		aggregateUpdate.mockRejectedValue(Object.assign(new Error('not found'), { code: 5 }));

		await expect(addClassTeacher('c1', 'u1')).resolves.toBeUndefined();
		await expect(removeClassTeacher('c1', 'u1')).resolves.toBeUndefined();
	});

	it('any other failure fails the call, so a removed teacher is not left reading', async () => {
		aggregateUpdate.mockRejectedValue(Object.assign(new Error('unavailable'), { code: 14 }));

		await expect(removeClassTeacher('c1', 'u1')).rejects.toThrow('unavailable');
		expect(classUpdate).toHaveBeenCalledTimes(1);
	});
});
