import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from '../QuestionScreen.module.scss';

const LINE_KEYS = [
	'results.howToRead1',
	'results.howToRead2',
	'results.howToRead3',
	'results.howToRead4',
] as const;

/** Closed by default: what an agreement score is, and what it is not. */
const HowToReadResults: FC = () => {
	const { t } = useTranslation();

	return (
		<details className={styles.howToRead} data-testid="results-how-to-read">
			<summary className={styles.howToRead__title}>{t('results.howToRead')}</summary>
			{LINE_KEYS.map((key) => (
				<p key={key} className={styles.howToRead__line}>
					{t(key)}
				</p>
			))}
		</details>
	);
};

export default HowToReadResults;
