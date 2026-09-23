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

import { addClassTeacher, removeClassTeacher } from '../classes';

describe('the aggregate follows the class teacher map', () => {
	beforeEach(() => {
		classUpdate.mockReset().mockResolvedValue(undefined);
		aggregateUpdate.mockReset();
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
