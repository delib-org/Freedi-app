import { FC, useId } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { fillPlaceholders } from '@/helpers/fillPlaceholders';
import Button from '@/view/components/atomic/atoms/Button';
import Modal from '@/view/components/atomic/molecules/Modal';

interface DeclineManyDialogProps {
	isOpen: boolean;
	count: number;
	onCancel: () => void;
	onConfirm: () => void;
}

/** Confirm before declining several people at once (UX 4.3). Cancel comes first and takes focus. */
const DeclineManyDialog: FC<DeclineManyDialogProps> = ({ isOpen, count, onCancel, onConfirm }) => {
	const { t } = useTranslation();
	const titleId = useId();

	return (
		<Modal
			isOpen={isOpen}
			onClose={onCancel}
			size="small"
			variant="warning"
			title={fillPlaceholders(t('people.declineN.title'), { count })}
			titleId={titleId}
			showCloseButton={false}
			footer={
				<>
					<Button text={t('Cancel')} variant="secondary" onClick={onCancel} isInitialFocus />
					<Button
						text={fillPlaceholders(t('people.declineN.confirm'), { count })}
						variant="reject"
						onClick={onConfirm}
					/>
				</>
			}
		>
			<p>{t('people.declineN.body')}</p>
		</Modal>
	);
};

export default DeclineManyDialog;
