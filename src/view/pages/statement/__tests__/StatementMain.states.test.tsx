import { fireEvent, render, screen } from '@testing-library/react';
import StatementMain from '../StatementMain';
import { COMPONENT_STATES, ComponentState } from '../constants';

const mockResetError = jest.fn();
let mockState: ComponentState;

// StatementMain uses `import React from 'react'`; ts-jest here has no esModuleInterop.
jest.mock('react', () => {
	const actual = jest.requireActual('react');

	return { ...actual, __esModule: true, default: actual };
});
jest.mock('react-redux', () => ({ useDispatch: () => jest.fn() }));
jest.mock('@/controllers/hooks/useTranslation', () => ({
	useTranslation: () => ({ t: (key: string) => `t:${key}` }),
}));
jest.mock('../hooks/useStatementData', () => ({
	useStatementData: () => ({ error: 'Network down', resetError: mockResetError }),
}));
jest.mock('../hooks/useComponentState', () => ({
	useComponentState: () => ({ currentState: mockState }),
}));
jest.mock('@/controllers/hooks/useAuthorization', () => ({
	useAuthorization: () => ({ isAuthorized: false, loading: false, isWaitingForApproval: false }),
}));
jest.mock('../hooks/useStatementListeners', () => ({ useStatementListeners: jest.fn() }));
jest.mock('../hooks/useNotificationSetup', () => ({ useNotificationSetup: jest.fn() }));
jest.mock('../hooks/useDocumentTitle', () => ({ useDocumentTitle: jest.fn() }));
jest.mock('../hooks/useMarkDiscussionRead', () => ({ useMarkDiscussionRead: jest.fn() }));
jest.mock('@/controllers/hooks/useTreeSeenMarkers', () => ({ useTreeSeenMarkers: jest.fn() }));
jest.mock('@/controllers/hooks/useStatementViewTracking', () => ({
	useStatementViewTracking: () => ({ elementRef: { current: null } }),
}));
jest.mock('@/controllers/hooks/reduxHooks', () => ({ useAppSelector: () => null }));
jest.mock('@/services/analytics', () => ({ analyticsService: {} }));
jest.mock('@/controllers/hooks/panelUtils', () => ({ closePanels: jest.fn() }));
jest.mock('@/redux/creator/creatorSlice', () => ({ creatorSelector: jest.fn() }));
jest.mock('@/redux/statements/newStatementSlice', () => ({
	setShowNewStatementModal: jest.fn(),
}));
jest.mock('@/redux/utils/selectorFactories', () => ({
	createStatementsByParentSelector: jest.fn(),
}));
jest.mock('../components/StatementProvider', () => ({ StatementProvider: () => null }));
jest.mock('../components/StatementErrorBoundary', () => ({
	StatementErrorBoundary: ({ children }: { children: unknown }) => children,
}));
jest.mock('../../loadingPage/LoadingPage', () => ({ __esModule: true, default: () => null }));
jest.mock('../../page404/Page404', () => ({ __esModule: true, default: () => null }));
jest.mock('../../page401/Page401', () => ({
	__esModule: true,
	default: () => <div data-testid="page-401" />,
}));
jest.mock('../../waiting/WaitingPage', () => ({
	__esModule: true,
	default: () => <div data-testid="waiting-page" />,
}));

describe('StatementMain closed states', () => {
	it('uses the shared waiting page', () => {
		mockState = COMPONENT_STATES.WAITING_APPROVAL;
		render(<StatementMain />);

		expect(screen.getByTestId('waiting-page')).toBeInTheDocument();
	});

	it('uses the shared 401 page', () => {
		mockState = COMPONENT_STATES.UNAUTHORIZED;
		render(<StatementMain />);

		expect(screen.getByTestId('page-401')).toBeInTheDocument();
	});

	it('translates the error and the retry button', () => {
		mockState = COMPONENT_STATES.ERROR;
		render(<StatementMain />);

		expect(screen.getByText('t:Network down')).toBeInTheDocument();
		fireEvent.click(screen.getByRole('button', { name: 't:Retry' }));
		expect(mockResetError).toHaveBeenCalledTimes(1);
	});
});
