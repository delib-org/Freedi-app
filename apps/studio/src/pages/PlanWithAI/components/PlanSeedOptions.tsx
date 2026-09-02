import type { FC } from 'react';
import type { StudioPlanActivity } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';

/**
 * PlanSeedOptions — the starting suggestions of a crowd-survey activity in
 * the plan, collapsed under a "Starting suggestions (n)" summary. A crowd
 * survey without seeds says so, since it will open empty.
 * Styles: styles/organisms/_plan-card.scss (.plan-card__seeds*)
 */
export interface PlanSeedOptionsProps {
	activity: StudioPlanActivity;
}

const PlanSeedOptions: FC<PlanSeedOptionsProps> = ({ activity }) => {
	const { t, tWithParams } = useTranslation();
	if (activity.type !== 'crowdSurvey') return null;

	const seeds = activity.survey?.seedOptions ?? [];
	if (seeds.length === 0) {
		return (
			<p className="plan-card__seeds-empty">
				{t('No starting suggestions — the survey opens empty')}
			</p>
		);
	}

	return (
		<details className="plan-card__seeds">
			<summary className="plan-card__seeds-summary">
				{tWithParams('Starting suggestions ({{count}})', { count: seeds.length })}
			</summary>
			<ul className="plan-card__seeds-list">
				{seeds.map((seed, index) => (
					<li key={`${index}:${seed}`} dir="auto">
						{seed}
					</li>
				))}
			</ul>
		</details>
	);
};

export default PlanSeedOptions;
