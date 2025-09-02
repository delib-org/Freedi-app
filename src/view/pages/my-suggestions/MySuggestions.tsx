import { FC, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router';
import { useSelector } from 'react-redux';
import { StatementType, QuestionType, Role } from 'delib-npm';
import { statementSelector, statementSubsSelector, statementSubscriptionSelector } from '@/redux/statements/statementsSlice';
import { listenToStatement, listenToUserSuggestions } from '@/controllers/db/statements/listenToStatements';
import { getStatementSubscriptionFromDB } from '@/controllers/db/subscriptions/getSubscriptions';
import { getStatementSubscriptionId } from '@/controllers/general/helpers';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import styles from './MySuggestions.module.scss';
import BackIcon from '@/assets/icons/chevronLeftIcon.svg?react';
import { useDispatch } from 'react-redux';
import { setStatementSubscription } from '@/redux/statements/statementsSlice';
import SuggestionCard from '@/view/pages/statement/components/evaluations/components/suggestionCards/suggestionCard/SuggestionCard';

const MySuggestions: FC = () => {
	const { statementId } = useParams<{ statementId: string }>();
	const navigate = useNavigate();
	const dispatch = useDispatch();
	const { user } = useAuthentication();
	const statement = useSelector(statementSelector(statementId));
	const subscription = useSelector(statementSubscriptionSelector(statementId));
	const allSuggestions = useSelector(statementSubsSelector(statementId));
	const userId = user?.uid;
	
	// Use the suggestions from Redux store - they're already filtered by our listener
	const userSuggestions = useMemo(() => {
		if (!allSuggestions) return [];
		
		// Since we're using listenToUserSuggestions, these should already be filtered
		// But let's double-check to be safe
		return allSuggestions.filter(
			(suggestion) => 
				suggestion.creatorId === userId && 
				suggestion.statementType === StatementType.option
		);
	}, [allSuggestions, userId]);

	// Handle navigation back to statement
	const handleBackToStatement = () => {
		if (!statement) {
			navigate(`/statement/${statementId}`, { replace: true });

			return;
		}
		
		const isMassConsensus = statement.statementType === StatementType.question && 
			statement.questionSettings?.questionType === QuestionType.massConsensus;
		const isAdmin = subscription?.role === Role.admin;

		if (isMassConsensus && !isAdmin) {
			navigate(`/mass-consensus/${statementId}/introduction`, { replace: true });
		} else {
			navigate(`/statement/${statementId}`, { replace: true });
		}
	};

	useEffect(() => {
		if (!statementId) return;
		
		// Listen to the statement itself
		const unsubscribeStatement = listenToStatement(statementId);
		
		// Listen to user's own suggestions only
		const unsubscribeUserSuggestions = userId 
			? listenToUserSuggestions(statementId, userId)
			: () => {};
		
		return () => {
			unsubscribeStatement();
			unsubscribeUserSuggestions();
		};
	}, [statementId, userId]);

	useEffect(() => {
		// Fetch subscription if we have a user
		if (!statementId || !userId) return;
		
		const subscriptionId = getStatementSubscriptionId(statementId, userId);
		getStatementSubscriptionFromDB(subscriptionId).then(sub => {
			if (sub) {
				dispatch(setStatementSubscription(sub));
			}
		});
	}, [statementId, userId, dispatch]);

	if (!statement) {
		return <div className={styles.loading}>Loading...</div>;
	}

	return (
		<div className="wrapper">
			<div className={styles.header}>
				<div className={styles.headerTop}>
					<button onClick={handleBackToStatement} className={styles.backButton}>
						<BackIcon />
						<span>Back to Statement</span>
					</button>
				</div>
				<h1>My Suggestions</h1>
				<h2>{statement.statement}</h2>
			</div>
			
			<div className={styles.suggestionsList}>
				{userSuggestions.length === 0 ? (
					<div className={styles.empty}>
						<p>You haven't submitted any suggestions yet.</p>
					</div>
				) : (
					userSuggestions.map((suggestion) => (
						<SuggestionCard
							key={suggestion.statementId}
							statement={suggestion}
							siblingStatements={userSuggestions}
							parentStatement={statement}
							positionAbsolute={false}
						/>
					))
				)}
			</div>
		</div>
	);
};

export default MySuggestions;