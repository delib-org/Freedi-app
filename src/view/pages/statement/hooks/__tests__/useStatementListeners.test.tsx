import { renderHook } from '@testing-library/react';

import { useStatementListeners } from '../useStatementListeners';
import {
	listenToStatement,
	listenToSubStatements,
	listenToStatementSubscription,
} from '@/controllers/db/statements/listenToStatements';
import { listenToMindMapData } from '@/controllers/db/statements/optimizedListeners';
import {
	listenToInAppNotifications,
	clearInAppNotifications,
} from '@/controllers/db/inAppNotifications/db_inAppNotifications';
import { listenToEvaluations } from '@/controllers/db/evaluation/getEvaluation';
import {
	listenToUserDemographicQuestions,
	listenToUserDemographicAnswers,
	listenToGroupDemographicQuestions,
	listenToGroupDemographicAnswers,
} from '@/controllers/db/userDemographic/getUserDemographic';

const unsubscribe = jest.fn();

jest.mock('@/controllers/db/statements/listenToStatements', () => ({
	listenToStatement: jest.fn(() => unsubscribe),
	listenToSubStatements: jest.fn(() => unsubscribe),
	listenToStatementSubscription: jest.fn(() => unsubscribe),
	listenToTreeByTopParent: jest.fn(() => unsubscribe),
	listenToTreeDescendants: jest.fn(() => unsubscribe),
}));
jest.mock('@/controllers/db/statements/optimizedListeners', () => ({
	listenToMindMapData: jest.fn(() => unsubscribe),
}));
jest.mock('@/controllers/db/statements/bulkLoadStatements', () => ({
	listenToStatementDeltas: jest.fn(() => unsubscribe),
}));
jest.mock('@/controllers/db/inAppNotifications/db_inAppNotifications', () => ({
	listenToInAppNotifications: jest.fn(() => unsubscribe),
	clearInAppNotifications: jest.fn(),
}));
jest.mock('@/controllers/db/evaluation/getEvaluation', () => ({
	listenToEvaluations: jest.fn(() => unsubscribe),
}));
jest.mock('@/controllers/db/userDemographic/getUserDemographic', () => ({
	listenToUserDemographicQuestions: jest.fn(() => unsubscribe),
	listenToUserDemographicAnswers: jest.fn(() => unsubscribe),
	listenToGroupDemographicQuestions: jest.fn(() => unsubscribe),
	listenToGroupDemographicAnswers: jest.fn(() => unsubscribe),
}));
jest.mock('@/controllers/db/bookmarks/bookmarksPersistence', () => ({
	loadBookmarksForRoom: jest.fn(),
}));
jest.mock('@/controllers/utils/ListenerManager', () => ({
	listenerManager: { resetStats: jest.fn() },
}));
jest.mock('@/controllers/hooks/useAuthentication', () => ({
	useAuthentication: () => ({ creator: { uid: 'user-1' } }),
}));

// statementSelector / fullyLoadedScopeSelector are called through useSelector;
// return a plain statement with no tree view and no bulk-load watermark.
jest.mock('react-redux', () => ({
	useSelector: (selector: unknown) =>
		typeof selector === 'function' ? (selector as (s: unknown) => unknown)({}) : undefined,
}));
jest.mock('@/redux/statements/statementsSlice', () => ({
	statementSelector: () => () => ({ statementId: 'st-1', topParentId: 'st-1' }),
	fullyLoadedScopeSelector: () => () => undefined,
}));

/** Everything the chat screen subscribes beyond the single-document listener. */
const chatScreenListeners = [
	listenToSubStatements,
	listenToStatementSubscription,
	listenToInAppNotifications,
	listenToEvaluations,
	listenToUserDemographicQuestions,
	listenToUserDemographicAnswers,
	listenToGroupDemographicQuestions,
	listenToGroupDemographicAnswers,
] as jest.Mock[];

/** Plus the mind-map listener, which only the mind-map screen subscribes. */
const allHeavyListeners = [...chatScreenListeners, listenToMindMapData] as jest.Mock[];

function render(overrides: Record<string, unknown> = {}) {
	const props = {
		statementId: 'st-1',
		screen: 'chat',
		isStatementNotFound: false,
		setIsStatementNotFound: jest.fn(),
		setError: jest.fn(),
		...overrides,
	};

	return {
		props,
		...renderHook((p: typeof props) => useStatementListeners(p), {
			initialProps: props,
		}),
	};
}

describe('useStatementListeners', () => {
	beforeEach(() => jest.clearAllMocks());

	it('subscribes the full listener set for a statement that exists', () => {
		render();

		expect(listenToStatement).toHaveBeenCalledWith('st-1', expect.any(Function));
		chatScreenListeners.forEach((listener) => expect(listener).toHaveBeenCalled());
	});

	it('subscribes the mind-map listener on the mind-map screen', () => {
		render({ screen: 'mind-map' });

		expect(listenToMindMapData).toHaveBeenCalledWith('st-1');
	});

	it('subscribes nothing but the statement listener when the statement is missing', () => {
		render({ isStatementNotFound: true, screen: 'mind-map' });

		// The one listener that can clear the flag if the read was transient.
		expect(listenToStatement).toHaveBeenCalledTimes(1);
		// Everything else would be listening to a document that isn't there.
		allHeavyListeners.forEach((listener) => expect(listener).not.toHaveBeenCalled());
		expect(clearInAppNotifications).not.toHaveBeenCalled();
	});

	it('tears the heavy listeners down when the statement becomes missing', () => {
		const { rerender, props } = render();
		const subscribedCount = unsubscribe.mock.calls.length;

		rerender({ ...props, isStatementNotFound: true });

		expect(unsubscribe.mock.calls.length).toBeGreaterThan(subscribedCount);
	});

	it('clears a stale not-found verdict when navigating to another statement', () => {
		const setIsStatementNotFound = jest.fn();
		const { rerender, props } = render({
			isStatementNotFound: true,
			setIsStatementNotFound,
		});

		expect(setIsStatementNotFound).not.toHaveBeenCalled();

		rerender({ ...props, statementId: 'st-2' });

		expect(setIsStatementNotFound).toHaveBeenCalledWith(false);
	});
});
