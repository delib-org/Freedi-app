import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useQuestionProgress } from '@/controllers/hooks/useQuestionProgress';
import ParticipationFunnel from '@/view/components/atomic/atoms/ParticipationFunnel/ParticipationFunnel';
import {
	formatCompactCount,
	publicDecidedCount,
	toPublicParticipation,
} from '@/helpers/participationVisibility';
import { STAGE_DECIDED } from '@/helpers/questionStage';
import type { QuestionScreenData } from './useQuestionScreenData';

interface GroupProgressProps {
	statementId: string;
	data: QuestionScreenData;
}

/**
 * The group's progress, for participants: on the question overview and Results,
 * never near the rating card. Hosts keep their own panel. Renders nothing at
 * all while a count is too small to show.
 */
const GroupProgress: FC<GroupProgressProps> = ({ statementId, data }) => {
	const { t, currentLanguage } = useTranslation();
	const actionKey = `${data.ratedCount}:${data.hasVoted}:${data.answers.length - data.rateableCount}`;
	const progress = useQuestionProgress(data.isHost ? undefined : statementId, actionKey);

	if (data.isHost || !progress) return null;

	if (data.stage === STAGE_DECIDED) {
		const count = publicDecidedCount(progress);
		if (count === undefined) return null;

		return (
			<p className="participation-funnel" data-testid="group-progress">
				{t('progress.tookPartInDecision').replace(
					'{{count}}',
					formatCompactCount(count, currentLanguage),
				)}
			</p>
		);
	}

	const { suggested, evaluated } = toPublicParticipation(progress);
	if (suggested === undefined && evaluated === undefined) return null;

	return (
		<ParticipationFunnel
			audience="participant"
			leadIn={t('progress.soFar')}
			suggested={suggested}
			evaluated={evaluated}
		/>
	);
};

export default GroupProgress;
