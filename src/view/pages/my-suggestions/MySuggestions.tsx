import { FC, useEffect } from 'react';
import { useParams } from 'react-router';
import { useSelector } from 'react-redux';
import { statementSelector, userSuggestionsSelector } from '@/redux/statements/statementsSlice';
import {
	listenToStatement,
	listenToUserSuggestions,
} from '@/controllers/db/statements/listenToStatements';
import { getStatementSubscriptionFromDB } from '@/controllers/db/subscriptions/getSubscriptions';
import { getStatementSubscriptionId } from '@/controllers/general/helpers';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import styles from './MySuggestions.module.scss';
import { useDispatch } from 'react-redux';
import { setStatementSubscription } from '@/redux/statements/statementsSlice';
import SuggestionCard from '@/view/pages/statement/components/evaluations/components/suggestionCards/suggestionCard/SuggestionCard';
import MySuggestionsHeader from './MySuggestionsHeader';

const MySuggestions: FC = () => {
	const { statementId } = useParams<{ statementId: string }>();
	const dispatch = useDispatch();
	const { user } = useAuthentication();
	const statement = useSelector(statementSelector(statementId));
	const userId = user?.uid;
	const userSuggestions = useSelector(userSuggestionsSelector(statementId, userId));

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
		getStatementSubscriptionFromDB(subscriptionId).then((sub) => {
			if (sub) {
				dispatch(setStatementSubscription(sub));
			}
		});
	}, [statementId, userId, dispatch]);

	if (!statement) {
		return <div className={styles.loading}>Loading...</div>;
	}

	return (
		<>
			<MySuggestionsHeader statement={statement} />
			<div className="wrapper">
				<div className={styles.pageContent}>
					{statement && <h1>{statement.statement}</h1>}

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
									parentStatement={statement}
								/>
							))
						)}
					</div>
				</div>
			</div>
		</>
	);
};

export default MySuggestions;
