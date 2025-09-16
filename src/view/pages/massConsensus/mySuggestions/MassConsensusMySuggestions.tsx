import { useEffect } from 'react';
import { useParams } from 'react-router';
import { useSelector } from 'react-redux';
import { statementSelector, userSuggestionsSelector } from '@/redux/statements/statementsSlice';
import { listenToStatement, listenToUserSuggestions } from '@/controllers/db/statements/listenToStatements';
import { getStatementSubscriptionFromDB } from '@/controllers/db/subscriptions/getSubscriptions';
import { getStatementSubscriptionId } from '@/controllers/general/helpers';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { useDispatch } from 'react-redux';
import { setStatementSubscription } from '@/redux/statements/statementsSlice';
import SuggestionCard from '@/view/pages/statement/components/evaluations/components/suggestionCards/suggestionCard/SuggestionCard';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import styles from './MassConsensusMySuggestions.module.scss';

const MassConsensusMySuggestions = () => {
	const { statementId } = useParams<{ statementId: string }>();
	const dispatch = useDispatch();
	const { user } = useAuthentication();
	const { t } = useUserConfig();
	const statement = useSelector(statementSelector(statementId));
	const creator = useSelector(creatorSelector);
	const userId = user?.uid || creator?.uid;
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
		getStatementSubscriptionFromDB(subscriptionId).then(sub => {
			if (sub) {
				dispatch(setStatementSubscription(sub));
			}
		});
	}, [statementId, userId, dispatch]);

	return (
		<div className={styles.container}>
			<div className={styles.header}>
				<h1 className={styles.title}>{t('My Suggestions')}</h1>
				{statement && (
					<p className={styles.statementTitle}>
						{t('For')}: {statement.statement}
					</p>
				)}
			</div>

			<div className={styles.content}>
				{userSuggestions.length === 0 ? (
					<div className={styles.emptyState}>
						<p>{t('You have not created any suggestions yet.')}</p>
						<p className={styles.hint}>
							{t('Your suggestions will appear here after you create them.')}
						</p>
					</div>
				) : (
					<div className={styles.suggestionsGrid}>
						{userSuggestions.map(suggestion => (
							<SuggestionCard
								key={suggestion.statementId}
								statement={suggestion}
							/>
						))}
					</div>
				)}
			</div>

			{userSuggestions.length > 0 && (
				<div className={styles.footer}>
					<p className={styles.count}>
						{t('Total suggestions')}: {userSuggestions.length}
					</p>
				</div>
			)}
		</div>
	);
};

export default MassConsensusMySuggestions;