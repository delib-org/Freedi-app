import { createSelector } from '@reduxjs/toolkit';
import { FC, useEffect, useMemo, useState } from 'react';

// Third party imports
import { useSelector } from 'react-redux';
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
import { listenToUserSettings } from '@/controllers/db/users/getUserDB';
import { statementTitleToDisplay } from '@/controllers/general/helpers';
import { useIsAuthorized } from '@/controllers/hooks/authHooks';
import { useAppDispatch } from '@/controllers/hooks/reduxHooks';
import { MapProvider } from '@/controllers/hooks/useMap';
import { RootState } from '@/redux/store';
import { userSelector } from '@/redux/users/userSlice';
import Modal from '@/view/components/modal/Modal';
import { StatementType, Access, QuestionType } from '@/types/TypeEnums';
import { User } from '@/types/user/User';
import { Role } from '@/types/user/UserSettings';

// Create selectors
export const subStatementsSelector = createSelector(
	(state: RootState) => state.statements.statements,
	(_state: RootState, statementId: string | undefined) => statementId,
	(statements, statementId) =>
		statements
			.filter((st) => st.parentId === statementId)
			.sort((a, b) => a.createdAt - b.createdAt)
);

const StatementMain: FC = () => {
	// Hooks
	const { statementId } = useParams();

	//TODO:create a check with the parent statement if subscribes. if not subscribed... go according to the rules of authorization
	const {
		error,
		isAuthorized,
		loading,
		statement,
		topParentStatement,
		role,
	} = useIsAuthorized(statementId);

	// Redux store
	const dispatch = useAppDispatch();
	const user = useSelector(userSelector);

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

	// const [_, setPasswordCheck] = useState<boolean>(false)

	// Constants

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
		let unSubListenToStatement: () => void = () => {
			return;
		};

		let unSubSubStatements: () => void = () => {
			return;
		};
		let unSubStatementSubscription: () => void = () => {
			return;
		};
		let unSubEvaluations: () => void = () => {
			return;
		};

		let unSubUserSettings: () => void = () => {
			return;
		};
		let unSubAllDescendants: () => void = () => {
			return;
		};

		if (user && statementId) {
			unSubListenToStatement = listenToStatement(
				statementId,
				setIsStatementNotFound
			);

			unSubUserSettings = listenToUserSettings();
			unSubAllDescendants = listenToAllDescendants(statementId); //used for map
			unSubEvaluations = listenToEvaluations(
				dispatch,
				statementId,
				user?.uid
			);
			unSubSubStatements = listenToSubStatements(statementId); //TODO: check if this is needed. It can be integrated under listenToAllDescendants

			unSubStatementSubscription = listenToStatementSubscription(
				statementId,
				user,
				dispatch
			);
		}

		return () => {
			unSubListenToStatement();
			unSubUserSettings();
			unSubSubStatements();
			unSubStatementSubscription();
			unSubEvaluations();
			unSubAllDescendants();
		};
	}, [user, statementId]);

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

	useEffect(() => {
		if (statement) {
			(async () => {
				const isSubscribed = await getIsSubscribed(statementId);

				// if isSubscribed is false, then subscribe
				if (
					!isSubscribed &&
					statement.membership?.access === Access.close
				) {
					// subscribe
					setStatementSubscriptionToDB(statement, Role.member);
				} else {
					//update subscribed field
					updateSubscriberForStatementSubStatements(statement);
				}
			})();
		}
	}, [statement]);

	const contextValue = useMemo(
		() => ({
			statement,
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
			talker,
			role,
			handleShowTalker,
			handleSetNewStatement,
			setNewStatementType,
			newStatementType,
		]
	);

	if (isStatementNotFound) return <Page404 />;
	if (error) return <UnAuthorizedPage />;
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
};

export default StatementMain;
