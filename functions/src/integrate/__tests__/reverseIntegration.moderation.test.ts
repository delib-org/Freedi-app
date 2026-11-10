import { Collections } from '@freedi/shared-types';
import { createFakeDb, FakeDb } from '../../progress/__tests__/fakeDb';

let fake: FakeDb = createFakeDb();

jest.mock('firebase-admin/firestore', () => ({
	getFirestore: () => fake.db,
	FieldValue: { delete: jest.fn(() => ({ _delete: true })) },
}));
jest.mock('firebase-functions', () => ({ logger: { info: jest.fn(), warn: jest.fn() } }));

import { reverseIntegration } from '../reverseIntegration';

const HELD_MARK = { reason: 'inappropriate-language', hiddenAt: 1, eventId: 'e' };

function read(id: string): Record<string, unknown> | undefined {
	return fake.read(Collections.statements, id);
}

beforeEach(() => {
	fake = createFakeDb();
	fake.seed(Collections.statements, 'cluster', {
		statementId: 'cluster',
		parentId: 'question',
		isCluster: true,
		integratedOptions: ['plain', 'flagged', 'restored'],
	});
	fake.seed(Collections.statements, 'plain', { hide: true, integratedInto: 'cluster' });
	fake.seed(Collections.statements, 'flagged', {
		hide: true,
		integratedInto: 'cluster',
		answerModeration: HELD_MARK,
	});
	fake.seed(Collections.statements, 'restored', {
		hide: true,
		integratedInto: 'cluster',
		answerModeration: { ...HELD_MARK, restoredAt: 2 },
	});
});

describe('reverseIntegration and the automatic check', () => {
	it('re-shows ordinary originals', async () => {
		await reverseIntegration({ clusterStatementId: 'cluster', reversedByUserId: 'admin' });

		expect(read('plain')?.hide).toBe(false);
		expect(read('plain')?.integratedInto).toBeUndefined();
	});

	it('detaches a flagged original but leaves it hidden', async () => {
		const result = await reverseIntegration({
			clusterStatementId: 'cluster',
			reversedByUserId: 'admin',
		});

		expect(read('flagged')?.hide).toBe(true);
		expect(read('flagged')?.integratedInto).toBeUndefined();
		expect(result.restoredOriginalIds).not.toContain('flagged');
	});

	it('re-shows an answer a host already restored', async () => {
		const result = await reverseIntegration({
			clusterStatementId: 'cluster',
			reversedByUserId: 'admin',
		});

		expect(read('restored')?.hide).toBe(false);
		expect(result.restoredOriginalIds).toContain('restored');
	});
});
