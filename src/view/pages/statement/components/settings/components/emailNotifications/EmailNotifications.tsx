import { FC, useState, useEffect, FormEvent } from 'react';
import { Statement } from '@freedi/shared-types';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { logError } from '@/utils/errorHandling';
import { getFunctionsUrl, getMassConsensusResultsUrl } from '@/controllers/db/config';
import styles from './EmailNotifications.module.scss';
import SectionTitle from '../sectionTitle/SectionTitle';

interface EmailNotificationsProps {
	statement: Statement;
}

interface SendEmailResponse {
	ok: boolean;
	message: string;
	sentCount?: number;
	failedCount?: number;
	error?: string;
}

interface SubscriberCountResponse {
	ok: boolean;
	count: number;
	statementId: string;
}

const MAX_SUBJECT_LENGTH = 100;
const MAX_MESSAGE_LENGTH = 2000;

const EmailNotifications: FC<EmailNotificationsProps> = ({ statement }) => {
	const { t } = useTranslation();
	const creator = useAppSelector(creatorSelector);

	const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
	const [isLoadingCount, setIsLoadingCount] = useState<boolean>(true);
	const [serviceAvailable, setServiceAvailable] = useState<boolean>(true);
	const [subject, setSubject] = useState<string>('');
	const [message, setMessage] = useState<string>('');
	const [isSending, setIsSending] = useState<boolean>(false);
	const [success, setSuccess] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	// Fetch subscriber count on mount
	useEffect(() => {
		const fetchSubscriberCount = async () => {
			try {
				setIsLoadingCount(true);
				const functionsUrl = getFunctionsUrl();
				const response = await fetch(
					`${functionsUrl}/getEmailSubscriberCount?statementId=${statement.statementId}`,
				);

				if (!response.ok) {
					// Function not available (e.g., emulator not running)
					console.info('Email notification service not available');
					setServiceAvailable(false);

					return;
				}

				const data: SubscriberCountResponse = await response.json();

				if (data.ok) {
					setSubscriberCount(data.count);
					setServiceAvailable(true);
				}
			} catch (err) {
				// Network error or CORS - service not available
				console.info('Email notification service not reachable:', err);
				setServiceAvailable(false);
			} finally {
				setIsLoadingCount(false);
			}
		};

		fetchSubscriberCount();
	}, [statement.statementId]);

	const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
		e.preventDefault();

		if (!creator?.uid) {
			setError(t('You must be logged in to send notifications'));

			return;
		}

		if (!subject.trim()) {
			setError(t('Please enter a subject'));

			return;
		}

		if (!message.trim()) {
			setError(t('Please enter a message'));

			return;
		}

		if (subscriberCount === 0 || subscriberCount === null) {
			setError(t('No subscribers to send notification to'));

			return;
		}

		setIsSending(true);
		setError(null);
		setSuccess(null);

		try {
			const functionsUrl = getFunctionsUrl();
			const response = await fetch(`${functionsUrl}/sendEmailToSubscribers`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					statementId: statement.statementId,
					subject: subject.trim(),
					message: message.trim(),
					adminId: creator.uid,
					buttonText: t('View Results'),
					buttonUrl: getMassConsensusResultsUrl(statement.statementId),
				}),
			});

			const data: SendEmailResponse = await response.json();

			if (data.ok) {
				setSuccess(`${t('Email sent successfully to')} ${data.sentCount || 0} ${t('subscribers')}`);
				// Clear form after successful send
				setSubject('');
				setMessage('');
			} else {
				setError(data.message || t('Failed to send email'));
			}
		} catch (err) {
			logError(err, {
				operation: 'emailNotifications.sendEmail',
				statementId: statement.statementId,
				userId: creator?.uid,
			});
			setError(t('Failed to send email. Please try again.'));
		} finally {
			setIsSending(false);
		}
	};

	const isFormValid =
		subject.trim().length > 0 &&
		message.trim().length > 0 &&
		subject.length <= MAX_SUBJECT_LENGTH &&
		message.length <= MAX_MESSAGE_LENGTH;

	// Don't render if service is unavailable
	if (!serviceAvailable && !isLoadingCount) {
		return (
			<div className={styles.emailNotifications}>
				<SectionTitle title={t('Email Notifications')} />
				<div className={styles.noSubscribers}>
					<p>{t('Email notification service is currently unavailable')}</p>
					<p className={styles.hint}>
						{t('Please ensure the Firebase Functions are deployed and running')}
					</p>
				</div>
			</div>
		);
	}

	return (
		<div className={styles.emailNotifications}>
			<SectionTitle title={t('Email Notifications')} />

			<div className={styles.header}>
				{isLoadingCount ? (
					<div className={styles.loading}>{t('Loading...')}</div>
				) : (
					<div className={styles.subscriberCount}>
						<span>{t('Email subscribers')}:</span>
						<span className={styles.count}>{subscriberCount ?? 0}</span>
					</div>
				)}
			</div>

			{(subscriberCount === 0 || subscriberCount === null) && !isLoadingCount ? (
				<div className={styles.noSubscribers}>
					<p>{t('No email subscribers yet')}</p>
					<p className={styles.hint}>
						{t(
							'Users can subscribe to email notifications when participating in the mass consensus process',
						)}
					</p>
				</div>
			) : (
				<form className={styles.form} onSubmit={handleSubmit}>
					<div className={styles.formGroup}>
						<label htmlFor="email-subject">{t('Subject')}</label>
						<input
							id="email-subject"
							type="text"
							className={styles.input}
							value={subject}
							onChange={(e) => setSubject(e.target.value)}
							placeholder={t('Enter email subject')}
							maxLength={MAX_SUBJECT_LENGTH}
							disabled={isSending}
						/>
						<span
							className={`${styles.characterCount} ${
								subject.length > MAX_SUBJECT_LENGTH * 0.9 ? styles.warning : ''
							}`}
						>
							{subject.length}/{MAX_SUBJECT_LENGTH}
						</span>
					</div>

					<div className={styles.formGroup}>
						<label htmlFor="email-message">{t('Message')}</label>
						<textarea
							id="email-message"
							className={styles.textarea}
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							placeholder={t('Enter your message to subscribers...')}
							maxLength={MAX_MESSAGE_LENGTH}
							disabled={isSending}
						/>
						<span
							className={`${styles.characterCount} ${
								message.length > MAX_MESSAGE_LENGTH * 0.9 ? styles.warning : ''
							}`}
						>
							{message.length}/{MAX_MESSAGE_LENGTH}
						</span>
					</div>

					{success && (
						<div className={styles.success}>
							<svg
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
							>
								<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
								<polyline points="22 4 12 14.01 9 11.01" />
							</svg>
							{success}
						</div>
					)}

					{error && (
						<div className={styles.error}>
							<svg
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2"
							>
								<circle cx="12" cy="12" r="10" />
								<line x1="15" y1="9" x2="9" y2="15" />
								<line x1="9" y1="9" x2="15" y2="15" />
							</svg>
							{error}
						</div>
					)}

					<div className={styles.actions}>
						<button
							type="submit"
							className={`btn btn--secondary ${!isFormValid || isSending || !subscriberCount ? 'btn--disabled' : ''}`}
							disabled={!isFormValid || isSending || !subscriberCount}
						>
							{isSending
								? t('Sending...')
								: `${t('Send to')} ${subscriberCount ?? 0} ${t('subscribers')}`}
						</button>
					</div>
				</form>
			)}
		</div>
	);
};

export default EmailNotifications;
