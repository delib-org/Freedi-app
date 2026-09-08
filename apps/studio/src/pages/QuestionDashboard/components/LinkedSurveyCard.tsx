import type { FC } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import type { OrganizationActivity } from '@freedi/shared-types';
import { ProgressFunnel } from '@/components/atomic/atoms/ProgressFunnel';
import { Tag } from '@/components/atomic/atoms/Tag';
import { useQuestionProgressByIds } from '@/db/orgActivities';
import { sumProgress } from '@/db/progress';
import { MASS_CONSENSUS_URL } from '@/config';
import styles from './LinkedSurveyCard.module.scss';

/**
 * A Mass-Consensus survey that was added to this board whole.
 *
 * The survey is the thing the consultant chose, so it is shown as one
 * activity rather than as the question it happens to start from. Its details
 * are read off the link record: a Studio client cannot read `surveys` at all,
 * so the title and question list were copied there when it was added.
 */
export interface LinkedSurveyCardProps {
	activity: OrganizationActivity;
}

const LinkedSurveyCard: FC<LinkedSurveyCardProps> = ({ activity }) => {
	const { t, tWithParams } = useTranslation();
	const questionIds = activity.surveyQuestionIds ?? [activity.statementId];
	const { data: progress } = useQuestionProgressByIds(questionIds);
	const totals = sumProgress(progress);

	const participantUrl = `${MASS_CONSENSUS_URL}/s/${activity.surveyId}`;
	const adminUrl = `${MASS_CONSENSUS_URL}/admin/surveys/${activity.surveyId}`;

	return (
		<section className={styles.card} aria-label={t('Crowd survey')}>
			<header className={styles.header}>
				<span className={styles.icon} aria-hidden="true">
					⚡
				</span>
				<div className={styles.heading}>
					<h3 className={styles.title} dir="auto">
						{activity.surveyTitle?.trim() || t('Crowd survey')}
					</h3>
					<p className={styles.meta}>
						<Tag outline>{t('Crowd survey')}</Tag>
						<span>{tWithParams('{{count}} questions', { count: questionIds.length })}</span>
					</p>
				</div>
			</header>

			<ProgressFunnel
				counts={{
					entered: totals.entered,
					suggested: totals.suggested,
					evaluated: totals.evaluated,
				}}
				variant="full"
			/>

			<div className={styles.actions}>
				<a className={styles.action} href={participantUrl} target="_blank" rel="noreferrer">
					{t('Open the survey')}
				</a>
				<a className={styles.action} href={adminUrl} target="_blank" rel="noreferrer">
					{t('Survey settings')}
				</a>
			</div>

			<p className={styles.note}>
				{t('This survey lives in Mass Consensus. Studio shows it here; it is run over there.')}
			</p>
		</section>
	);
};

export default LinkedSurveyCard;
