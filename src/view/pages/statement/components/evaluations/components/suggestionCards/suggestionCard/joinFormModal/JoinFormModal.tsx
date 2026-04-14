import React, { FC, useMemo, useState } from 'react';
import { JoinFormField } from '@freedi/shared-types';
import Modal from '@/view/components/atomic/molecules/Modal/Modal';
import Button from '@/view/components/atomic/atoms/Button/Button';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import styles from './JoinFormModal.module.scss';

interface JoinFormModalProps {
	isOpen: boolean;
	onClose: () => void;
	fields: JoinFormField[];
	initialDisplayName?: string;
	onSubmit: (payload: { displayName: string; values: Record<string, string> }) => Promise<void>;
}

// Loose validators — we accept anything that plausibly matches. Strictness
// is handled in a follow-up if admins report bad data.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^\+?[\d\s\-().]{6,}$/;

function isFieldValid(field: JoinFormField, value: string): boolean {
	const trimmed = value.trim();
	if (!trimmed) return !field.required;
	if (field.type === 'email') return EMAIL_RE.test(trimmed);
	if (field.type === 'phone') return PHONE_RE.test(trimmed);

	return true;
}

const JoinFormModal: FC<JoinFormModalProps> = ({
	isOpen,
	onClose,
	fields,
	initialDisplayName = '',
	onSubmit,
}) => {
	const { t } = useTranslation();
	const [values, setValues] = useState<Record<string, string>>({});
	const [showErrors, setShowErrors] = useState(false);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const allValid = useMemo(
		() => fields.every((field) => isFieldValid(field, values[field.id] ?? '')),
		[fields, values],
	);

	const handleChange = (fieldId: string, value: string) => {
		setValues((prev) => ({ ...prev, [fieldId]: value }));
	};

	const handleSubmit = async () => {
		if (!allValid) {
			setShowErrors(true);

			return;
		}
		setIsSubmitting(true);
		try {
			const cleaned: Record<string, string> = {};
			fields.forEach((field) => {
				cleaned[field.id] = (values[field.id] ?? '').trim();
			});
			// Best-effort display name: use a field labeled/typed as name, else fall back.
			const nameField = fields.find(
				(f) => f.id === 'name' || f.label.toLowerCase().includes('name'),
			);
			const displayName = nameField ? cleaned[nameField.id] : initialDisplayName;
			await onSubmit({ displayName, values: cleaned });
			setValues({});
			setShowErrors(false);
		} finally {
			setIsSubmitting(false);
		}
	};

	const inputTypeFor = (type: JoinFormField['type']): string => {
		if (type === 'email') return 'email';
		if (type === 'phone') return 'tel';

		return 'text';
	};

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title={t('Tell us about yourself')}
			size="medium"
			footer={
				<>
					<Button text={t('Cancel')} variant="cancel" onClick={onClose} disabled={isSubmitting} />
					<Button
						text={isSubmitting ? t('Saving...') : t('Submit')}
						variant="primary"
						onClick={handleSubmit}
						disabled={isSubmitting}
						loading={isSubmitting}
					/>
				</>
			}
		>
			<form
				className={styles.joinForm}
				onSubmit={(e) => {
					e.preventDefault();
					handleSubmit();
				}}
			>
				{fields.map((field) => {
					const value = values[field.id] ?? '';
					const valid = isFieldValid(field, value);
					const showError = showErrors && !valid;

					return (
						<div
							key={field.id}
							className={`${styles.joinForm__field} ${showError ? styles['joinForm__field--error'] : ''}`}
						>
							<label className={styles.joinForm__label} htmlFor={`join-field-${field.id}`}>
								{field.label}
								{field.required && (
									<span className={styles.joinForm__required} aria-hidden="true">
										*
									</span>
								)}
							</label>
							<input
								id={`join-field-${field.id}`}
								className={styles.joinForm__input}
								type={inputTypeFor(field.type)}
								inputMode={field.type === 'phone' ? 'tel' : undefined}
								value={value}
								required={field.required}
								onChange={(e) => handleChange(field.id, e.target.value)}
								aria-invalid={showError}
							/>
						</div>
					);
				})}
				{showErrors && !allValid && (
					<p className={styles.joinForm__errorMessage} role="alert">
						{t('Please fill in all required fields')}
					</p>
				)}
			</form>
		</Modal>
	);
};

export default JoinFormModal;
