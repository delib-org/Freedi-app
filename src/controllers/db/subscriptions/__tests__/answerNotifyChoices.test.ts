import { Statement, StatementType } from '@freedi/shared-types';

const updateDocMock = jest.fn();
const getDocMock = jest.fn();
const setStatementSubscriptionToDBMock = jest.fn();
const updateNotificationPreferencesMock = jest.fn();
const requestPermission = jest.fn();
const registerForStatementNotifications = jest.fn();
const initialize = jest.fn();
const permission = jest.fn();
const callOrder: string[] = [];

jest.mock('firebase/firestore', () => ({
	getDoc: (...a: unknown[]) => getDocMock(...a),
	updateDoc: (...a: unknown[]) => updateDocMock(...a),
}));
jest.mock('@/utils/firebaseUtils', () => ({
	createSubscriptionRef: (id: string) => ({ id }),
	getCurrentTimestamp: () => 1000,
}));
jest.mock('@/controllers/general/helpers', () => ({
	getStatementSubscriptionId: (statementId: string, uid: string) => `${uid}--${statementId}`,
}));
jest.mock('../setSubscriptions', () => ({
	setStatementSubscriptionToDB: (...a: unknown[]) => setStatementSubscriptionToDBMock(...a),
	updateNotificationPreferences: (...a: unknown[]) => updateNotificationPreferencesMock(...a),
}));
jest.mock('@/services/notificationService', () => ({
	notificationService: {
		isSupported: () => true,
		safeGetPermission: () => permission(),
		isInitialized: () => false,
		initialize: (...a: unknown[]) => initialize(...a),
		requestPermission: (...a: unknown[]) => requestPermission(...a),
		registerForStatementNotifications: (...a: unknown[]) => registerForStatementNotifications(...a),
		getPushSubscriptionFields: () => ({ getPushNotification: false, pushToken: null }),
	},
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

import {
	markAnswerPromptClosed,
	readAnswerNotifyState,
	saveAnswerNotifyChoices,
	setAnswerNotifyChoice,
} from '../answerNotifyChoices';

const question = {
	statementId: 'q1',
	statement: 'Q',
	statementType: StatementType.question,
} as Statement;
const answer = {
	statementId: 'a1',
	statement: 'A',
	statementType: StatementType.option,
} as Statement;
const creator = { uid: 'u1', displayName: 'U', email: '', photoURL: '' };

const snap = (data?: Record<string, unknown>) => ({ exists: () => !!data, data: () => data });
const questionWrites = () => updateDocMock.mock.calls.filter(([ref]) => ref.id === 'u1--q1');

describe('answerNotifyChoices', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		callOrder.length = 0;
		permission.mockReturnValue('granted');
		requestPermission.mockResolvedValue(true);
		updateDocMock.mockResolvedValue(undefined);
		getDocMock.mockResolvedValue(snap({ getInAppNotification: true, getPushNotification: true }));
		setStatementSubscriptionToDBMock.mockResolvedValue(undefined);
	});

	describe('readAnswerNotifyState', () => {
		it('a missing subscription means not asked', async () => {
			getDocMock.mockResolvedValue(snap());
			await expect(readAnswerNotifyState('q1', 'u1')).resolves.toEqual({ asked: false });
		});

		it('choices without a marker are not asked; the marker means asked', async () => {
			getDocMock.mockResolvedValueOnce(snap({ notifyOnReplies: true }));
			expect((await readAnswerNotifyState('q1', 'u1')).asked).toBe(false);
			getDocMock.mockResolvedValueOnce(
				snap({ notifyPromptClosedAt: 5, notifyOnReplies: false, notifyOnNewAnswers: true }),
			);
			await expect(readAnswerNotifyState('q1', 'u1')).resolves.toEqual({
				asked: true,
				replies: false,
				newAnswers: true,
			});
		});
	});

	describe('markAnswerPromptClosed (dismiss)', () => {
		it('writes the marker only: no choices, no permission request', async () => {
			await markAnswerPromptClosed(question, creator);
			const [ref, data] = questionWrites()[0];
			expect(ref.id).toBe('u1--q1');
			expect(data.notifyPromptClosedAt).toBe(1000);
			expect(data).not.toHaveProperty('notifyOnReplies');
			expect(data).not.toHaveProperty('notifyOnNewAnswers');
			expect(requestPermission).not.toHaveBeenCalled();
		});

		it('updates the existing document (the create helper returns early when it exists)', async () => {
			await markAnswerPromptClosed(question, creator);
			expect(setStatementSubscriptionToDBMock).toHaveBeenCalledWith(
				expect.objectContaining({ statement: question, creator }),
			);
			expect(updateDocMock).toHaveBeenCalled();
		});
	});

	describe('saveAnswerNotifyChoices', () => {
		it('both unticked is saved as false, false with the marker; no dialog, no channel changes', async () => {
			permission.mockReturnValue('default');
			const result = await saveAnswerNotifyChoices({
				question,
				answer,
				creator,
				replies: false,
				newAnswers: false,
			});
			expect(result).toEqual({ permissionRefused: false });
			expect(questionWrites()[0][1]).toMatchObject({
				notifyOnReplies: false,
				notifyOnNewAnswers: false,
				notifyPromptClosedAt: 1000,
				statementId: 'q1',
			});
			expect(requestPermission).not.toHaveBeenCalled();
			expect(updateNotificationPreferencesMock).not.toHaveBeenCalled();
		});

		it('asks the browser before the first await, from the click itself', async () => {
			permission.mockReturnValue('default');
			requestPermission.mockImplementation(() => {
				callOrder.push('permission');

				return Promise.resolve(true);
			});
			updateDocMock.mockImplementation(async () => {
				callOrder.push('write');
			});
			const pending = saveAnswerNotifyChoices({
				question,
				answer,
				creator,
				replies: true,
				newAnswers: false,
			});
			// Synchronously after the call returned its promise, before any microtask ran:
			expect(callOrder).toEqual(['permission']);
			await pending;
			expect(callOrder[0]).toBe('permission');
		});

		it('reports a refusal and does not retry', async () => {
			permission.mockReturnValue('default');
			requestPermission.mockResolvedValue(false);
			const result = await saveAnswerNotifyChoices({
				question,
				answer,
				creator,
				replies: true,
				newAnswers: true,
			});
			expect(result).toEqual({ permissionRefused: true });
			expect(requestPermission).toHaveBeenCalledTimes(1);
		});

		it('skipPermission (iOS, not installed) never asks the browser', async () => {
			permission.mockReturnValue('default');
			await saveAnswerNotifyChoices({
				question,
				answer,
				creator,
				replies: true,
				newAnswers: true,
				skipPermission: true,
			});
			expect(requestPermission).not.toHaveBeenCalled();
			expect(questionWrites()).toHaveLength(1);
		});

		it('granted: registers the token on the matching subscriptions (answer for replies, question for new answers)', async () => {
			await saveAnswerNotifyChoices({
				question,
				answer,
				creator,
				replies: true,
				newAnswers: true,
			});
			expect(requestPermission).not.toHaveBeenCalled();
			expect(registerForStatementNotifications).toHaveBeenCalledWith('u1', null, 'a1');
			expect(registerForStatementNotifications).toHaveBeenCalledWith('u1', null, 'q1');
		});

		it('only the ticked event registers', async () => {
			await saveAnswerNotifyChoices({
				question,
				answer,
				creator,
				replies: false,
				newAnswers: true,
			});
			expect(registerForStatementNotifications).toHaveBeenCalledTimes(1);
			expect(registerForStatementNotifications).toHaveBeenCalledWith('u1', null, 'q1');
		});

		it('switches in-app on if it was off, and never switches a channel off', async () => {
			getDocMock.mockResolvedValue(
				snap({
					getInAppNotification: false,
					getPushNotification: true,
					getEmailNotification: true,
				}),
			);
			await saveAnswerNotifyChoices({
				question,
				answer,
				creator,
				replies: true,
				newAnswers: false,
			});
			expect(updateNotificationPreferencesMock).toHaveBeenCalledWith('a1', 'u1', {
				getInAppNotification: true,
			});
		});

		it('writes the answer subscription itself when the background write has not landed', async () => {
			getDocMock
				.mockResolvedValueOnce(snap()) // answer sub missing
				.mockResolvedValue(snap({ getInAppNotification: true, getPushNotification: true }));
			await saveAnswerNotifyChoices({
				question,
				answer,
				creator,
				replies: true,
				newAnswers: false,
			});
			expect(setStatementSubscriptionToDBMock).toHaveBeenCalledWith(
				expect.objectContaining({ statement: answer, creator }),
			);
		});

		it('a failed write rejects with no marker written', async () => {
			updateDocMock.mockRejectedValue(new Error('offline'));
			await expect(
				saveAnswerNotifyChoices({ question, answer, creator, replies: true, newAnswers: false }),
			).rejects.toThrow('offline');
		});
	});

	describe('setAnswerNotifyChoice (settings)', () => {
		it('saves one field and also sets the marker', async () => {
			await setAnswerNotifyChoice(question, creator, 'notifyOnReplies', false);
			expect(questionWrites()[0][1]).toMatchObject({
				notifyOnReplies: false,
				notifyPromptClosedAt: 1000,
			});
			expect(questionWrites()[0][1]).not.toHaveProperty('notifyOnNewAnswers');
		});
	});
});
