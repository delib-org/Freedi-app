import { useId, useState, type FC } from 'react';
import clsx from 'clsx';
import type { StudioPlan } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import ConfirmDialog from '@/pages/QuestionDashboard/components/ConfirmDialog';
import type { PlanPhase } from '../planTypes';

/**
 * BuildBar — the one irreversible step: "Build it" (new question) or
 * "Apply plan" (existing question, confirmed with counts first).
 * Styles: styles/organisms/_build-bar.scss (.build-bar)
 */
export interface BuildBarProps {
	phase: PlanPhase;
	plan: StudioPlan | undefined;
	readyToBuild: boolean;
	/** Why the consultant says the plan is not ready yet. */
	problems: string[];
	existingMode: boolean;
	buildError: string | null;
	/** A failed build that still created the top question. */
	partialTopQuestionId?: string;
	onBuild: () => void;
	onOpenQuestion: (topQuestionId: string) => void;
	className?: string;
}

const BuildBar: FC<BuildBarProps> = ({
	phase,
	plan,
	readyToBuild,
	problems,
	existingMode,
	buildError,
	partialTopQuestionId,
	onBuild,
	onOpenQuestion,
	className,
}) => {
	const { t, tWithParams } = useTranslation();
	const hintId = useId();
	const [confirming, setConfirming] = useState(false);

	const activityCount = plan?.activities.length ?? 0;
	const building = phase === 'building';
	const canBuild = readyToBuild && activityCount > 0 && phase === 'chatting';

	const hint = building
		? t('Building your question…')
		: activityCount === 0
			? t('The plan needs at least one activity before it can be built.')
			: !readyToBuild
				? problems.length > 0
					? problems.join(' · ')
					: t('Keep chatting until the consultant says the plan is ready.')
				: existingMode
					? t('Applies the new activities and changes to this question. Nothing will be removed.')
					: t('Creates the main question, its activities and the scheduled actions.');

	const adds = plan?.activities.filter((a) => a.change === 'add').length ?? 0;
	const updates = plan?.activities.filter((a) => a.change === 'update').length ?? 0;
	const actions = plan?.scheduledActions.length ?? 0;

	const handleClick = () => {
		if (!canBuild) return;
		if (existingMode) setConfirming(true);
		else onBuild();
	};

	return (
		<div className={clsx('build-bar', building && 'build-bar--building', className)}>
			<button
				type="button"
				className={clsx(
					'button',
					'button--primary',
					'button--large',
					building && 'button--loading',
				)}
				disabled={!canBuild}
				aria-busy={building}
				aria-describedby={hintId}
				onClick={handleClick}
			>
				{building && <span className="button__loader" aria-hidden="true" />}
				<span className="button__text">
					{building ? t('Building…') : existingMode ? t('Apply plan') : t('Build it')}
				</span>
			</button>
			<p id={hintId} className="build-bar__hint">
				{hint}
			</p>

			{buildError && (
				<div className="build-bar__error" role="alert">
					<span>{buildError}</span>
					<div className="build-bar__error-actions">
						<Button text={t('Retry')} variant="secondary" size="small" onClick={onBuild} />
						{partialTopQuestionId && (
							<Button
								text={t('Open the question')}
								variant="secondary"
								size="small"
								onClick={() => onOpenQuestion(partialTopQuestionId)}
							/>
						)}
					</div>
				</div>
			)}

			<ConfirmDialog
				isOpen={confirming}
				title={t('Apply this plan to the question?')}
				text={tWithParams(
					'{{adds}} new activities, {{updates}} changes, {{actions}} scheduled actions. Nothing will be removed.',
					{ adds, updates, actions },
				)}
				confirmLabel={t('Apply plan')}
				operation="BuildBar.applyPlan"
				onConfirm={() => {
					setConfirming(false);
					onBuild();
				}}
				onCancel={() => setConfirming(false)}
			/>
		</div>
	);
};

export default BuildBar;
