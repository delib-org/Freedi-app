import { FC } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import Text from '@/view/components/text/Text';
import styles from './SummaryDisplay.module.scss';

interface SummaryDisplayProps {
	summary: string | undefined;
	generatedAt?: number;
}

const SummaryDisplay: FC<SummaryDisplayProps> = ({ summary, generatedAt }) => {
	const { t } = useTranslation();

	if (!summary) return null;

	const formattedDate = generatedAt ? new Date(generatedAt).toLocaleDateString() : undefined;

	return (
		<div className={styles.summaryContainer}>
			<div className={styles.summaryHeader}>
				<h4>{t('Discussion Summary')}</h4>
				{formattedDate && (
					<span className={styles.timestamp}>
						{t('Generated')}: {formattedDate}
					</span>
				)}
			</div>
			<div className={styles.summaryContent}>
				<Text description={summary} enableMarkdown={true} />
			</div>
		</div>
	);
};

export default SummaryDisplay;
