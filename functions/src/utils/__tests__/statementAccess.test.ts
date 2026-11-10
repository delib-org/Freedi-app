/**
 * The participation gate: bans and private groups anywhere up the tree, hidden
 * questions, and waiting subscribers.
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

const mockAdminSource = jest.fn();
jest.mock('../../progress/assertStatementAdmin', () => ({
	findStatementAdminSource: (...args: unknown[]) => mockAdminSource(...args),
}));

import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { resetFirestore, seed } from '../../services/__tests__/helpers/fakeFirestore';
import { resolveQuestionParticipation } from '../statementAccess';

const db = getFirestore() as unknown as Firestore;
const UID = 'me';

function statement(id: string, data: Record<string, unknown>): void {
	seed('statements', id, { statementId: id, topParentId: 'top-group', ...data });
}

function role(statementId: string, value: string): void {
	seed('statementsSubscribe', `${UID}--${statementId}`, {
		userId: UID,
		statementId,
		role: value,
	});
}

/** top-group (access given) -> middle -> q */
function tree(
	access: { top?: string; middle?: string; question?: string } = {},
	extra: { middle?: Record<string, unknown>; question?: Record<string, unknown> } = {},
): void {
	const membership = (value?: string) => (value ? { membership: { access: value } } : {});
	statement('top-group', { parentId: 'top', statementType: 'group', ...membership(access.top) });
	statement('middle', {
		parentId: 'top-group',
		parents: ['top-group'],
		statementType: 'group',
		...membership(access.middle),
		...extra.middle,
	});
	statement('q', {
		parentId: 'middle',
		parents: ['top-group', 'middle'],
		statementType: 'question',
		...membership(access.question),
		...extra.question,
	});
}

const call = () => resolveQuestionParticipation(db, UID, 'q');

beforeEach(() => {
	resetFirestore();
	mockAdminSource.mockReset();
	mockAdminSource.mockResolvedValue(null);
});

describe('resolveQuestionParticipation', () => {
	it('is not-found for a missing question', async () => {
		await expect(call()).rejects.toMatchObject({ code: 'not-found' });
	});

	it('lets anyone into a public question', async () => {
		tree({ question: 'public' });

		await expect(call()).resolves.toMatchObject({ statementId: 'q' });
	});

	it('inherits access from the nearest ancestor', async () => {
		tree({ top: 'public', middle: 'secret' });

		await expect(call()).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('honours a private group in between, even for a member of the top', async () => {
		tree({ top: 'secret', middle: 'secret' });
		role('top-group', 'member');

		await expect(call()).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('lets a member of the private group in', async () => {
		tree({ top: 'secret', middle: 'secret' });
		role('middle', 'member');

		await expect(call()).resolves.toMatchObject({ statementId: 'q' });
	});

	it('lets a member of the top in when no level closer sets access', async () => {
		tree({ top: 'secret' });
		role('top-group', 'member');

		await expect(call()).resolves.toMatchObject({ statementId: 'q' });
	});

	it('lets a question’s own setting win, as the app does', async () => {
		tree({ top: 'secret', middle: 'secret', question: 'public' });

		await expect(call()).resolves.toMatchObject({ statementId: 'q' });
	});

	it('refuses a ban at any level, even on an open question', async () => {
		tree({ question: 'public' });
		role('middle', 'banned');

		await expect(call()).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('lets a host at any level in', async () => {
		tree({ top: 'secret', middle: 'secret' });
		role('top-group', 'admin');

		await expect(call()).resolves.toMatchObject({ statementId: 'q' });
	});

	it('refuses someone waiting on an open-to-all question', async () => {
		tree({ question: 'openToAll' });
		role('q', 'waiting');

		await expect(call()).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('lets someone waiting into a public question, as the app does', async () => {
		tree({ question: 'public' });
		role('q', 'waiting');

		await expect(call()).resolves.toMatchObject({ statementId: 'q' });
	});

	it('hides a hidden question from a non-admin, whatever its access', async () => {
		tree({ question: 'public' }, { question: { hide: true } });

		await expect(call()).rejects.toMatchObject({ code: 'not-found' });
	});

	it('hides a question under a hidden ancestor', async () => {
		tree({ question: 'public' }, { middle: { hide: true } });

		await expect(call()).rejects.toMatchObject({ code: 'not-found' });
	});

	it('lets an admin reach a hidden question', async () => {
		mockAdminSource.mockResolvedValue('subscription');
		tree({ question: 'secret' }, { question: { hide: true } });

		await expect(call()).resolves.toMatchObject({ statementId: 'q' });
	});

	it('treats an admin of a middle group as an admin of a hidden question', async () => {
		tree({ question: 'secret' }, { question: { hide: true } });
		role('middle', 'admin');

		await expect(call()).resolves.toMatchObject({ statementId: 'q' });
		expect(mockAdminSource).not.toHaveBeenCalled();
	});

	it('does not let a plain member of a middle group reach a hidden question', async () => {
		tree({ question: 'public' }, { question: { hide: true } });
		role('middle', 'member');

		await expect(call()).rejects.toMatchObject({ code: 'not-found' });
	});

	it('still refuses a banned admin of a hidden question', async () => {
		mockAdminSource.mockResolvedValue('subscription');
		tree({ question: 'secret' }, { question: { hide: true } });
		role('q', 'banned');

		await expect(call()).rejects.toMatchObject({ code: 'permission-denied' });
	});

	it('copes with a legacy question that has no parents list', async () => {
		statement('top-group', { parentId: 'top', membership: { access: 'secret' } });
		statement('q', { parentId: 'top-group', statementType: 'question' });
		role('top-group', 'member');

		await expect(call()).resolves.toMatchObject({ statementId: 'q' });
	});
});
