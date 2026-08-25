import { type FC } from 'react';
import type { ActivityType } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { EmptyState } from '@/components/atomic/atoms/EmptyState';
import {
	ActivityTypePicker,
	DEFAULT_ACTIVITY_OPTIONS,
} from '@/components/atomic/molecules/ActivityTypePicker';

/**
 * EmptyActivities — the board's empty state IS the add-activity picker:
 * choosing a type opens the add modal on step 2. Viewers get a plain note.
 */
export interface EmptyActivitiesProps {
	canManage: boolean;
	onPickType: (type: ActivityType) => void;
}

const EmptyActivities: FC<EmptyActivitiesProps> = ({ canManage, onPickType }) => {
	const { t } = useTranslation();

	if (!canManage) {
		return (
			<EmptyState
				icon="📋"
				title={t('No activities yet')}
				text={t('The organisers have not added anything for participants to do.')}
			/>
		);
	}

	return (
		<EmptyState
			icon="🚀"
			title={t('What should participants do first?')}
			text={t('Pick an activity type — a crowd survey is the easiest way to start.')}
			action={
				<ActivityTypePicker
					options={DEFAULT_ACTIVITY_OPTIONS(t)}
					onChange={onPickType}
					label={t('Activity type')}
					compact
				/>
			}
		/>
	);
};

export default EmptyActivities;
