import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { Statement, StatementType } from '@freedi/shared-types';
import { creatorSlice, setCreator } from '@/redux/creator/creatorSlice';
import { statementsSlice, setStatement } from '@/redux/statements/statementsSlice';

const readState = jest.fn();
const setChoice = jest.fn();
const permission = jest.fn();

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}));
jest.mock('@/controllers/db/subscriptions/answerNotifyChoices', () => ({
	readAnswerNotifyState: (...a: unknown[]) => readState(...a),
	setAnswerNotifyChoice: (...a: unknown[]) => setChoice(...a),
}));
jest.mock('@/services/notificationService', () => ({
	notificationService: {
		isSupported: () => permission() !== 'unsupported',
		safeGetPermission: () => permission(),
		getToken: () => null,
		registerForStatementNotifications: jest.fn(),
		initialize: jest.fn(),
		requestPermission: jest.fn(),
	},
}));
jest.mock('@/controllers/db/subscriptions/setSubscriptions', () => ({
	updateNotificationPreferences: jest.fn(),
}));
jest.mock('firebase/auth', () => ({ getAuth: () => ({ currentUser: null }) }));
jest.mock('firebase/firestore', () => ({ doc: jest.fn(), getDoc: jest.fn() }));
jest.mock('@/controllers/db/config', () => ({ DB: {} }));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

import NotificationSettingsButton from '../NotificationSettingsButton';

const creator = { uid: 'u1', displayName: 'U', email: '', photoURL: '' };
const question = {
	statementId: 'q1',
	statement: 'Q',
	statementType: StatementType.question,
} as Statement;
const answer = {
	statementId: 'a1',
	statement: 'A',
	parentId: 'q1',
	statementType: StatementType.option,
} as Statement;

function setup(statementId: string) {
	const store = configureStore({
		reducer: { creator: creatorSlice.reducer, statements: statementsSlice.reducer },
		middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
	});
	store.dispatch(setCreator(creator));
	store.dispatch(setStatement(question));
	store.dispatch(setStatement(answer));
	render(
		<Provider store={store}>
			<NotificationSettingsButton statementId={statementId} />
		</Provider>,
	);
}

async function openPanel(): Promise<void> {
	fireEvent.click(await screen.findByTitle('Notification settings'));
}

describe('Notification settings: what to notify me about', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		permission.mockReturnValue('granted');
		readState.mockResolvedValue({ asked: false });
		setChoice.mockResolvedValue(undefined);
	});

	it('absent choices display as ticked (today the person is notified)', async () => {
		setup('q1');
		await openPanel();
		expect(await screen.findByText('What to notify me about')).toBeInTheDocument();
		expect(screen.getByLabelText('Replies to my answers')).toBeChecked();
		expect(screen.getByLabelText('New answers to this question')).toBeChecked();
	});

	it('shows saved choices', async () => {
		readState.mockResolvedValue({ asked: true, replies: false, newAnswers: true });
		setup('q1');
		await openPanel();
		await waitFor(() => expect(screen.getByLabelText('Replies to my answers')).not.toBeChecked());
		expect(screen.getByLabelText('New answers to this question')).toBeChecked();
	});

	it('a toggle is saved at once', async () => {
		setup('q1');
		await openPanel();
		fireEvent.click(await screen.findByLabelText('New answers to this question'));
		await waitFor(() =>
			expect(setChoice).toHaveBeenCalledWith(
				expect.objectContaining({ statementId: 'q1' }),
				creator,
				'notifyOnNewAnswers',
				false,
			),
		);
	});

	it('a failed save puts the box back', async () => {
		setChoice.mockRejectedValue(new Error('offline'));
		setup('q1');
		await openPanel();
		const box = await screen.findByLabelText('Replies to my answers');
		fireEvent.click(box);
		await waitFor(() => expect(setChoice).toHaveBeenCalled());
		await waitFor(() => expect(screen.getByLabelText('Replies to my answers')).toBeChecked());
	});

	it('stays reachable when push is blocked, undecided or unsupported', async () => {
		for (const state of ['denied', 'default', 'unsupported']) {
			permission.mockReturnValue(state);
			const { unmount } = render(<div />);
			unmount();
			document.body.innerHTML = '';
			setup('q1');
			await openPanel();
			expect(await screen.findByText('What to notify me about')).toBeInTheDocument();
			document.body.innerHTML = '';
		}
	});

	it('an answer-level panel has no choices section (they belong to the question)', async () => {
		setup('a1');
		await openPanel();
		await screen.findByText('How to notify me');
		expect(screen.queryByText('What to notify me about')).toBeNull();
	});
});
