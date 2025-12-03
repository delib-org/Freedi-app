import { FC } from 'react';
import { Statement } from 'delib-npm';
import { useEditPermission } from '@/controllers/hooks/useEditPermission';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './SummarizeButton.module.scss';

interface SummarizeButtonProps {
	statement: Statement;
	onOpenModal: () => void;
	isLoading: boolean;
}

const SummarizeButton: FC<SummarizeButtonProps> = ({
	statement,
	onOpenModal,
	isLoading
}) => {
	const { isAdmin, isCreator } = useEditPermission(statement);
	const { t } = useTranslation();

	// TODO: Uncomment when ready for production
	// Only show to admins or creators
	// if (!isAdmin && !isCreator) return null;

	console.info('SummarizeButton render:', { isAdmin, isCreator, statementId: statement?.statementId });

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
