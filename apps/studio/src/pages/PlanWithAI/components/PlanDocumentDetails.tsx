import type { FC } from 'react';
import type { StudioExistingActivitySnapshot, StudioPlanActivity } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { describeCutoff } from '@/utils/draftSettings';
import { resolveSourceTitles } from '../planDocument';

/**
 * PlanDocumentDetails — the Draft step of a document activity in the plan:
 * what it is written from, which suggestions count, and the intent.
 * Styles: styles/organisms/_plan-card.scss (.plan-card__document)
 */
export interface PlanDocumentDetailsProps {
	activity: StudioPlanActivity;
	activities: StudioPlanActivity[];
	existingActivities: StudioExistingActivitySnapshot[];
}

const PlanDocumentDetails: FC<PlanDocumentDetailsProps> = ({
	activity,
	activities,
	existingActivities,
}) => {
	const { t, tWithParams } = useTranslation();
	const sources = resolveSourceTitles(activity.draftFrom, activities, existingActivities);
	if (sources.length === 0 && !activity.draftIntent) return null;

	return (
		<ul className="plan-card__document">
			{sources.length > 0 && (
				<>
					<li dir="auto">
						<span className="plan-card__glyph" aria-hidden="true">
							📝
						</span>{' '}
						{tWithParams('Drafted from: {{sources}}', { sources: sources.join(' · ') })}
					</li>
					<li>{describeCutoff(activity.draftCutoff, t, tWithParams)}</li>
				</>
			)}
			{activity.draftIntent && (
				<li dir="auto">{tWithParams('Intent: {{text}}', { text: activity.draftIntent })}</li>
			)}
		</ul>
	);
};

export default PlanDocumentDetails;
