import styles from './MassConsensusAdmin.module.scss';
import Description from '../../../evaluations/components/description/Description';
import { useNavigate, useParams } from 'react-router';
import HandsImage from '@/assets/images/hands.png';
import BulbImage from '@/assets/images/bulb.png';
import AnchorIcon from '@/assets/icons/anchor.svg?react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useSelector } from 'react-redux';
import {
	statementSelector,
	statementSubsSelector,
} from '@/redux/statements/statementsSlice';
import ShareButton from '@/view/components/buttons/shareButton/ShareButton';
import { useEffect, useState } from 'react';
import { listenToSubStatements } from '@/controllers/db/statements/listenToStatements';
import { Feedback, StatementType, Statement } from 'delib-npm';
import OptionMCCard from './components/deleteCard/OptionMCCard';
import DeletionLadyImage from '@/assets/images/rejectLady.png';
import Button, { ButtonType } from '@/view/components/buttons/button/Button';
import SearchBar from './components/searchBar/SearchBar';
import { Link } from 'react-router';
import { toggleStatementAnchored } from '@/controllers/db/statements/setStatements';
import { listenToFeedback } from '@/controllers/db/feedback/listenToFeedback';
import FeedbackCard from './components/feedbackCard/FeedbackCard';
import { listenerManager } from '@/controllers/utils/ListenerManager';

type TabType = 'overview' | 'top-options' | 'low-options' | 'feedback';

const MassConsensusAdmin = () => {
	const { statementId } = useParams<{ statementId: string }>();
	const statement = useSelector(statementSelector(statementId));
	const options = useSelector(statementSubsSelector(statementId)).filter(
		(st) => st.statementType === StatementType.option
	).sort((s1, s2) => s2.consensus - s1.consensus);
	const sortedOptions = options
		? [...options].sort((a, b) => b.consensus - a.consensus)
		: [];
	const topOptions = sortedOptions?.slice(0, 5);
	const sortedBottomOptions = options
		? [...options].sort((a, b) => a.consensus - b.consensus)
		: [];
	const bottomOptions = sortedBottomOptions.slice(0, 5);
	const [isSearching, setIsSearching] = useState(false);
	const [feedbackList, setFeedbackList] = useState<Feedback[]>([]);
	const [activeTab, setActiveTab] = useState<TabType>('overview');
	const [isLoading, setIsLoading] = useState(true);

	const { t } = useTranslation();
	const navigate = useNavigate();

	// Calculate anchored statistics
	const anchoredOptions = options.filter(option => option.anchored);
	const maxAnchoredAllowed = statement?.evaluationSettings?.anchored?.numberOfAnchoredStatements || 3;
	const isAnchoredSamplingEnabled = statement?.evaluationSettings?.anchored?.anchored || false;

	const handleAnchorToggle = async (optionId: string, shouldAnchor: boolean) => {
		if (!statementId) return;
		try {
			await toggleStatementAnchored(optionId, shouldAnchor, statementId);
		} catch (error) {
			console.error('Error toggling anchor status:', error);
		}
	};
	useEffect(() => {
		if (!statement) return;
		setIsLoading(true);
		const unsubscribe = listenToSubStatements(statementId, 'bottom');

		// Simulate loading complete after data fetch
		setTimeout(() => setIsLoading(false), 500);

		return () => unsubscribe();
	}, [statementId]);

	useEffect(() => {
		if (!statementId) return;

		// Use ListenerManager to prevent duplicate feedback listeners
		const listenerKey = `feedback-${statementId}`;
		listenerManager.addListener(listenerKey, () => {
			return listenToFeedback(statementId, setFeedbackList);
		});

		return () => {
			listenerManager.removeListener(listenerKey);
		};
	}, [statementId]);

	const renderConsensusBar = (option: Statement, totalEvaluators: number) => {
		const percentage = totalEvaluators > 0 ? ((option.evaluation?.numberOfEvaluators || 0) / totalEvaluators) * 100 : 0;
		const consensusLevel = option.consensus;

		let barColor = 'var(--neutral)';
		if (consensusLevel > 0.5) barColor = 'var(--agree)';
		else if (consensusLevel < -0.5) barColor = 'var(--disagree)';

		return (
			<div className={styles.consensusVisualization}>
				<div className={styles.consensusBar}>
					<div
						className={styles.consensusProgress}
						style={{
							width: `${percentage}%`,
							backgroundColor: barColor
						}}
					/>
				</div>
				<div className={styles.consensusStats}>
					<span className={styles.consensusValue}>{consensusLevel.toFixed(2)}</span>
					<span className={styles.evaluatorCount}>
						{option.evaluation?.numberOfEvaluators || 0}/{totalEvaluators}
					</span>
				</div>
			</div>
		);
	};

	const renderOverviewTab = () => (
		<div className={styles.tabContent}>
			<div className={styles.dashboardMetrics}>
				<div className={styles.metricCard}>
					<img src={HandsImage} alt='Total participants' />
					<div className={styles.metricContent}>
						<span className={styles.metricLabel}>{t('Total participants')}</span>
						<span className={styles.metricValue}>{statement?.massMembers || 0}</span>
					</div>
				</div>

				<div className={styles.metricCard}>
					<img src={BulbImage} alt='Total Suggestions' />
					<div className={styles.metricContent}>
						<span className={styles.metricLabel}>{t('Total suggestions')}</span>
						<span className={styles.metricValue}>{statement?.suggestions || 0}</span>
					</div>
				</div>

				{isAnchoredSamplingEnabled && (
					<div className={styles.metricCard}>
						<AnchorIcon />
						<div className={styles.metricContent}>
							<span className={styles.metricLabel}>{t('Anchored options')}</span>
							<span className={styles.metricValue}>
								{anchoredOptions.length}/{maxAnchoredAllowed}
							</span>
						</div>
					</div>
				)}
			</div>

			<div className={styles.quickOverview}>
				<div className={styles.overviewSection}>
					<h4>{t('Top Performing Options')}</h4>
					{topOptions.slice(0, 3).map((option) => (
						<div key={option.statementId} className={styles.quickOptionCard}>
							<p className={styles.optionText}>{option.statement}</p>
							{renderConsensusBar(option, statement?.evaluation?.asParentTotalEvaluators || 0)}
						</div>
					))}
				</div>

				<div className={styles.overviewSection}>
					<h4>{t('Recent Activity')}</h4>
					<p className={styles.activityText}>
						{options.length} {t('total options')} • {feedbackList.length} {t('feedback items')}
					</p>
				</div>
			</div>
		</div>
	);

	const renderTopOptionsTab = () => (
		<div className={styles.tabContent}>
			<SearchBar setIsSearching={setIsSearching} options={topOptions} />
			<div className={styles.optionsList}>
				{!isSearching && topOptions.length === 0 ? (
					<div className={styles.emptyState}>
						<img src={BulbImage} alt='No options' className={styles.emptyStateImage} />
						<p className={styles.emptyStateText}>{t('No options yet')}</p>
						<p className={styles.emptyStateSubtext}>{t('Options will appear here as they are added')}</p>
					</div>
				) : (
					!isSearching && topOptions.map((option) => (
						<OptionMCCard
							key={option.statementId}
							statement={option}
							isDelete={false}
							onAnchorToggle={handleAnchorToggle}
						/>
					))
				)}
			</div>
		</div>
	);

	const renderLowOptionsTab = () => (
		<div className={styles.tabContent}>
			<div className={styles.deletionHeader}>
				<img
					className={styles.deletionImage}
					src={DeletionLadyImage}
					alt='Options for deletion'
				/>
				<p className={styles.deletionDescription}>
					{t('These options have the lowest consensus and may be candidates for removal')}
				</p>
			</div>
			<div className={styles.optionsList}>
				{bottomOptions.length === 0 ? (
					<div className={styles.emptyState}>
						<p className={styles.emptyStateText}>{t('No low-performing options')}</p>
					</div>
				) : (
					bottomOptions.map((option) => (
						<OptionMCCard
							key={option.statementId}
							statement={option}
							isDelete={true}
						/>
					))
				)}
			</div>
		</div>
	);

	const renderFeedbackTab = () => (
		<div className={styles.tabContent}>
			{feedbackList.length === 0 ? (
				<div className={styles.emptyState}>
					<p className={styles.emptyStateText}>{t('No feedback received yet')}</p>
					<p className={styles.emptyStateSubtext}>{t('User feedback will appear here')}</p>
				</div>
			) : (
				<div className={styles.feedbackList}>
					{feedbackList.map((feedback) => (
						<FeedbackCard
							key={feedback.feedbackId}
							feedback={feedback}
						/>
					))}
				</div>
			)}
		</div>
	);

	if (isLoading) {
		return (
			<div className={styles.massConsensusAdmin}>
				<div className='wrapper'>
					<div className={styles.loadingState}>
						<div className={styles.spinner}></div>
						<p>{t('Loading consensus data...')}</p>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div className={styles.massConsensusAdmin}>
			<div className='wrapper'>
				<div className={styles.headerActions}>
					<Button
						buttonType={ButtonType.PRIMARY}
						className={styles.centered}
						text={t('To Statement')}
						onClick={() =>
							navigate(`/mass-consensus/${statementId}`, {
								replace: true,
							})
						}
					/>
					<Link to={`/my-suggestions/statement/${statementId}`} className={styles.mySuggestionsLink}>
						<div className={styles.mySuggestionsButton}>
							<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
								<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" fill="currentColor"/>
							</svg>
							<span>{t('My Suggestions')}</span>
						</div>
					</Link>
				</div>

				<Description />

				<div className={styles.shareSection}>
					<ShareButton
						title={t('Share this statement')}
						text={t('Share')}
						url={`/mass-consensus/${statementId}`}
					/>
				</div>

				<div className={styles.tabNavigation}>
					<button
						className={`${styles.tab} ${activeTab === 'overview' ? styles.tabActive : ''}`}
						onClick={() => setActiveTab('overview')}
					>
						<span className={styles.tabIcon}>📊</span>
						<span className={styles.tabText}>{t('Overview')}</span>
					</button>
					<button
						className={`${styles.tab} ${activeTab === 'top-options' ? styles.tabActive : ''}`}
						onClick={() => setActiveTab('top-options')}
					>
						<span className={styles.tabIcon}>⭐</span>
						<span className={styles.tabText}>{t('Top Options')}</span>
						<span className={styles.tabBadge}>{topOptions.length}</span>
					</button>
					<button
						className={`${styles.tab} ${activeTab === 'low-options' ? styles.tabActive : ''}`}
						onClick={() => setActiveTab('low-options')}
					>
						<span className={styles.tabIcon}>⚠️</span>
						<span className={styles.tabText}>{t('Low Options')}</span>
						<span className={styles.tabBadge}>{bottomOptions.length}</span>
					</button>
					<button
						className={`${styles.tab} ${activeTab === 'feedback' ? styles.tabActive : ''}`}
						onClick={() => setActiveTab('feedback')}
					>
						<span className={styles.tabIcon}>💬</span>
						<span className={styles.tabText}>{t('Feedback')}</span>
						<span className={styles.tabBadge}>{feedbackList.length}</span>
					</button>
				</div>

				{activeTab === 'overview' && renderOverviewTab()}
				{activeTab === 'top-options' && renderTopOptionsTab()}
				{activeTab === 'low-options' && renderLowOptionsTab()}
				{activeTab === 'feedback' && renderFeedbackTab()}
			</div>
		</div>
	);
};

export default MassConsensusAdmin;
