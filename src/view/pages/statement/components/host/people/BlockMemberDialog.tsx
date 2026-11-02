import { FC, useId } from 'react';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { fillPlaceholders } from '@/helpers/fillPlaceholders';
import Button from '@/view/components/atomic/atoms/Button';
import Modal from '@/view/components/atomic/molecules/Modal';

interface BlockMemberDialogProps {
	name: string | null;
	onCancel: () => void;
	onConfirm: () => void;
}

/**
 * Block asks first (UX 4.4): the consequence in one line, Cancel first and
 * focused. Blocking changes the role only — the person's votes and
 * evaluations stay where they are.
 */
const BlockMemberDialog: FC<BlockMemberDialogProps> = ({ name, onCancel, onConfirm }) => {
	const { t } = useTranslation();
	const titleId = useId();

	return (
		<Modal
			isOpen={name !== null}
			onClose={onCancel}
			size="small"
			variant="warning"
			title={fillPlaceholders(t('people.block.title'), { name: name ?? '' })}
			titleId={titleId}
			showCloseButton={false}
			footer={
				<>
					<Button text={t('Cancel')} variant="secondary" onClick={onCancel} isInitialFocus />
					<Button text={t('people.block')} variant="reject" onClick={onConfirm} />
				</>
			}
		>
			<p>{t('people.block.body')}</p>
		</Modal>
	);
};

export default BlockMemberDialog;
