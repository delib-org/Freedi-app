import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { QuestionScreenData } from './useQuestionScreenData';
import styles from './QuestionScreen.module.scss';

interface AnswersCounterProps {
	data: QuestionScreenData;
}

/** "{rated}/{total}" above the answers list. The cue under the stage bar says what to do. */
const AnswersCounter: FC<AnswersCounterProps> = ({ data }) => {
	const { t } = useTranslation();

	return (
		<div className={styles.counter} data-testid="answers-counter">
			{data.answersComplete && data.rateableCount > 0 && (
				<span
					className={styles.counter__count}
					aria-label={t('{rated} of {total} rated')
						.replace('{rated}', String(data.ratedCount))
						.replace('{total}', String(data.rateableCount))}
				>
					{data.ratedCount}/{data.rateableCount}
				</span>
			)}
		</div>
	);
};

export default AnswersCounter;
