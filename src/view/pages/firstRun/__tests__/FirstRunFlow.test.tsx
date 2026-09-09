import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { Statement, User } from '@freedi/shared-types';
import { statementsSlice } from '@/redux/statements/statementsSlice';

const saveTermsAcceptance = jest.fn();
const saveResearchConsent = jest.fn();
const logOut = jest.fn();
const requestPermission = jest.fn();
let steps: string[] = ['terms', 'notifications'];

jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({
		t: (k: string) => (k === 'firstRun.stepOf' ? 'Step {{current}} of {{total}}' : k),
		dir: 'ltr',
	}),
}));
jest.mock('@/controllers/db/termsOfUse/termsOfUseService', () => ({
	saveTermsAcceptance: (...args: unknown[]) => saveTermsAcceptance(...args),
}));
jest.mock('@/controllers/db/researchLogs/researchConsentService', () => ({
	saveResearchConsent: (...args: unknown[]) => saveResearchConsent(...args),
}));
jest.mock('@/controllers/db/authenticationUtils', () => ({
	logOut: (...args: unknown[]) => logOut(...args),
}));
jest.mock('@/controllers/hooks/useNotifications', () => ({
	__esModule: true,
	default: () => ({
		requestPermission,
		permissionState: { permission: 'default', loading: false },
	}),
}));
jest.mock('@/services/notificationAnalytics', () => ({ trackPermissionRequest: jest.fn() }));
jest.mock('../useFirstRunSteps', () => ({ useFirstRunSteps: () => steps }));

import FirstRunFlow from '../FirstRunFlow';

const user = { uid: 'u1', displayName: 'Tester' } as unknown as User;

function renderFlow(path = '/home', statements: Statement[] = []) {
	const onDone = jest.fn();
	const store = configureStore({
		reducer: { statements: statementsSlice.reducer },
		preloadedState: { statements: { ...statementsSlice.getInitialState(), statements } },
	});
	render(
		<Provider store={store}>
			<MemoryRouter initialEntries={[path]}>
				<FirstRunFlow user={user} onDone={onDone} />
			</MemoryRouter>
		</Provider>,
	);

	return { onDone };
}

describe('FirstRunFlow', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		saveTermsAcceptance.mockResolvedValue('success');
		saveResearchConsent.mockResolvedValue(undefined);
		requestPermission.mockResolvedValue('granted');
		steps = ['terms', 'notifications'];
		window.localStorage.clear();
	});

	it('goes terms → notifications → done, saving the terms record once', async () => {
		const { onDone } = renderFlow();
		expect(screen.getByTestId('first-run-terms')).toBeInTheDocument();
		expect(screen.getByText('Step 1 of 2')).toBeInTheDocument();
		expect(screen.queryByTestId('first-run-research-consent')).not.toBeInTheDocument();

		fireEvent.click(document.getElementById('first-run-accept')!);
		await waitFor(() => expect(screen.getByTestId('first-run-notifications')).toBeInTheDocument());
		expect(saveTermsAcceptance).toHaveBeenCalledTimes(1);
		expect(saveTermsAcceptance.mock.calls[0][0]).toMatchObject({
			userId: 'u1',
			accepted: true,
			version: 'basic',
			text: 'Agreement Description',
		});
		expect(saveResearchConsent).not.toHaveBeenCalled();
		expect(onDone).not.toHaveBeenCalled();

		fireEvent.click(document.getElementById('first-run-enable-notifications')!);
		await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
		expect(requestPermission).toHaveBeenCalledTimes(1);
	});

	it('skip finishes the flow and starts the soft-prompt cooldown', async () => {
		const { onDone } = renderFlow();
		fireEvent.click(document.getElementById('first-run-accept')!);
		await waitFor(() => expect(screen.getByTestId('first-run-notifications')).toBeInTheDocument());
		fireEvent.click(document.getElementById('first-run-skip')!);
		expect(onDone).toHaveBeenCalledTimes(1);
		expect(requestPermission).not.toHaveBeenCalled();
		expect(window.localStorage.getItem('notification-soft-prompt-dismissed-at')).not.toBeNull();
	});

	it('ends after terms when the browser cannot ask for notifications', async () => {
		steps = ['terms'];
		const { onDone } = renderFlow();
		expect(screen.getByText('Step 1 of 1')).toBeInTheDocument();
		fireEvent.click(document.getElementById('first-run-accept')!);
		await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
	});

	it('offers research consent only for a research-enabled question and records the choice', async () => {
		const question = {
			statementId: 'q1',
			topParentId: 'q1',
			parentId: 'top',
			statement: 'Q',
			statementSettings: { enableResearchLogging: true },
		} as unknown as Statement;
		renderFlow('/statement/q1/options', [question]);
		const box = document.getElementById('first-run-research-consent') as HTMLInputElement;
		expect(box).toBeInTheDocument();
		fireEvent.click(box);
		fireEvent.click(document.getElementById('first-run-accept')!);
		await waitFor(() => expect(saveResearchConsent).toHaveBeenCalledWith('u1', 'q1', true));
	});

	it('shows the blocked message and stays on terms when the save is blocked', async () => {
		saveTermsAcceptance.mockResolvedValue('blocked');
		const { onDone } = renderFlow();
		fireEvent.click(document.getElementById('first-run-accept')!);
		await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
		expect(screen.getByTestId('first-run-terms')).toBeInTheDocument();
		expect(onDone).not.toHaveBeenCalled();
	});

	it("Don't agree signs the user out", async () => {
		logOut.mockResolvedValue(undefined);
		renderFlow();
		fireEvent.click(document.getElementById('first-run-decline')!);
		await waitFor(() => expect(logOut).toHaveBeenCalledTimes(1));
		expect(saveTermsAcceptance).not.toHaveBeenCalled();
	});
});
