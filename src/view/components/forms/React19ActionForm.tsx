import React, { useState, useTransition } from 'react';
import { useUserConfig } from '@/controllers/hooks/useUserConfig';
import styles from './React19ActionForm.module.scss';

interface FormData {
	title: string;
	description: string;
}

interface ActionResult {
	success: boolean;
	message: string;
	data?: FormData;
}

// React 19 Action function
async function submitStatementAction(formData: FormData): Promise<ActionResult> {
	// Simulate API call
	await new Promise(resolve => setTimeout(resolve, 1000));
	
	// Basic validation
	if (!formData.title || formData.title.length < 3) {
		return {
			success: false,
			message: 'Title must be at least 3 characters long',
		};
	}
	
	// Simulate successful submission
	return {
		success: true,
		message: 'Statement created successfully!',
		data: formData,
	};
}

interface React19ActionFormProps {
	onSuccess?: (data: FormData) => void;
	onCancel?: () => void;
}

const React19ActionForm: React.FC<React19ActionFormProps> = ({
	onSuccess,
	onCancel,
}) => {
	const { t } = useUserConfig();
	const [isPending, startTransition] = useTransition();
	const [state, setState] = useState<ActionResult>({
		success: false,
		message: '',
	});

	// Handle form submission with React 19 patterns
	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		
		const formData = new FormData(event.currentTarget);
		const data: FormData = {
			title: formData.get('title') as string,
			description: formData.get('description') as string,
		};

		startTransition(async () => {
			const result = await submitStatementAction(data);
			setState(result);
			
			if (result.success && result.data) {
				onSuccess?.(result.data);
			}
		});
	};

	return (
		<div className={styles.formContainer}>
			<h2>{t('Create Statement with React 19 Features')}</h2>
			
			<form onSubmit={handleSubmit} className={styles.form}>
				<div className={styles.inputGroup}>
					<label htmlFor="title">{t('Title')}</label>
					<input
						type="text"
						id="title"
						name="title"
						required
						minLength={3}
						placeholder={t('Enter statement title')}
						className={styles.input}
					/>
				</div>

				<div className={styles.inputGroup}>
					<label htmlFor="description">{t('Description')}</label>
					<textarea
						id="description"
						name="description"
						rows={4}
						placeholder={t('Enter statement description')}
						className={styles.textarea}
					/>
				</div>

				{state.message && (
					<div className={`${styles.message} ${state.success ? styles.success : styles.error}`}>
						{state.message}
					</div>
				)}

				<div className={styles.buttonGroup}>
					<button
						type="submit"
						disabled={isPending}
						className={styles.submitButton}
					>
						{isPending ? t('Creating...') : t('Create Statement')}
					</button>
					
					{onCancel && (
						<button
							type="button"
							onClick={onCancel}
							className={styles.cancelButton}
						>
							{t('Cancel')}
						</button>
					)}
				</div>
			</form>
		</div>
	);
};

export default React19ActionForm;