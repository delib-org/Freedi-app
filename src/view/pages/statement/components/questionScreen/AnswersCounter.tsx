import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { getRateHint } from './resultsLogic';
import type { QuestionScreenData } from './useQuestionScreenData';
import styles from './QuestionScreen.module.scss';

interface AnswersCounterProps {
	data: QuestionScreenData;
}

/** "{hint} · {rated}/{total}" above the answers list. */
const AnswersCounter: FC<AnswersCounterProps> = ({ data }) => {
	const { t } = useTranslation();
	const hint = getRateHint({
		canRate: data.canRate,
		stage: data.stage,
		rated: data.ratedCount,
		total: data.rateableCount,
	});
	const hintText = hint.value ? t(hint.key).replace('{n}', hint.value) : t(hint.key);

	return (
		<div className={styles.counter} data-testid="answers-counter">
			<span className={styles.counter__hint}>{hintText}</span>
			{data.rateableCount > 0 && (
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
