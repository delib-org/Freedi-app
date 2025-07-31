import { useEffect, useRef } from 'react';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import {
	listenToStatement,
	listenToAllDescendants,
	listenToSubStatements,
	listenToStatementSubscription,
} from '@/controllers/db/statements/listenToStatements';
import {
	listenToInAppNotifications,
	clearInAppNotifications,
} from '@/controllers/db/inAppNotifications/db_inAppNotifications';
import {
	listenToUserAnswers,
	listenToUserQuestions,
} from '@/controllers/db/userData/getUserData';

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

	// Effect for main statement listening
	useEffect(() => {
		if (!creator || !statementId) return;

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
				listenToUserQuestions(statementId),
				listenToUserAnswers(statementId),
				listenToInAppNotifications()
			);

			// Conditional listeners based on screen
			const currentScreen = getScreenFromPath();
			if (currentScreen === 'mind-map') {
				unsubscribersRef.current.push(listenToAllDescendants(statementId));
			} else {
				unsubscribersRef.current.push(listenToSubStatements(statementId));
			}

			// Stage listener
			if (stageId) {
				unsubscribersRef.current.push(
					listenToStatement(stageId, setIsStatementNotFound)
				);
			}
		} catch (error) {
			console.error('Error setting up listeners:', error);
			setError(error instanceof Error ? error.message : 'Setup error');
		}

		return cleanup;
	}, [creator, statementId, stageId, screen, setIsStatementNotFound, setError]);

	// Effect for top parent statement
	useEffect(() => {
		if (!creator || !statementId) return;

		// This will be handled by the statement selector automatically
		// No need for separate listener
	}, [creator, statementId]);
};
