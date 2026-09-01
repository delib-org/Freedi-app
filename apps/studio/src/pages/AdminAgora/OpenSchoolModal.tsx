import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button, Input } from '@/components/atomic/atoms';
import { manageAgoraSchool } from '@/db/agoraAdminFunctions';
import { logError } from '@/utils/logError';
import SimpleModal from '../_shared/SimpleModal';
import styles from './AdminAgora.module.scss';

interface OpenSchoolModalProps {
	onClose: () => void;
}

/** System-admin dialog: open a school for the Agora classroom game. */
export default function OpenSchoolModal({ onClose }: OpenSchoolModalProps) {
	const { t } = useTranslation();
	const [name, setName] = useState('');
	const [city, setCity] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');

	const canSubmit = name.trim().length > 0 && !submitting;

	const handleCreate = async () => {
		if (!canSubmit) return;
		setSubmitting(true);
		setError('');
		try {
			await manageAgoraSchool({
				action: 'create',
				name: name.trim(),
				...(city.trim() ? { city: city.trim() } : {}),
			});
			onClose();
		} catch (err) {
			logError(err, { operation: 'OpenSchoolModal.create' });
			setError(t('Could not open the school. Please try again.'));
			setSubmitting(false);
		}
	};

	return (
		<SimpleModal title={t('Open school')} onClose={onClose}>
			<div className={styles.form}>
				<Input
					ariaLabel={t('School name')}
					placeholder={t('School name')}
					value={name}
					onChange={setName}
				/>
				<Input ariaLabel={t('City')} placeholder={t('City')} value={city} onChange={setCity} />
				{error && <p className={styles.error}>{error}</p>}
				<div className={styles.formActions}>
					<Button text={t('Cancel')} variant="secondary" onClick={onClose} />
					<Button
						text={submitting ? t('Opening…') : t('Open school')}
						variant="primary"
						disabled={!canSubmit}
						onClick={() => void handleCreate()}
					/>
				</div>
			</div>
		</SimpleModal>
	);
}
