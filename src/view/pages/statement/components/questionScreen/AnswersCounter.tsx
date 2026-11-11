import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { QuestionScreenData } from './useQuestionScreenData';
import styles from './QuestionScreen.module.scss';

interface AnswersCounterProps {
	data: QuestionScreenData;
	/** On the Rate view, how many answers this person still has to rate. */
	moreToRate?: number;
}

/**
 * "{rated}/{total}" above the answers list. The cue under the stage bar says what to do.
 * Under the voting UI people vote instead of rating, so a ratings count would stay at 0.
 */
const AnswersCounter: FC<AnswersCounterProps> = ({ data, moreToRate }) => {
	const { t } = useTranslation();

	if (moreToRate !== undefined) {
		return (
			<div className={styles.counter} data-testid="answers-counter">
				{moreToRate > 0 && (
					<span className={styles.counter__count}>
						{t('{n} more to rate').replace('{n}', String(moreToRate))}
					</span>
				)}
			</div>
		);
	}

	return (
		<div className={styles.counter} data-testid="answers-counter">
			{!data.usesVotingUI && data.answersComplete && data.rateableCount > 0 && (
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
