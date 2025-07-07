import { createSelector } from '@reduxjs/toolkit';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';

// firestore
import LoadingPage from '../loadingPage/LoadingPage';
import Page404 from '../page404/Page404';
import UnAuthorizedPage from '../unAuthorizedPage/UnAuthorizedPage';
import StatementHeader from './components/header/StatementHeader';
import NewStatement from './components/newStatement/NewStatement';
import Switch from './components/switch/Switch';
import { StatementContext } from './StatementCont';
import {
	listenToStatement,
	listenToAllDescendants,
	listenToSubStatements,
	listenToStatementSubscription,
} from '@/controllers/db/statements/listenToStatements';

// Redux Store
import { statementTitleToDisplay } from '@/controllers/general/helpers';
import { MapProvider } from '@/controllers/hooks/useMap';
import { RootState } from '@/redux/store';
import Modal from '@/view/components/modal/Modal';

import {
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { StatementType, QuestionType, User, Role } from 'delib-npm';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { useDispatch, useSelector } from 'react-redux';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { notificationService } from '@/services/notificationService';
import {
	listenToInAppNotifications,
	clearInAppNotifications,
} from '@/controllers/db/inAppNotifications/db_inAppNotifications';
import {
	listenToUserAnswers,
	listenToUserQuestions,
} from '@/controllers/db/userData/getUserData';
import {
	selectUserDataByStatementId,
	selectUserQuestionsByStatementId,
} from '@/redux/userData/userDataSlice';
import UserDataQuestions from './components/userDataQuestions/UserDataQuestions';
import { selectNewStatementShowModal, setShowNewStatementModal } from '@/redux/statements/newStatementSlice';

// Create selectors
export const subStatementsSelector = createSelector(
	(state: RootState) => state.statements.statements,
	(_state: RootState, statementId: string | undefined) => statementId,
	(statements, statementId) =>
		statements
			.filter((st) => st.parentId === statementId)
			.sort((a, b) => a.createdAt - b.createdAt)
);

export default function StatementMain() {
	// Hooks
	const { statementId, stageId, screen } = useParams();

	const statement = useSelector(statementSelector(statementId));
	const showNewStatement = useSelector(selectNewStatementShowModal);
	const dispatch = useDispatch();

	const userDataQuestions = useSelector(
		selectUserQuestionsByStatementId(statementId || '')
	);
	const userData = useSelector(
		selectUserDataByStatementId(statementId || '')
	);
	const topParentStatement = useSelector(
		statementSelector(statement?.topParentId)
	);
	const role = useSelector(statementSubscriptionSelector(statementId))?.role;

	const { isAuthorized, loading, isWaitingForApproval } =
		useAuthorization(statementId);

	// Redux store
	const { creator } = useAuthentication();

	const stage = useSelector(statementSelector(stageId));
	const showUserQuestions =
		userDataQuestions &&
		userDataQuestions.length > 0 &&
		userData.length < userDataQuestions.length;

	// Use states
	const [talker, setTalker] = useState<User | null>(null);
	const [isStatementNotFound, setIsStatementNotFound] = useState(false);

	const [newStatementType, setNewStatementType] = useState<StatementType>(
		StatementType.group
	);
	const isMassConsensus =
		statement?.questionSettings?.questionType ===
		QuestionType.massConsensus;

	const [newQuestionType, setNewQuestionType] = useState<QuestionType>(
		QuestionType.multiStage
	);

	const handleShowTalker = (_talker: User | null) => {
		if (!talker) {
			setTalker(_talker);
		} else {
			setTalker(null);
		}
	};

	//in case the url is of undefined screen, navigate to the first available screen
	useEffect(() => {
		if (statement && screen) {
			//set navigator tab title
			const { shortVersion } = statementTitleToDisplay(
				statement.statement,
				15
			);
			document.title = `FreeDi - ${shortVersion}`;
		}
	}, [statement, screen]);

	// Listen to statement changes.
	useEffect(() => {
		const unsubscribeFunctions: (() => void)[] = [];

		if (creator && statementId) {
			clearInAppNotifications(statementId);

			unsubscribeFunctions.push(
				listenToStatement(statementId, setIsStatementNotFound)
			);
			unsubscribeFunctions.push(listenToStatementSubscription(statementId, creator));
			unsubscribeFunctions.push(listenToUserQuestions(statementId));

			unsubscribeFunctions.push(listenToUserAnswers(statementId));

			// Combine and optimize additional listeners
			const { pathname } = window.location;
			const currentScreen = pathname.split('/').pop() || 'main';

			// Only load descendant data if viewing the mind-map
			if (currentScreen === 'mind-map') {
				unsubscribeFunctions.push(listenToAllDescendants(statementId));
			} else {
				// For other screens, use the more efficient listener that fetches only direct children
				unsubscribeFunctions.push(listenToSubStatements(statementId));
			}

			// Notifications are always needed
			unsubscribeFunctions.push(listenToInAppNotifications());

			// Only load stage data if a stageId is provided
			if (stageId) {
				unsubscribeFunctions.push(
					listenToStatement(stageId, setIsStatementNotFound)
				);
			}
		}

		// Cleanup function that calls all unsubscribe functions
		return () => {
			unsubscribeFunctions.forEach((unsubscribe) => {
				try {
					// Check if unsubscribe is actually a function
					if (typeof unsubscribe === 'function') {
						unsubscribe();
					} else {
						// eslint-disable-next-line no-console
						console.warn(
							'Invalid unsubscribe function detected:',
							unsubscribe
						);
					}
				} catch (error) {
					console.error('Error while unsubscribing:', error);
					// Continue with other unsubscribes despite this error
				}
			});
		};
	}, [creator, statementId, stageId]);

	const topParentId = statement?.topParentId;

	useEffect(() => {
		const topParentId = statement?.topParentId;
		if (!topParentId) return;
		if (topParentId === statementId) return;

		//listen to top parent statement
		let unSubscribe = () => {
			return;
		};
		if (statement?.topParentId) {
			unSubscribe = listenToStatement(
				statement?.topParentId,
				setIsStatementNotFound
			);
		}

		return () => {
			unSubscribe();
		};
	}, [topParentId, statementId]);

	/**
	 * Effect to handle membership subscription
	 * This does NOT handle notification subscription, which is managed separately
	 * by the notification subscription button
	 */
	useEffect(() => {
		// Only proceed if both statement and creator exist
		if (!statement || !creator) return;

		// Use a small delay to prioritize loading the UI first
		const timeoutId = setTimeout(() => {
			const handleMembershipSubscription = async () => {
				try {
					// Initialize notification service if needed (for token only)
					// First check if notifications are properly supported by the browser
					if (notificationService.isSupported()) {
						const permission =
							notificationService.safeGetPermission();
						const notificationsEnabled =
							permission === 'granted' && creator;

						if (
							notificationsEnabled &&
							!notificationService.getToken()
						) {
							await notificationService.initialize(creator.uid);
						}
					}
				} catch (error) {
					console.error(
						'Error in membership subscription handler:',
						error
					);
				}
			};

			// Execute the async function after UI has loaded
			handleMembershipSubscription();
		}, 1000); // Delay for 1 second to prioritize UI rendering

		return () => {
			clearTimeout(timeoutId);
		};
	}, [statement, creator, statementId]);

	const contextValue = useMemo(
		() => ({
			statement,
			stage,
			talker,
			handleShowTalker,
			role,
			setNewStatementType,
			newStatementType,
			setNewQuestionType,
			newQuestionType,
			handleSetNewStatement: () => {
				dispatch(setShowNewStatementModal(true));
			},
		}),
		[
			statement,
			stage,
			talker,
			role,
			handleShowTalker,
			setNewStatementType,
			newStatementType,
			dispatch,
		]
	);

	if (isStatementNotFound) return <Page404 />;
	if (isWaitingForApproval || role === Role.waiting)
		return <h1>Waiting for approval</h1>;
	if (loading) return <LoadingPage />;

	if (isAuthorized) {
		return (
			<StatementContext.Provider value={contextValue}>
				<div className='page'>
					{showNewStatement && (
						<Modal
							closeModal={(e) => {
								if (e.target === e.currentTarget)
									dispatch(setShowNewStatementModal(false));
							}}
						>
							<NewStatement />
						</Modal>
					)}
					<StatementHeader
						statement={statement}
						parentStatement={undefined}
						topParentStatement={topParentStatement}
					/>
					<MapProvider>
						<Switch />
					</MapProvider>
					{showUserQuestions &&
						screen !== 'settings' &&
						!isMassConsensus && (
							<Modal>
								<UserDataQuestions
									questions={userDataQuestions}
								/>
							</Modal>
						)}
				</div>
			</StatementContext.Provider>
		);
	}

	return <UnAuthorizedPage />;
}
