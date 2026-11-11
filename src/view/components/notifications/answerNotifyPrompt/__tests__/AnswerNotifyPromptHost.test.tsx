import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { Statement, StatementType } from '@freedi/shared-types';
import { answerNotifyPromptSlice } from '@/redux/answerNotifyPrompt/answerNotifyPromptSlice';
import { creatorSlice, setCreator } from '@/redux/creator/creatorSlice';
import { statementsSlice, setStatement } from '@/redux/statements/statementsSlice';
import { announceAnswerPublished } from '@/controllers/db/subscriptions/answerPublished';

const readState = jest.fn();
const save = jest.fn();
const mark = jest.fn();
const permission = jest.fn();
const platform = { ios: false, installed: true };

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => key, currentLanguage: 'en' }),
}));
jest.mock('@/controllers/db/subscriptions/answerNotifyChoices', () => ({
	ANSWER_NOTIFY_DEFAULTS: { replies: true, newAnswers: false },
	readAnswerNotifyState: (...a: unknown[]) => readState(...a),
	saveAnswerNotifyChoices: (...a: unknown[]) => save(...a),
	markAnswerPromptClosed: (...a: unknown[]) => mark(...a),
}));
jest.mock('@/controllers/db/statements/getStatement', () => ({
	getStatementFromDB: jest.fn(async () => undefined),
}));
jest.mock('@/services/notificationService', () => ({
	notificationService: {
		safeGetPermission: () => permission(),
		isSupported: () => permission() !== 'unsupported',
	},
}));
jest.mock('@/services/platformService', () => ({
	isIOS: () => platform.ios,
	isInstalledPWA: () => platform.installed,
}));
jest.mock('@/utils/errorHandling', () => ({ logError: jest.fn() }));

import AnswerNotifyPromptHost from '../AnswerNotifyPromptHost';

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

function setup() {
	const store = configureStore({
		reducer: {
			answerNotifyPrompt: answerNotifyPromptSlice.reducer,
			creator: creatorSlice.reducer,
			statements: statementsSlice.reducer,
		},
		middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }),
	});
	store.dispatch(setCreator(creator));
	store.dispatch(setStatement(question));
	store.dispatch(setStatement(answer));
	render(
		<Provider store={store}>
			<AnswerNotifyPromptHost />
		</Provider>,
	);

	return store;
}

/** The real reporting function an add path calls. */
const publish = (store: ReturnType<typeof setup>): void => {
	act(() => {
		announceAnswerPublished(store.dispatch, 'a1', question);
	});
};

describe('AnswerNotifyPromptHost', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		readState.mockResolvedValue({ asked: false });
		save.mockResolvedValue({ permissionRefused: false });
		mark.mockResolvedValue(undefined);
		permission.mockReturnValue('granted');
		platform.ios = false;
		platform.installed = true;
	});

	it('asks on the first answer: replies ticked, new answers unticked', async () => {
		const store = setup();
		expect(screen.queryByTestId('answer-notify-prompt')).toBeNull();
		publish(store);
		await screen.findByTestId('answer-notify-prompt');
		expect(readState).toHaveBeenCalledWith('q1', 'u1');
		expect(screen.getByLabelText('Replies to my answers')).toBeChecked();
		expect(screen.getByLabelText('New answers to this question')).not.toBeChecked();
	});

	it('does not ask again once the marker exists (later answers reuse the choice)', async () => {
		readState.mockResolvedValue({ asked: true, replies: true, newAnswers: false });
		const store = setup();
		publish(store);
		await waitFor(() => expect(readState).toHaveBeenCalled());
		await waitFor(() => expect(store.getState().answerNotifyPrompt.pending).toBeNull());
		expect(screen.queryByTestId('answer-notify-prompt')).toBeNull();
		expect(save).not.toHaveBeenCalled();
		expect(mark).not.toHaveBeenCalled();
	});

	it('Not now writes the marker only, never the choices', async () => {
		const store = setup();
		publish(store);
		await screen.findByTestId('answer-notify-prompt');
		fireEvent.click(screen.getByText('Not now'));
		await waitFor(() =>
			expect(mark).toHaveBeenCalledWith(expect.objectContaining({ statementId: 'q1' }), creator),
		);
		expect(save).not.toHaveBeenCalled();
		await waitFor(() => expect(screen.queryByTestId('answer-notify-prompt')).toBeNull());
	});

	it('Esc is the same dismiss', async () => {
		const store = setup();
		publish(store);
		await screen.findByTestId('answer-notify-prompt');
		fireEvent.keyDown(document, { key: 'Escape' });
		await waitFor(() => expect(mark).toHaveBeenCalledTimes(1));
		expect(save).not.toHaveBeenCalled();
	});

	it('Save with both unticked is a valid answer (false, false)', async () => {
		const store = setup();
		publish(store);
		await screen.findByTestId('answer-notify-prompt');
		fireEvent.click(screen.getByLabelText('Replies to my answers'));
		fireEvent.click(screen.getByText('Save'));
		await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
		expect(save).toHaveBeenCalledWith(
			expect.objectContaining({
				question: expect.objectContaining({ statementId: 'q1' }),
				answer: expect.objectContaining({ statementId: 'a1' }),
				creator,
				replies: false,
				newAnswers: false,
			}),
		);
		expect(mark).not.toHaveBeenCalled();
		await waitFor(() => expect(screen.queryByTestId('answer-notify-prompt')).toBeNull());
	});

	it('Save with both ticked sends both', async () => {
		const store = setup();
		publish(store);
		await screen.findByTestId('answer-notify-prompt');
		fireEvent.click(screen.getByLabelText('New answers to this question'));
		fireEvent.click(screen.getByText('Save'));
		await waitFor(() => expect(save).toHaveBeenCalled());
		expect(save.mock.calls[0][0]).toMatchObject({ replies: true, newAnswers: true });
	});

	it('a failed save closes without a marker, so the next answer asks again', async () => {
		save.mockRejectedValue(new Error('offline'));
		const store = setup();
		publish(store);
		await screen.findByTestId('answer-notify-prompt');
		fireEvent.click(screen.getByText('Save'));
		await waitFor(() => expect(screen.queryByTestId('answer-notify-prompt')).toBeNull());
		expect(mark).not.toHaveBeenCalled();
	});

	it('shows the blocked line once when the browser refuses on Save', async () => {
		permission.mockReturnValue('default');
		save.mockResolvedValue({ permissionRefused: true });
		const store = setup();
		publish(store);
		await screen.findByText('Your browser will ask for permission next.');
		fireEvent.click(screen.getByText('Save'));
		await screen.findByText(
			'Push is blocked in your browser settings. You can still see notifications here.',
		);
		expect(screen.queryByText('Your browser will ask for permission next.')).toBeNull();
	});

	it('denied: shows the blocked line, Save still saves, and no dialog is promised', async () => {
		permission.mockReturnValue('denied');
		const store = setup();
		publish(store);
		await screen.findByText(
			'Push is blocked in your browser settings. You can still see notifications here.',
		);
		expect(screen.queryByText('Your browser will ask for permission next.')).toBeNull();
		fireEvent.click(screen.getByText('Save'));
		await waitFor(() => expect(save).toHaveBeenCalled());
	});

	it('unsupported device: says so and still saves', async () => {
		permission.mockReturnValue('unsupported');
		const store = setup();
		publish(store);
		await screen.findByText(
			"This device can't show push notifications. You can still see them in the app.",
		);
		fireEvent.click(screen.getByText('Save'));
		await waitFor(() => expect(save).toHaveBeenCalled());
	});

	it('iOS not installed: Install app saves the ticks without the dialog, then opens the install prompt', async () => {
		permission.mockReturnValue('default');
		platform.ios = true;
		platform.installed = false;
		const opened = jest.fn();
		window.addEventListener('freedi:open-install-prompt', opened);
		const store = setup();
		publish(store);
		await screen.findByText('Install the app to your home screen to get push notifications.');
		fireEvent.click(screen.getByText('Install app'));
		await waitFor(() => expect(opened).toHaveBeenCalled());
		expect(save.mock.calls[0][0]).toMatchObject({ skipPermission: true });
		window.removeEventListener('freedi:open-install-prompt', opened);
	});

	it('an answer under something that is not a question never raises it', async () => {
		const store = setup();
		act(() => {
			announceAnswerPublished(store.dispatch, 'a1', {
				...question,
				statementType: StatementType.group,
			});
		});
		expect(store.getState().answerNotifyPrompt.pending).toBeNull();
		expect(screen.queryByTestId('answer-notify-prompt')).toBeNull();
	});
});
