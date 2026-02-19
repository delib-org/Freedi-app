import { FC, useState } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { getMassConsensusQuestionUrl } from '@/controllers/db/config';
import ShareIcon from '@/assets/icons/shareIcon.svg?react';
import { logError } from '@/utils/errorHandling';
import styles from './QuestionSettings.module.scss';

interface QuestionLinkSectionProps {
	statementId: string;
}

const QuestionLinkSection: FC<QuestionLinkSectionProps> = ({ statementId }) => {
	const { t } = useTranslation();
	const [linkCopied, setLinkCopied] = useState(false);

	const questionLink = getMassConsensusQuestionUrl(statementId);

	const handleCopyLink = async () => {
		try {
			await navigator.clipboard.writeText(questionLink);
			setLinkCopied(true);
			setTimeout(() => setLinkCopied(false), 2000);
		} catch (error) {
			logError(error, {
				operation: 'QuestionLinkSection.handleCopyLink',
				metadata: { message: 'Failed to copy link:' },
			});
		}
	};

	const handleOpenLink = () => {
		window.open(questionLink, '_blank');
	};

	return (
		<div className={styles.questionLink}>
			<label>{t('Question Link')}</label>
			<div className={styles.questionLink__container}>
				<input type="text" value={questionLink} readOnly className={styles.questionLink__input} />
				<button type="button" onClick={handleCopyLink} className={styles.questionLink__button}>
					<ShareIcon />
					<span>{linkCopied ? t('Copied!') : t('Copy')}</span>
				</button>
				<button type="button" onClick={handleOpenLink} className={styles.questionLink__button}>
					<span>{t('Open')}</span>
				</button>
			</div>
		</div>
	);
};

export default QuestionLinkSection;
