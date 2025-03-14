import { createSelector } from '@reduxjs/toolkit';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router';

// firestore
import LoadingPage from '../loadingPage/LoadingPage';
import Page404 from '../page404/Page404';
import UnAuthorizedPage from '../unAuthorizedPage/UnAuthorizedPage';
import StatementHeader from './components/header/StatementHeader';
import NewStatement from './components/newStatemement/newStatement';
import Switch from './components/switch/Switch';
import { StatementContext } from './StatementCont';
import { listenToEvaluations } from '@/controllers/db/evaluation/getEvaluation';
import {
	listenToStatement,
	listenToStatementSubscription,
	listenToAllDescendants,
	listenToSubStatements,
} from '@/controllers/db/statements/listenToStatements';
import { getIsSubscribed } from '@/controllers/db/subscriptions/getSubscriptions';
import {
	updateSubscriberForStatementSubStatements,
	setStatementSubscriptionToDB,
} from '@/controllers/db/subscriptions/setSubscriptions';

// Redux Store
import { statementTitleToDisplay } from '@/controllers/general/helpers';
import { useAppDispatch } from '@/controllers/hooks/reduxHooks';
import { MapProvider } from '@/controllers/hooks/useMap';
import { RootState } from '@/redux/store';
import Modal from '@/view/components/modal/Modal';

import { statementSelector } from '@/redux/statements/statementsSlice';
import { Role, StatementType, Access, QuestionType, User } from 'delib-npm';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { useSelector } from 'react-redux';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { notificationService } from '@/services/notificationService';
import { listenToInAppNotifications, markInAppNotificationOfParentAsRead } from '@/controllers/db/inAppNotifications/db_inAppNotifications';

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
	const { statementId, stageId } = useParams();

	//TODO:create a check with the parent statement if subscribes. if not subscribed... go according to the rules of authorization
	const { isAuthorized, loading, statement, topParentStatement, role } =
		useAuthorization(statementId);

	// Redux store
	const dispatch = useAppDispatch();
	const { creator } = useAuthentication();

	const stage = useSelector(statementSelector(stageId));

	// Use states
	const [talker, setTalker] = useState<User | null>(null);
	const [isStatementNotFound, setIsStatementNotFound] = useState(false);
	const [showNewStatement, setShowNewStatement] = useState<boolean>(false);
	const [newStatementType, setNewStatementType] = useState<StatementType>(
		StatementType.group
	);
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

	function handleSetNewStatement(showPopup?: boolean) {
		if (showPopup === undefined) {
			setShowNewStatement(!showNewStatement);

			return;
		}
		setShowNewStatement(showPopup);
	}

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
			console.log("clearing in app notifications for:", statementId);
			markInAppNotificationOfParentAsRead(statementId);
			// Initialize all listeners and store cleanup functions
			unsubscribeFunctions.push(
				listenToStatement(statementId, setIsStatementNotFound),
				listenToAllDescendants(statementId), // used for map
				listenToEvaluations(dispatch, statementId, creator.uid),
				listenToSubStatements(statementId), // TODO: check if this is needed. It can be integrated under listenToAllDescendants
				listenToStatementSubscription(statementId, creator, dispatch),
				listenToInAppNotifications()
			);

			if (stageId) {
				unsubscribeFunctions.push(
					listenToStatement(stageId, setIsStatementNotFound)
				);
			}
		}

		// Cleanup function that calls all unsubscribe functions
		return () => {
			unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
		};
	}, [creator, statementId]);

	useEffect(() => {
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
	}, [statement?.topParentId]);

	// Effect to handle membership subscription (but NOT notification subscription)
	useEffect(() => {
		if (statement && creator) {
			(async () => {
				const isSubscribed = await getIsSubscribed(
					statementId,
					creator.uid
				);

				// if isSubscribed is false, then subscribe
				if (
					!isSubscribed &&
					statement.membership?.access === Access.close
				) {
					// subscribe
					setStatementSubscriptionToDB({
						statement,
						creator,
						role: Role.member
					});
				} else {
					//update subscribed field
					updateSubscriberForStatementSubStatements(
						statement,
						creator.uid
					);
				}

				// We no longer automatically register for notifications here
				// This is now handled by the notification subscription button
				// Just initialize the service if needed for the token
				if ('Notification' in window && Notification.permission === 'granted' && creator) {
					try {
						if (!notificationService.getToken()) {
							await notificationService.initialize(creator.uid);
						}
					} catch (error) {
						console.error('Error initializing notification service:', error);
					}
				}
			})();
		}
	}, [statement, creator, statementId]);

	const contextValue = useMemo(
		() => ({
			statement,
			stage,
			talker,
			handleShowTalker,
			role,
			handleSetNewStatement,
			setNewStatementType,
			newStatementType,
			setNewQuestionType,
			newQuestionType,
		}),
		[
			statement,
			stage,
			talker,
			role,
			handleShowTalker,
			handleSetNewStatement,
			setNewStatementType,
			newStatementType,
		]
	);

	if (isStatementNotFound) return <Page404 />;
	if (loading) return <LoadingPage />;

	if (isAuthorized) {
		return (
			<StatementContext.Provider value={contextValue}>
				<div className='page'>
					{showNewStatement && (
						<Modal
							closeModal={(e) => {
								if (e.target === e.currentTarget)
									setShowNewStatement(false);
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
				</div>
			</StatementContext.Provider>
		);
	}

	return <UnAuthorizedPage />;
}