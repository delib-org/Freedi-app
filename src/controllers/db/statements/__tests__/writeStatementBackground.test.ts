import { Statement, StatementType } from '@freedi/shared-types';
import { setStatementToDB } from '../writeStatement';
import { createStatementWithSubscription } from '../createStatementWithSubscription';

const mockSetDoc = jest.fn();
const mockSetSubscription = jest.fn();

jest.mock('firebase/firestore', () => ({
	setDoc: (...args: unknown[]) => mockSetDoc(...args),
	updateDoc: jest.fn(),
}));
jest.mock('@/utils/firebaseUtils', () => ({
	createStatementRef: (id: string) => ({ id }),
}));
// setStatements re-exports writeStatement and pulls in the Firestore config.
jest.mock('../setStatements', () => ({
	resultsSettingsDefault: {},
	createStatement: (...args: unknown[]) =>
		jest.requireMock('../createStatement').createStatement(...args),
	setStatementToDB: (...args: unknown[]) =>
		jest.requireActual('../writeStatement').setStatementToDB(...args),
}));
jest.mock('@/redux/pwa/pwaSlice', () => ({
	incrementOptionsCreated: jest.fn(),
	setHasCreatedGroup: jest.fn(),
	trackDiscussionAction: jest.fn(),
}));
jest.mock('@/redux/store', () => ({
	store: {
		getState: () => ({
			creator: { creator: { uid: 'u1', displayName: 'U', photoURL: '', email: '' } },
			statements: { statements: [] },
		}),
		dispatch: jest.fn(),
	},
}));
jest.mock('@/controllers/utils/colorUtils', () => ({
	getSiblingOptionsByParentId: () => [],
	getExistingOptionColors: () => [],
	getRandomColor: () => 'red',
}));
jest.mock('@/services/analytics', () => ({ analyticsService: { logEvent: jest.fn() } }));
jest.mock('@/services/logger', () => ({ logger: { info: jest.fn(), error: jest.fn() } }));
jest.mock('@/controllers/db/subscriptions/setSubscriptions', () => ({
	setStatementSubscriptionToDB: (...args: unknown[]) => mockSetSubscription(...args),
}));
jest.mock('@/services/notificationService', () => ({
	notificationService: { isInitialized: () => false, safeGetPermission: () => 'default' },
}));
jest.mock('@/controllers/general/helpers', () => ({
	validateStatementTypeHierarchy: () => ({ allowed: true }),
}));
jest.mock('@/controllers/db/researchLogs/researchLogger', () => ({
	logStatementCreation: jest.fn(),
}));
jest.mock('../createStatement', () => ({
	createStatement: ({ text }: { text: string }) => ({
		statementId: 'new1',
		statement: text,
		parentId: 'q1',
		topParentId: 'q1',
		statementType: 'option',
		creator: { uid: 'u1', displayName: 'U' },
	}),
}));

const parent = {
	statementId: 'q1',
	parentId: 'top',
	topParentId: 'q1',
	statement: 'Question',
	statementType: StatementType.question,
} as unknown as Statement;

const answer = {
	statementId: 'new1',
	statement: 'An answer',
	parentId: 'q1',
	topParentId: 'q1',
	statementType: StatementType.option,
} as unknown as Statement;

const never = () => new Promise<void>(() => undefined);
const settled = async (promise: Promise<unknown>) => {
	const marker = Symbol('pending');
	const winner = await Promise.race([
		promise,
		new Promise((resolve) => setTimeout(() => resolve(marker), 20)),
	]);

	return winner !== marker;
};

describe('statement writes that do not wait for the server', () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe('setStatementToDB', () => {
		it('waits for the server acknowledgement by default', async () => {
			mockSetDoc.mockImplementation(never);

			expect(await settled(setStatementToDB({ statement: answer, parentStatement: parent }))).toBe(
				false,
			);
		});

		it('resolves once the write is queued when onServerWriteError is given', async () => {
			mockSetDoc.mockImplementation(never);
			const result = setStatementToDB({
				statement: answer,
				parentStatement: parent,
				onServerWriteError: jest.fn(),
			});

			expect(await settled(result)).toBe(true);
			expect(await result).toEqual(expect.objectContaining({ statementId: 'new1' }));
			expect(mockSetDoc).toHaveBeenCalledTimes(1);
		});

		it('reports a server rejection through onServerWriteError', async () => {
			const rejection = new Error('permission-denied');
			mockSetDoc.mockRejectedValue(rejection);
			const onServerWriteError = jest.fn();

			await setStatementToDB({ statement: answer, parentStatement: parent, onServerWriteError });
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(onServerWriteError).toHaveBeenCalledWith(rejection);
		});
	});

	describe('createStatementWithSubscription', () => {
		const base = {
			newStatementParent: parent,
			title: 'An answer',
			newStatement: { statementType: StatementType.option },
			newStatementQuestionType: 'simple',
			currentLanguage: 'en',
			user: { uid: 'u1', displayName: 'U' },
		} as unknown as Parameters<typeof createStatementWithSubscription>[0];

		it('returns the id without waiting for the statement or subscription acks', async () => {
			mockSetDoc.mockImplementation(never);
			mockSetSubscription.mockImplementation(never);
			const dispatch = jest.fn();

			const result = createStatementWithSubscription({
				...base,
				dispatch,
				onServerWriteError: jest.fn(),
			});

			expect(await settled(result)).toBe(true);
			expect(await result).toBe('new1');
			expect(mockSetSubscription).toHaveBeenCalledTimes(1);
		});

		it('still waits for the subscription write by default', async () => {
			mockSetDoc.mockResolvedValue(undefined);
			mockSetSubscription.mockImplementation(never);

			expect(await settled(createStatementWithSubscription({ ...base, dispatch: jest.fn() }))).toBe(
				false,
			);
		});

		it('removes the optimistic statement when the server rejects it', async () => {
			const rejection = new Error('permission-denied');
			mockSetDoc.mockRejectedValue(rejection);
			mockSetSubscription.mockResolvedValue(undefined);
			const dispatch = jest.fn();
			const onServerWriteError = jest.fn();

			await createStatementWithSubscription({ ...base, dispatch, onServerWriteError });
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(onServerWriteError).toHaveBeenCalledWith(rejection);
			expect(dispatch).toHaveBeenCalledWith(
				expect.objectContaining({ type: 'statements/deleteStatement', payload: 'new1' }),
			);
		});
	});
});
