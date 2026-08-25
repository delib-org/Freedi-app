import { useRef, useState, type FC } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { logError } from '@/utils/logError';
import ModalFrame from './ModalFrame';

/** ConfirmDialog — a small yes/no modal; the safe choice (cancel) has focus. */
export interface ConfirmDialogProps {
	isOpen: boolean;
	title: string;
	text: string;
	confirmLabel: string;
	danger?: boolean;
	onConfirm: () => Promise<void> | void;
	onCancel: () => void;
	/** For the error log, e.g. `QuestionDashboard.archiveQuestion`. */
	operation: string;
}

const ConfirmDialog: FC<ConfirmDialogProps> = ({
	isOpen,
	title,
	text,
	confirmLabel,
	danger = false,
	onConfirm,
	onCancel,
	operation,
}) => {
	const { t } = useTranslation();
	const cancelRef = useRef<HTMLButtonElement>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState('');

	const handleConfirm = async () => {
		setBusy(true);
		setError('');
		try {
			await onConfirm();
		} catch (err) {
			logError(err, { operation });
			setError(t('Something went wrong. Please try again.'));
		} finally {
			setBusy(false);
		}
	};

	return (
		<ModalFrame
			isOpen={isOpen}
			onClose={busy ? () => undefined : onCancel}
			title={title}
			size="small"
			initialFocusRef={cancelRef}
			footer={
				<>
					<button
						ref={cancelRef}
						type="button"
						className="button button--secondary"
						disabled={busy}
						onClick={onCancel}
					>
						{t('Cancel')}
					</button>
					<Button
						text={confirmLabel}
						variant={danger ? 'reject' : 'primary'}
						loading={busy}
						onClick={() => void handleConfirm()}
					/>
				</>
			}
		>
			<p>{text}</p>
			{error && <p role="alert">{error}</p>}
		</ModalFrame>
	);
};

export default ConfirmDialog;
