import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useEngagement } from '@/controllers/hooks/useEngagement';
import Back from '@/view/pages/statement/components/header/Back';
import LevelBadge from '@/view/components/atomic/atoms/LevelBadge/LevelBadge';
import LevelProgress from '@/view/components/atomic/atoms/LevelProgress/LevelProgress';
import StreakIndicator from '@/view/components/atomic/atoms/StreakIndicator/StreakIndicator';
import PeopleLoader from '@/view/components/loaders/PeopleLoader';
import { CreditAction } from '@freedi/shared-types';

const ACTION_LABELS: Record<string, string> = {
	[CreditAction.JOIN_DISCUSSION]: 'Joined discussion',
	[CreditAction.EVALUATE_OPTION]: 'Evaluated option',
	[CreditAction.CREATE_OPTION]: 'Created option',
	[CreditAction.COMMENT]: 'Commented',
	[CreditAction.VOTE]: 'Voted',
	[CreditAction.SIGN_DOCUMENT]: 'Signed document',
	[CreditAction.DAILY_LOGIN]: 'Daily login',
	[CreditAction.STREAK_BONUS]: 'Streak bonus',
	[CreditAction.CONSENSUS_REACHED]: 'Consensus reached',
	[CreditAction.SUGGESTION_ACCEPTED]: 'Suggestion accepted',
	[CreditAction.MC_PARTICIPATION]: 'MC participation',
	[CreditAction.INVITE_FRIEND]: 'Invited friend',
};

function formatTimeAgo(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const minutes = Math.floor(diff / 60000);
	if (minutes < 1) return 'just now';
	if (minutes < 60) return `${minutes}m ago`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);

	return `${days}d ago`;
}

const EngagementDashboard = () => {
	const { t, dir } = useTranslation();
	const {
		engagement,
		loading,
		recentCredits,
		level,
		levelName,
		levelProgress,
		nextLevelThreshold,
		totalCredits,
		badges,
		currentStreak,
	} = useEngagement();

	if (loading) {
		return (
			<div className="page">
				<div className="page__header app-header app-header--sticky">
					<div className="app-header-wrapper">
						{dir === 'rtl' ? (
							<>
								<div className="app-header-spacer" />
								<h1 className="app-header-title">{t('engagement.myImpact')}</h1>
								<Back />
							</>
						) : (
							<>
								<Back />
								<h1 className="app-header-title">{t('engagement.myImpact')}</h1>
								<div className="app-header-spacer" />
							</>
						)}
					</div>
				</div>
				<div className="peopleLoadingScreen">
					<PeopleLoader />
				</div>
			</div>
		);
	}

	return (
		<div className="page">
			<div className="page__header app-header app-header--sticky">
				<div className="app-header-wrapper">
					{dir === 'rtl' ? (
						<>
							<div className="app-header-spacer" />
							<h1 className="app-header-title">{t('engagement.myImpact')}</h1>
							<Back />
						</>
					) : (
						<>
							<Back />
							<h1 className="app-header-title">{t('engagement.myImpact')}</h1>
							<div className="app-header-spacer" />
						</>
					)}
				</div>
			</div>

			<div className="engagement-dashboard" role="region" aria-label={t('engagement.myImpact')}>
				{/* Level + Streak header */}
				<section className="engagement-dashboard__header" aria-label={t('engagement.currentLevel')}>
					<div className="engagement-dashboard__level-section">
						<LevelBadge level={level} size="large" />
						<dl className="engagement-dashboard__level-info">
							<dt className="engagement-dashboard__level-label">{t('engagement.currentLevel')}</dt>
							<dd className="engagement-dashboard__level-name">{levelName}</dd>
						</dl>
					</div>
					<StreakIndicator
						count={currentStreak}
						lastActiveDate={engagement?.streak?.lastActiveDate}
					/>
				</section>

				{/* Progress to next level */}
				<div className="engagement-dashboard__progress-section">
					<span className="engagement-dashboard__progress-label">
						{t('engagement.progressToNext')
							.replace('{{current}}', String(totalCredits))
							.replace('{{needed}}', String(nextLevelThreshold))}
					</span>
					<LevelProgress
						progress={levelProgress}
						currentCredits={totalCredits}
						nextThreshold={nextLevelThreshold}
						thick
						showLabel={false}
					/>
				</div>

				{/* Stats grid */}
				<section className="engagement-dashboard__stats" aria-label={t('engagement.impactStats')}>
					<div
						className="engagement-dashboard__stat"
						role="group"
						aria-label={t('engagement.totalCredits')}
					>
						<span className="engagement-dashboard__stat-value">{totalCredits}</span>
						<span className="engagement-dashboard__stat-label">{t('engagement.totalCredits')}</span>
					</div>
					<div
						className="engagement-dashboard__stat"
						role="group"
						aria-label={t('engagement.evaluationsGiven')}
					>
						<span className="engagement-dashboard__stat-value">
							{engagement?.totalEvaluations ?? 0}
						</span>
						<span className="engagement-dashboard__stat-label">
							{t('engagement.evaluationsGiven')}
						</span>
					</div>
					<div
						className="engagement-dashboard__stat"
						role="group"
						aria-label={t('engagement.optionsCreated')}
					>
						<span className="engagement-dashboard__stat-value">
							{engagement?.totalOptions ?? 0}
						</span>
						<span className="engagement-dashboard__stat-label">
							{t('engagement.optionsCreated')}
						</span>
					</div>
				</section>

				{/* Badges */}
				<section className="engagement-dashboard__section" aria-label={t('engagement.badges')}>
					<h2 className="engagement-dashboard__section-title">{t('engagement.badges')}</h2>
					{badges.length > 0 ? (
						<div className="engagement-dashboard__badges-grid" role="list">
							{badges.map((badge) => (
								<div
									key={badge.badgeId}
									className="engagement-dashboard__badge"
									role="listitem"
									aria-label={`${badge.name}: ${badge.description}`}
								>
									<span className="engagement-dashboard__badge-icon" aria-hidden="true">
										{badge.icon}
									</span>
									<span className="engagement-dashboard__badge-name">{badge.name}</span>
								</div>
							))}
						</div>
					) : (
						<div className="engagement-dashboard__empty">
							<p>{t('engagement.noBadgesYet')}</p>
							<p>{t('engagement.keepParticipating')}</p>
						</div>
					)}
				</section>

				{/* Recent activity */}
				<section
					className="engagement-dashboard__section"
					aria-label={t('engagement.recentActivity')}
				>
					<h2 className="engagement-dashboard__section-title">{t('engagement.recentActivity')}</h2>
					{recentCredits.length > 0 ? (
						<div className="engagement-dashboard__activity-list" role="list">
							{recentCredits.slice(0, 10).map((credit) => (
								<div
									key={credit.transactionId}
									className="engagement-dashboard__activity-item"
									role="listitem"
								>
									<span className="engagement-dashboard__activity-action">
										{ACTION_LABELS[credit.action] ?? credit.action}
									</span>
									<span
										className="engagement-dashboard__activity-amount"
										aria-label={`plus ${credit.amount} credits`}
									>
										+{credit.amount}
									</span>
									<time className="engagement-dashboard__activity-time">
										{formatTimeAgo(credit.createdAt)}
									</time>
								</div>
							))}
						</div>
					) : (
						<div className="engagement-dashboard__empty">{t('engagement.noActivity')}</div>
					)}
				</section>
			</div>
		</div>
	);
};

export default EngagementDashboard;
