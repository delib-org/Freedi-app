import React, { useEffect } from 'react';
import { createSelector } from '@reduxjs/toolkit';
import { useDispatch } from 'react-redux';

// Components
import LoadingPage from '../loadingPage/LoadingPage';
import Page404 from '../page404/Page404';
import UnAuthorizedPage from '../unAuthorizedPage/UnAuthorizedPage';

// Types
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { RootState } from '@/redux/store';
import { Access } from 'delib-npm';

// Auth
import { handlePublicAutoAuth } from '@/controllers/auth/publicAuthHandler';

// Custom hooks
import { useStatementData } from './hooks/useStatementData';
import { useStatementListeners } from './hooks/useStatementListeners';
import { useNotificationSetup } from './hooks/useNotificationSetup';
import { useDocumentTitle } from './hooks/useDocumentTitle';
import { useComponentState } from './hooks/useComponentState';
import { useStatementViewTracking } from '@/hooks/useStatementViewTracking';
import { analyticsService } from '@/services/analytics';
import { updateLastReadTimestamp } from '@/controllers/db/subscriptions/setSubscriptions';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';

// Components
import { StatementProvider } from './components/StatementProvider';
import { StatementErrorBoundary } from './components/StatementErrorBoundary';

// Constants
import { COMPONENT_STATES } from './constants';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { setShowNewStatementModal } from '@/redux/statements/newStatementSlice';

// Create selectors
export const subStatementsSelector = createSelector(
	(state: RootState) => state.statements.statements,
	(_state: RootState, statementId: string | undefined) => statementId,
	(statements, statementId) =>
		statements
			.filter((st) => st.parentId === statementId)
			.sort((a, b) => a.createdAt - b.createdAt)
);

const StatementMain: React.FC = () => {
	const dispatch = useDispatch();
	
	// Use custom hooks to manage data and side effects
	const {
		statementId,
		statement,
		topParentStatement,
		role,
		userDataQuestions,
		showNewStatement,
		showUserQuestions,
		talker,
		isStatementNotFound,
		error,
		newStatementType,
		newQuestionType,
		isMassConsensus,
		setIsStatementNotFound,
		setError,
		setNewStatementType,
		setNewQuestionType,
		handleShowTalker,
		resetError,
		stage,
		screen,
	} = useStatementData();

	const { isAuthorized, loading, isWaitingForApproval } = useAuthorization(statementId);
	const creator = useAppSelector(creatorSelector);

	// Use component state machine
	const { currentState } = useComponentState({
		loading,
		isAuthorized,
		isWaitingForApproval,
		isStatementNotFound,
		error,
		role
	});

	// Auto-authenticate ONLY for public statements
	useEffect(() => {
		// Determine effective access - statement override or topParent
		const effectiveAccess = statement?.membership?.access || topParentStatement?.membership?.access;
		
		// ONLY auto-authenticate for public access
		// All other access levels should use normal login flow
		if (effectiveAccess === Access.public && !creator?.uid) {
			console.info('Public statement detected, initiating auto-authentication');
			handlePublicAutoAuth();
		}
	}, [statement?.membership?.access, topParentStatement?.membership?.access, creator?.uid]);

	// Set up listeners
	useStatementListeners({
		statementId,
		stageId: stage?.statementId,
		screen,
		setIsStatementNotFound,
		setError,
	});

	// Set up notifications
	useNotificationSetup({ statement, setError });

	// Set document title
	useDocumentTitle({ statement, screen });
	
	// Track statement view and interaction time
	const { elementRef } = useStatementViewTracking({
		statementId: statementId || '',
		threshold: 0.5,
		minViewTime: 1000,
	});
	// TODO: Use markInteraction when user votes or comments
	
	// Get user from store
	const user = useAppSelector(creatorSelector);

	// Track initial view when statement loads and update read timestamp
	React.useEffect(() => {
		if (statement && statementId && user?.uid) {
			analyticsService.trackStatementView(statementId, 'direct');
			updateLastReadTimestamp(statementId, user.uid);
		}
	}, [statementId, statement, user?.uid]);

	// Reset new statement modal when component unmounts or navigating to a different statement
	React.useEffect(() => {
		return () => {
			dispatch(setShowNewStatementModal(false));
		};
	}, [statementId, dispatch]);

	// Handle different states
	const renderContent = () => {
		switch (currentState) {
			case COMPONENT_STATES.ERROR:
				return (
					<div className="page">
						<h1>Error: {error}</h1>
						<button onClick={resetError}>Retry</button>
					</div>
				);
			case COMPONENT_STATES.NOT_FOUND:
				return <Page404 />;
			case COMPONENT_STATES.WAITING_APPROVAL:
				return <h1>Waiting for approval</h1>;
			case COMPONENT_STATES.LOADING:
				return <LoadingPage />;
			case COMPONENT_STATES.UNAUTHORIZED:
				return <UnAuthorizedPage />;
			case COMPONENT_STATES.AUTHORIZED:
				return (
					<StatementProvider
						statement={statement}
						stage={stage}
						topParentStatement={topParentStatement}
						talker={talker}
						role={role}
						newStatementType={newStatementType}
						newQuestionType={newQuestionType}
						showNewStatement={showNewStatement}
						showUserQuestions={showUserQuestions}
						userDataQuestions={userDataQuestions}
						screen={screen}
						isMassConsensus={isMassConsensus}
						handleShowTalker={handleShowTalker}
						setNewStatementType={setNewStatementType}
						setNewQuestionType={setNewQuestionType}
					/>
				);
			default:
				return <UnAuthorizedPage />;
		}
	};

	return (
		<StatementErrorBoundary>
			<div ref={elementRef}>
				{renderContent()}
			</div>
		</StatementErrorBoundary>
	);
};

export default React.memo(StatementMain);
