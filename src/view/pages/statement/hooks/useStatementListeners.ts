import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
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
import {
	listenToUserDemographicAnswers,
	listenToUserDemographicQuestions,
	listenToGroupDemographicQuestions,
	listenToGroupDemographicAnswers,
} from '@/controllers/db/userDemographic/getUserDemographic';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { listenerManager } from '@/controllers/utils/ListenerManager';

interface UseStatementListenersProps {
	statementId?: string;
	stageId?: string;
	screen?: string;
	setIsStatementNotFound: (value: boolean) => void;
	setError: (error: string | null) => void;
}

const getScreenFromPath = (): string => {
	return window.location.pathname.split('/').pop() || 'main';
};

export const useStatementListeners = ({
	statementId,
	stageId,
	screen,
	setIsStatementNotFound,
	setError,
}: UseStatementListenersProps) => {
	const { creator } = useAuthentication();
	const unsubscribersRef = useRef<(() => void)[]>([]);
	const previousStatementIdRef = useRef<string | undefined>();

	// Subscribe to statement from Redux to get topParentId reactively
	const statement = useSelector(statementSelector(statementId));
	const topParentId = statement?.topParentId;

	// Reset listener stats when navigating to a different statement
	useEffect(() => {
		if (statementId && statementId !== previousStatementIdRef.current) {
			listenerManager.resetStats();
			previousStatementIdRef.current = statementId;
		}
	}, [statementId]);

	// Effect for main statement listening
	useEffect(() => {
		if (!creator || !statementId) return;

		// Use the screen parameter from props - more reliable than reading from window.location
		// Fallback to getScreenFromPath if screen is not provided
		const currentScreen = screen || getScreenFromPath();

		const cleanup = () => {
			unsubscribersRef.current.forEach((unsubscribe) => {
				try {
					if (typeof unsubscribe === 'function') {
						unsubscribe();
					}
				} catch (error) {
					console.error('Error while unsubscribing:', error);
					setError(error instanceof Error ? error.message : 'Unsubscribe error');
				}
			});
			unsubscribersRef.current = [];
		};

		try {
			// Only clear notifications if we have a valid statementId
			if (statementId) {
				clearInAppNotifications(statementId);
			}

			// Core listeners
			unsubscribersRef.current.push(
				listenToStatement(statementId, setIsStatementNotFound),
				listenToStatementSubscription(statementId, creator),
				listenToUserDemographicQuestions(statementId),
				listenToUserDemographicAnswers(statementId),
				listenToInAppNotifications(),
			);

			// Conditional listeners based on screen
			if (currentScreen === 'mind-map') {
				// Use consolidated listener to avoid dual listener overhead
				unsubscribersRef.current.push(listenToMindMapData(statementId));
			} else {
				unsubscribersRef.current.push(listenToSubStatements(statementId));
			}

			// Stage listener
			if (stageId) {
				unsubscribersRef.current.push(listenToStatement(stageId, setIsStatementNotFound));
			}
		} catch (error) {
			console.error('Error setting up listeners:', error);
			setError(error instanceof Error ? error.message : 'Setup error');
		}

		return cleanup;
	}, [creator, statementId, stageId, screen, setIsStatementNotFound, setError]);

	// Effect for top parent statement and group-level demographic questions
	// This effect now properly depends on topParentId from Redux selector
	useEffect(() => {
		if (!creator || !statementId || !topParentId) return;

		const unsubscribers: (() => void)[] = [];

		// If this is a child statement (not the top parent itself), also listen to top parent
		if (topParentId !== statementId) {
			// Listen to top parent statement for followMe updates
			unsubscribers.push(listenToStatement(topParentId, () => {}));
		}

		// Always listen to group-level demographic questions and answers for the group
		// This ensures group surveys work both at the group level and in sub-statements
		unsubscribers.push(listenToGroupDemographicQuestions(topParentId));
		unsubscribers.push(listenToGroupDemographicAnswers(topParentId));

		return () => {
			unsubscribers.forEach((unsubscribe) => {
				try {
					if (typeof unsubscribe === 'function') {
						unsubscribe();
					}
				} catch (error) {
					console.error('Error while unsubscribing from group listeners:', error);
				}
			});
		};
	}, [creator, statementId, topParentId]);
};
