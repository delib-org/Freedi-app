/**
 * A statement on a loop of parents, or one the stamping trigger has quarantined,
 * has no real place in a tree: the participation gate refuses it to everyone.
 */
jest.mock(
	'firebase-admin/firestore',
	() => jest.requireActual('../../services/__tests__/helpers/fakeFirestore').firestoreModule,
);
jest.mock('firebase-functions/v2/https', () => {
	class HttpsError extends Error {
		constructor(
			readonly code: string,
			message: string,
		) {
			super(message);
		}
	}

	return { HttpsError };
});
jest.mock('../errorHandling', () => ({ logError: jest.fn() }));
jest.mock('../../progress/assertStatementAdmin', () => ({
	findStatementAdminSource: jest.fn().mockResolvedValue('topSubscription'),
}));

import { QUARANTINED_ACCESS_SCOPE } from '@freedi/shared-types';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { resetFirestore, seed } from '../../services/__tests__/helpers/fakeFirestore';
import { resolveQuestionParticipation, resolveStatementAccess } from '../statementAccess';

const db = getFirestore() as unknown as Firestore;
const UID = 'me';

beforeEach(() => {
	resetFirestore();
	seed('statements', 'root', {
		statementId: 'root',
		parentId: 'top',
		topParentId: 'root',
		membership: { access: 'public' },
	});
	seed('statementsSubscribe', `${UID}--root`, { userId: UID, statementId: 'root', role: 'admin' });
});

describe('loops and quarantine', () => {
	it('refuses a statement that is its own parent, even to a host of the top it claims', async () => {
		seed('statements', 'S', { statementId: 'S', parentId: 'S', topParentId: 'root' });

		await expect(resolveQuestionParticipation(db, UID, 'S')).rejects.toMatchObject({
			code: 'not-found',
		});
		await expect(resolveStatementAccess(db, UID, 'S')).rejects.toMatchObject({
			code: 'not-found',
		});
	});

	it('refuses each member of a longer loop', async () => {
		seed('statements', 'A', { statementId: 'A', parentId: 'B', topParentId: 'root' });
		seed('statements', 'B', { statementId: 'B', parentId: 'A', topParentId: 'root' });

		await expect(resolveQuestionParticipation(db, UID, 'A')).rejects.toMatchObject({
			code: 'not-found',
		});
	});

	it('refuses a statement already stamped as quarantined', async () => {
		seed('statements', 'q', {
			statementId: 'q',
			parentId: 'root',
			topParentId: 'root',
			accessScope: QUARANTINED_ACCESS_SCOPE,
		});

		await expect(resolveStatementAccess(db, UID, 'q')).rejects.toMatchObject({
			code: 'not-found',
		});
	});

	it('still lets a host into an honest question beside them', async () => {
		seed('statements', 'q', {
			statementId: 'q',
			parentId: 'root',
			topParentId: 'root',
			accessScope: 'open',
		});

		await expect(resolveStatementAccess(db, UID, 'q')).resolves.toMatchObject({
			topParentId: 'root',
		});
	});
});
