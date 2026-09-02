import { useState } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button, Input } from '@/components/atomic/atoms';
import { openAgoraClass } from '@/db/agoraAdminFunctions';
import { logError } from '@/utils/logError';
import SimpleModal from '../_shared/SimpleModal';
import styles from './AdminAgora.module.scss';

interface OpenClassModalProps {
	schoolId: string;
	onClose: () => void;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * System-admin dialog: open a class under a school, optionally assigning its
 * first teacher by email. Shows the persistent class code once created —
 * that code is what students claim their roster spot with.
 */
export default function OpenClassModal({ schoolId, onClose }: OpenClassModalProps) {
	const { t } = useTranslation();
	const [name, setName] = useState('');
	const [gradeLevel, setGradeLevel] = useState('');
	const [teacherEmail, setTeacherEmail] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');
	const [createdCode, setCreatedCode] = useState('');

	const email = teacherEmail.trim().toLowerCase();
	const canSubmit =
		name.trim().length > 0 && (email === '' || EMAIL_PATTERN.test(email)) && !submitting;

	const handleCreate = async () => {
		if (!canSubmit) return;
		setSubmitting(true);
		setError('');
		try {
			const result = await openAgoraClass({
				action: 'create',
				schoolId,
				name: name.trim(),
				...(gradeLevel.trim() ? { gradeLevel: gradeLevel.trim() } : {}),
				...(email ? { teacherEmail: email } : {}),
			});
			setCreatedCode(result.classCode ?? '');
		} catch (err) {
			logError(err, { operation: 'OpenClassModal.create' });
			setError(
				email
					? t(
							'Could not open the class — the teacher must sign in to Agora with Google once first.',
						)
					: t('Could not open the class. Please try again.'),
			);
			setSubmitting(false);
		}
	};

	if (createdCode) {
		return (
			<SimpleModal title={t('Class opened')} onClose={onClose}>
				<div className={styles.form}>
					<p>{t('Students claim their roster spot with this class code:')}</p>
					<code className={styles.bigCode}>{createdCode}</code>
					<div className={styles.formActions}>
						<Button text={t('Done')} variant="primary" onClick={onClose} />
					</div>
				</div>
			</SimpleModal>
		);
	}

	return (
		<SimpleModal title={t('Open class')} onClose={onClose}>
			<div className={styles.form}>
				<Input
					ariaLabel={t('Class name')}
					placeholder={t('Class name')}
					value={name}
					onChange={setName}
				/>
				<Input
					ariaLabel={t('Grade level')}
					placeholder={t('Grade level')}
					value={gradeLevel}
					onChange={setGradeLevel}
				/>
				<Input
					type="email"
					ariaLabel={t('Teacher email')}
					placeholder={t('Teacher email (optional)')}
					value={teacherEmail}
					onChange={setTeacherEmail}
				/>
				{error && <p className={styles.error}>{error}</p>}
				<div className={styles.formActions}>
					<Button text={t('Cancel')} variant="secondary" onClick={onClose} />
					<Button
						text={submitting ? t('Opening…') : t('Open class')}
						variant="primary"
						disabled={!canSubmit}
						onClick={() => void handleCreate()}
					/>
				</div>
			</div>
		</SimpleModal>
	);
}
