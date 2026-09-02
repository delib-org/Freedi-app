import { useMemo, type FC } from 'react';
import clsx from 'clsx';
import type {
	StudioExistingActivitySnapshot,
	StudioPlan,
	StudioPlanActivity,
	StudioPlanChange,
	StudioPlanScheduledAction,
} from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { ActivityTypeChip, StatusPill, Tag } from '@/components/atomic/atoms/Tag';
import { Button } from '@/components/atomic/atoms/Button';
import { EmptyState } from '@/components/atomic/atoms/EmptyState';
import { formatRelativeTime, useNowTick } from '@/hooks/useRelativeTime';
import { formatDateTime, toIsoDateTime } from '@/utils/formatDateTime';
import { ACTION_GLYPHS, ACTION_LABELS, toActivityType } from '../planTypes';
import { draftSourcesOf, resolveSourceTitles } from '../planDocument';
import PlanDocumentDetails from './PlanDocumentDetails';
import PlanSeedOptions from './PlanSeedOptions';

/**
 * PlanCard — the live plan next to the chat: main question, ordered
 * activities, schedule and summary. Rows the consultant just changed flash
 * (`--changed`); while a turn is in flight the card shimmers (`--updating`).
 * Styles: styles/organisms/_plan-card.scss (.plan-card)
 */
export interface PlanCardProps {
	plan: StudioPlan | undefined;
	planVersion: number;
	/** Existing-question mode: show New / Updated / Unchanged tags. */
	existingMode: boolean;
	existingActivities?: StudioExistingActivitySnapshot[];
	changedTempIds: string[];
	updating: boolean;
	onAskToChange?: (activity: StudioPlanActivity) => void;
	className?: string;
}

const CHANGE_LABELS: Record<StudioPlanChange, string> = {
	add: 'New',
	update: 'Updated',
	keep: 'Unchanged',
};

const PlanCard: FC<PlanCardProps> = ({
	plan,
	planVersion,
	existingMode,
	existingActivities = [],
	changedTempIds,
	updating,
	onAskToChange,
	className,
}) => {
	const { t, tWithParams, currentLanguage } = useTranslation();
	const now = useNowTick();

	const activities = useMemo(
		() => (plan ? [...plan.activities].sort((a, b) => a.order - b.order) : []),
		[plan],
	);
	const schedule = useMemo(
		() => (plan ? [...plan.scheduledActions].sort((a, b) => a.at - b.at) : []),
		[plan],
	);
	const changed = useMemo(() => new Set(changedTempIds), [changedTempIds]);

	const targetTitle = (action: StudioPlanScheduledAction): string => {
		if (action.activityTempId) {
			const activity = activities.find((a) => a.tempId === action.activityTempId);
			if (activity) return activity.title;
		}
		if (action.statementId) {
			const existing = existingActivities.find((a) => a.statementId === action.statementId);
			if (existing) return existing.title;
		}

		return t('Main question');
	};

	const draftSourceTitles = (action: StudioPlanScheduledAction): string[] =>
		action.action === 'draft'
			? resolveSourceTitles(draftSourcesOf(action, activities), activities, existingActivities)
			: [];

	const rowKey = (tempId: string) => (changed.has(tempId) ? `${tempId}:${planVersion}` : tempId);

	const rootClasses = clsx('plan-card', updating && 'plan-card--updating', className);

	if (!plan) {
		return (
			<section className={rootClasses} aria-busy={updating} aria-label={t('Plan')}>
				<EmptyState
					icon="🗺"
					title={t('Your plan will appear here')}
					text={t('Describe the challenge in the chat and the consultant will draft a plan.')}
					compact
				/>
			</section>
		);
	}

	return (
		<section className={rootClasses} aria-busy={updating} aria-label={t('Plan')}>
			<p className="visually-hidden" role="status">
				{tWithParams('Plan updated ({{n}} activities)', { n: activities.length })}
			</p>

			<header className="plan-card__header">
				<h2 className="plan-card__title">{t('Plan')}</h2>
				{existingMode && (
					<p className="plan-card__note">{t('Adds and updates only — nothing is removed.')}</p>
				)}
			</header>

			{/* Main question */}
			<section className="plan-card__section">
				<h3 className="plan-card__section-title">{t('Main question')}</h3>
				<p className="plan-card__question" dir="auto">
					{plan.mainQuestion.title}
				</p>
				{plan.mainQuestion.description && (
					<p className="plan-card__description" dir="auto">
						{plan.mainQuestion.description}
					</p>
				)}
			</section>

			{/* Activities */}
			<section className="plan-card__section">
				<h3 className="plan-card__section-title">{t('Activities')}</h3>
				{activities.length === 0 ? (
					<p className="plan-card__empty">{t('No activities in the plan yet.')}</p>
				) : (
					<ol className="plan-card__activities">
						{activities.map((activity, index) => (
							<li
								key={rowKey(activity.tempId)}
								className={clsx(
									'plan-card__activity',
									changed.has(activity.tempId) && 'plan-card__activity--changed',
								)}
							>
								<span className="plan-card__order" aria-hidden="true">
									{index + 1}
								</span>
								<div className="plan-card__activity-body">
									<div className="plan-card__activity-meta">
										<ActivityTypeChip type={toActivityType(activity.type)} />
										<StatusPill
											status={activity.openNow ? 'open' : 'queued'}
											document={activity.type === 'document'}
										/>
										{existingMode && (
											<Tag outline={activity.change === 'keep'}>
												{t(CHANGE_LABELS[activity.change])}
											</Tag>
										)}
									</div>
									<p className="plan-card__activity-title" dir="auto">
										{activity.title}
									</p>
									{activity.description && (
										<p className="plan-card__description" dir="auto">
											{activity.description}
										</p>
									)}
									{activity.survey && (
										<ul className="plan-card__survey">
											{activity.survey.intro && (
												<li dir="auto">
													{tWithParams('Intro: {{text}}', { text: activity.survey.intro })}
												</li>
											)}
											{activity.survey.allowParticipantsToAddSuggestions !== undefined && (
												<li>
													{activity.survey.allowParticipantsToAddSuggestions
														? t('Participants can add suggestions')
														: t('Participants cannot add suggestions')}
												</li>
											)}
											{activity.survey.minEvaluationsPerQuestion !== undefined && (
												<li>
													{tWithParams('Min evaluations: {{n}}', {
														n: activity.survey.minEvaluationsPerQuestion,
													})}
												</li>
											)}
											{activity.survey.extraQuestions &&
												activity.survey.extraQuestions.length > 0 && (
													<li>
														{tWithParams('{{count}} extra questions', {
															count: activity.survey.extraQuestions.length,
														})}
													</li>
												)}
										</ul>
									)}
									<PlanSeedOptions activity={activity} />
									{activity.type === 'document' && (
										<PlanDocumentDetails
											activity={activity}
											activities={activities}
											existingActivities={existingActivities}
										/>
									)}
									{onAskToChange && (
										<Button
											text={t('Ask to change')}
											variant="secondary"
											size="small"
											className="plan-card__ask"
											ariaLabel={tWithParams('Ask to change "{{title}}"', {
												title: activity.title,
											})}
											onClick={() => onAskToChange(activity)}
										/>
									)}
								</div>
							</li>
						))}
					</ol>
				)}
			</section>

			{/* Schedule */}
			{schedule.length > 0 && (
				<section className="plan-card__section">
					<h3 className="plan-card__section-title">{t('Schedule')}</h3>
					<ol className="plan-card__schedule">
						{schedule.map((action) => (
							<li
								key={rowKey(action.tempId)}
								className={clsx(
									'plan-card__action',
									`plan-card__action--${action.action}`,
									changed.has(action.tempId) && 'plan-card__action--changed',
								)}
							>
								<time className="plan-card__time" dateTime={toIsoDateTime(action.at)}>
									{formatDateTime(action.at, currentLanguage)}
									<span className="plan-card__relative">
										{' '}
										({formatRelativeTime(action.at, currentLanguage, { now })})
									</span>
								</time>
								<span className="plan-card__action-kind">
									<span className="plan-card__glyph" aria-hidden="true">
										{ACTION_GLYPHS[action.action]}
									</span>
									{t(ACTION_LABELS[action.action])}
								</span>
								<span className="plan-card__target" dir="auto">
									{targetTitle(action)}
								</span>
								{action.action === 'nudge' && action.nudgeMessage && (
									<p className="plan-card__nudge" dir="auto">
										{action.nudgeMessage}
									</p>
								)}
								{action.action === 'draft' && draftSourceTitles(action).length > 0 && (
									<p className="plan-card__nudge" dir="auto">
										{tWithParams('From: {{sources}}', {
											sources: draftSourceTitles(action).join(' · '),
										})}
									</p>
								)}
							</li>
						))}
					</ol>
				</section>
			)}

			{/* Summary */}
			{plan.summary && (
				<section className="plan-card__section">
					<h3 className="plan-card__section-title">{t('Summary')}</h3>
					<p className="plan-card__summary" dir="auto">
						{plan.summary}
					</p>
				</section>
			)}
		</section>
	);
};

export default PlanCard;
