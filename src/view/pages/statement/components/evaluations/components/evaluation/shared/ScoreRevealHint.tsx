import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './ScoreRevealHint.module.scss';

/** Says why no score is showing yet, in the place the score will appear. */
const ScoreRevealHint: FC = () => {
	const { t } = useTranslation();

	return (
		<p className={styles.scoreRevealHint} data-testid="results-reveal-hint">
			{t('The result will be revealed after you rate')}
		</p>
	);
};

export default ScoreRevealHint;
