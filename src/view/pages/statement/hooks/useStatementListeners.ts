import { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import {
	listenToStatement,
	listenToSubStatements,
	listenToStatementSubscription,
	listenToTreeByTopParent,
	listenToTreeDescendants,
} from '@/controllers/db/statements/listenToStatements';
import { listenToMindMapData } from '@/controllers/db/statements/optimizedListeners';
import { listenToStatementDeltas } from '@/controllers/db/statements/bulkLoadStatements';
import { Screen } from '@freedi/shared-types';
import {
	listenToInAppNotifications,
	clearInAppNotifications,
} from '@/controllers/db/inAppNotifications/db_inAppNotifications';
import { CHAT } from '@/constants/common';
import { TREE_INITIAL_LIMIT } from '@/constants/treeView';
import {
	listenToUserDemographicAnswers,
	listenToUserDemographicQuestions,
	listenToGroupDemographicQuestions,
	listenToGroupDemographicAnswers,
} from '@/controllers/db/userDemographic/getUserDemographic';
import { statementSelector, fullyLoadedScopeSelector } from '@/redux/statements/statementsSlice';
import { listenerManager } from '@/controllers/utils/ListenerManager';
import { logError } from '@/utils/errorHandling';
import { loadBookmarksForRoom } from '@/controllers/db/bookmarks/bookmarksPersistence';
import { listenToEvaluations } from '@/controllers/db/evaluation/getEvaluation';

interface UseStatementListenersProps {
	statementId?: string;
	stageId?: string;
	screen?: string;
	/** True once the statement is known to be missing — see the main effect. */
	isStatementNotFound: boolean;
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
	isStatementNotFound,
	setIsStatementNotFound,
	setError,
}: UseStatementListenersProps) => {
	const { creator } = useAuthentication();
	const unsubscribersRef = useRef<(() => void)[]>([]);
	const previousStatementIdRef = useRef<string | undefined>();

	// Subscribe to statement from Redux to get topParentId reactively
	const statement = useSelector(statementSelector(statementId));
	const topParentId = statement?.topParentId;
	const enableTreeView = statement?.statementSettings?.enableTreeView === true;

	// When the user bulk-loaded this scope ("Load all"), swap the capped
	// listener for narrow delta listeners that start at the load watermark
	const fullyLoadedScope = useSelector(fullyLoadedScopeSelector(statementId));

	// Reset listener stats when navigating to a different statement
	useEffect(() => {
		if (statementId && statementId !== previousStatementIdRef.current) {
			listenerManager.resetStats();
			// One statement being missing says nothing about the next one. Without
			// this the flag stays true across navigation and every subsequent
			// statement renders as 404.
			if (previousStatementIdRef.current !== undefined) {
				setIsStatementNotFound(false);
			}
			previousStatementIdRef.current = statementId;
		}
	}, [statementId, setIsStatementNotFound]);

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
					logError(error, {
						operation: 'hooks.useStatementListeners.cleanup',
						metadata: { message: 'Error while unsubscribing:' },
					});
					setError(error instanceof Error ? error.message : 'Unsubscribe error');
				}
			});
			unsubscribersRef.current = [];
		};

		try {
			// The statement is gone (deleted, or the listener errored). StatementMain
			// renders Page404 for this state but stays mounted, so without this the
			// whole listener set — sub-statements, mind-map, notifications,
			// demographics, evaluations — stays subscribed to a document that isn't
			// there, re-erroring for as long as the page is open. Keep only the
			// single-document listener, which costs nothing on a missing doc and is
			// the one thing that can clear the flag if the read was a transient
			// failure rather than a real deletion.
			if (isStatementNotFound) {
				unsubscribersRef.current.push(listenToStatement(statementId, setIsStatementNotFound));

				return cleanup;
			}

			// Only clear notifications if we have a valid statementId
			if (statementId) {
				clearInAppNotifications(statementId);
			}

			// Core listeners
			unsubscribersRef.current.push(
				listenToStatement(statementId, setIsStatementNotFound),
				listenToStatementSubscription(statementId, creator),
				listenToEvaluations(statementId, undefined, creator.uid),
				listenToUserDemographicQuestions(statementId),
				listenToUserDemographicAnswers(statementId),
				listenToInAppNotifications(),
			);

			// Conditional listeners based on screen
			if (currentScreen === 'mind-map') {
				if (fullyLoadedScope?.mode === 'descendants') {
					// Scope fully bulk-loaded: stream only changes after the watermark
					unsubscribersRef.current.push(
						listenToStatementDeltas(statementId, 'descendants', fullyLoadedScope.watermark),
					);
				} else {
					// Use consolidated listener to avoid dual listener overhead
					unsubscribersRef.current.push(listenToMindMapData(statementId));
				}
			} else if (
				(currentScreen === Screen.agreementMap || currentScreen === Screen.polarizationIndex) &&
				fullyLoadedScope?.mode === 'direct'
			) {
				// All direct children bulk-loaded: stream only changes after the watermark
				unsubscribersRef.current.push(
					listenToStatementDeltas(statementId, 'direct', fullyLoadedScope.watermark),
				);
			} else if (enableTreeView) {
				// Tree view: load direct children (reliable via parentId) with no limit
				unsubscribersRef.current.push(listenToSubStatements(statementId, 'top'));
				if (!topParentId || topParentId === statementId) {
					// Top level: load entire tree via topParentId + parents array fallback
					unsubscribersRef.current.push(listenToTreeByTopParent(statementId, TREE_INITIAL_LIMIT));
					unsubscribersRef.current.push(listenToTreeDescendants(statementId, TREE_INITIAL_LIMIT));
				} else {
					// Sub-statement: load descendants via parents array-contains
					unsubscribersRef.current.push(listenToTreeDescendants(statementId, TREE_INITIAL_LIMIT));
				}
			} else {
				// Limit initial load for lazy loading (desc order to get most recent).
				// The default view is 'chat', so apply the limit for all non-mind-map screens.
				// The Chat component uses IntersectionObserver to fetch older messages on scroll.
				unsubscribersRef.current.push(
					listenToSubStatements(statementId, 'top', CHAT.INITIAL_MESSAGES_LIMIT),
				);
			}

			// Stage listener
			if (stageId) {
				unsubscribersRef.current.push(listenToStatement(stageId, setIsStatementNotFound));
			}
		} catch (error) {
			logError(error, {
				operation: 'hooks.useStatementListeners.unknown',
				metadata: { message: 'Error setting up listeners:' },
			});
			setError(error instanceof Error ? error.message : 'Setup error');
		}

		return cleanup;
	}, [
		creator,
		statementId,
		stageId,
		screen,
		enableTreeView,
		topParentId,
		fullyLoadedScope,
		isStatementNotFound,
		setIsStatementNotFound,
		setError,
	]);

	// Effect for top parent statement and group-level demographic questions
	// This effect now properly depends on topParentId from Redux selector
	useEffect(() => {
		if (!creator || !statementId || !topParentId || isStatementNotFound) return;

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

		// Load persisted bookmarks for this room
		if (creator.uid) {
			loadBookmarksForRoom(creator.uid, topParentId);
		}

		return () => {
			unsubscribers.forEach((unsubscribe) => {
				try {
					if (typeof unsubscribe === 'function') {
						unsubscribe();
					}
				} catch (error) {
					logError(error, {
						operation: 'hooks.useStatementListeners.unknown',
						metadata: { message: 'Error while unsubscribing from group listeners:' },
					});
				}
			});
		};
	}, [creator, statementId, topParentId, isStatementNotFound]);
};
