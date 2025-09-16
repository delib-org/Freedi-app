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
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import { useHeader } from '../headerMassConsensus/HeaderContext';
import SimpleSuggestionCards from '../../statement/components/evaluations/components/simpleSuggestionCards/SimpleSuggestionCards';
import FooterMassConsensus from '../footerMassConsensus/FooterMassConsensus';
import { useNavigate } from 'react-router';
import { useMassConsensusAnalytics } from '@/hooks/useMassConsensusAnalytics';
import styles from './MassConsensusMySuggestions.module.scss';

const MassConsensusMySuggestions = () => {
	const { statementId } = useParams<{ statementId: string }>();
	const dispatch = useDispatch();
	const navigate = useNavigate();
	const { user } = useAuthentication();
	const { t } = useUserConfig();
	const statement = useSelector(statementSelector(statementId));
	const creator = useSelector(creatorSelector);
	const userId = user?.uid || creator?.uid;
	const userSuggestions = useSelector(userSuggestionsSelector(statementId, userId));
	const { setHeader } = useHeader();
	const { trackStageCompleted, trackStageSkipped } = useMassConsensusAnalytics();

	useEffect(() => {
		setHeader({
			title: t('My Suggestions'),
			backToApp: false,
			isIntro: false,
			setHeader,
		});
	}, []);

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

	const handleNext = () => {
		trackStageCompleted('my_suggestions');
		// Navigate to next step in mass consensus flow
		navigate(`/mass-consensus/${statementId}/thank-you`);
	};

	const handleSkip = () => {
		trackStageSkipped('my_suggestions');
		navigate(`/mass-consensus/${statementId}/thank-you`);
	};

	return (
		<div className={styles.mySuggestions}>
			<div className={styles.wrapper}>
				<h1>{t("Question")}: {statement?.statement}</h1>
				<h2>{t('My Suggestions')}</h2>

				{userSuggestions.length === 0 ? (
					<div className={styles.emptyState}>
						<div className={styles.emptyContent}>
							<p className={styles.emptyText}>
								{t('You have not created any suggestions yet.')}
							</p>
							<p className={styles.emptyHint}>
								{t('Your suggestions will appear here after you create them.')}
							</p>
						</div>
					</div>
				) : (
					<>
						<h3>{t('Your suggestions for this question')}</h3>
						<SimpleSuggestionCards
							subStatements={userSuggestions}
						/>
						<div className={styles.count}>
							<p>{t('Total suggestions')}: {userSuggestions.length}</p>
						</div>
					</>
				)}

				<FooterMassConsensus
					isNextActive={true}
					onNext={handleNext}
					onSkip={handleSkip}
				/>
			</div>
		</div>
	);
};

export default MassConsensusMySuggestions;