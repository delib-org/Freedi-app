import { FC } from 'react';
import { Statement } from '@freedi/shared-types';
import { useEditPermission } from '@/controllers/hooks/useEditPermission';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './SummarizeButton.module.scss';

interface SummarizeButtonProps {
	statement: Statement;
	onOpenModal: () => void;
	isLoading: boolean;
}

const SummarizeButton: FC<SummarizeButtonProps> = ({ statement, onOpenModal, isLoading }) => {
	const { isAdmin } = useEditPermission(statement);
	const { t } = useTranslation();

	// Only show to admins
	if (!isAdmin) return null;

	return (
		<div className={styles.summarizeButtonWrapper}>
			<button
				className={`btn btn--secondary ${isLoading ? 'btn--disabled' : ''}`}
				onClick={onOpenModal}
				disabled={isLoading}
				aria-label={t('Generate AI summary of the discussion')}
			>
				{isLoading ? t('Generating...') : t('Summarize Discussion')}
			</button>
		</div>
	);
};

export default SummarizeButton;
