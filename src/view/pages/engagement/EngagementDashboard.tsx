import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useEngagement } from '@/controllers/hooks/useEngagement';
import Back from '@/view/pages/statement/components/header/Back';
import LevelBadge from '@/view/components/atomic/atoms/LevelBadge/LevelBadge';
import LevelProgress from '@/view/components/atomic/atoms/LevelProgress/LevelProgress';
import PeopleLoader from '@/view/components/loaders/PeopleLoader';
import { formatCreditsEarned, formatLevelLabel } from '@/helpers/engagementLabels';
import { formatRelativeTime } from '@/helpers/relativeTime';
import {
	getBadgeIcon,
	getBadgeText,
	getCreditActionLabel,
	isCreditActionListed,
} from './engagementDisplay';

const RECENT_ACTIVITY_LIMIT = 10;

const EngagementDashboard = () => {
	const { t, dir, currentLanguage } = useTranslation();
	const {
		engagement,
		loading,
		recentCredits,
		level,
		levelProgress,
		nextLevelThreshold,
		totalCredits,
		badges,
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

	const activity = recentCredits
		.filter((credit) => isCreditActionListed(credit.action))
		.slice(0, RECENT_ACTIVITY_LIMIT);

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
				{/* Level header */}
				<section className="engagement-dashboard__header" aria-label={t('engagement.currentLevel')}>
					<div className="engagement-dashboard__level-section">
						<LevelBadge level={level} size="large" iconOnly />
						<dl className="engagement-dashboard__level-info">
							<dt className="engagement-dashboard__level-label">{t('engagement.currentLevel')}</dt>
							<dd className="engagement-dashboard__level-name">{formatLevelLabel(t, level)}</dd>
						</dl>
					</div>
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
							{badges.map((badge) => {
								const BadgeIcon = getBadgeIcon(badge.icon);
								const { name, description } = getBadgeText(t, badge);

								return (
									<div
										key={badge.badgeId}
										className="engagement-dashboard__badge"
										role="listitem"
										aria-label={`${name}: ${description}`}
									>
										<span className="engagement-dashboard__badge-icon" aria-hidden="true">
											<BadgeIcon />
										</span>
										<span className="engagement-dashboard__badge-name">{name}</span>
									</div>
								);
							})}
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
					{activity.length > 0 ? (
						<div className="engagement-dashboard__activity-list" role="list">
							{activity.map((credit) => (
								<div
									key={credit.transactionId}
									className="engagement-dashboard__activity-item"
									role="listitem"
								>
									<span className="engagement-dashboard__activity-action">
										{getCreditActionLabel(t, credit.action)}
									</span>
									<span
										className="engagement-dashboard__activity-amount"
										aria-label={formatCreditsEarned(t, credit.amount)}
									>
										+{credit.amount}
									</span>
									<time className="engagement-dashboard__activity-time">
										{formatRelativeTime(credit.createdAt, Date.now(), currentLanguage)}
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
