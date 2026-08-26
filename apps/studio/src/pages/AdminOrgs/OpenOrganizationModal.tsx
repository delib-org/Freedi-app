import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button, Input } from '@/components/atomic/atoms';
import { createOrganization, type CreateOrganizationResult } from '@/db/orgFunctions';
import { logError } from '@/utils/logError';
import SimpleModal from '../_shared/SimpleModal';
import styles from './AdminOrgs.module.scss';

interface OpenOrganizationModalProps {
	onClose: () => void;
	onCreated?: (organizationId: string) => void;
}

type OrgLanguage = 'he' | 'en';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COPIED_FEEDBACK_MS = 2000;

/** System-admin dialog: create an organization and invite its first owner. */
export default function OpenOrganizationModal({ onClose, onCreated }: OpenOrganizationModalProps) {
	const { t } = useTranslation();
	const focusRef = useRef<HTMLDivElement>(null);
	const [name, setName] = useState('');
	const [email, setEmail] = useState('');
	const [language, setLanguage] = useState<OrgLanguage>('he');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState('');
	const [result, setResult] = useState<(CreateOrganizationResult & { name: string }) | null>(null);
	const [copied, setCopied] = useState(false);

	const normalizedEmail = email.trim().toLowerCase();
	const canSubmit = name.trim().length > 0 && EMAIL_PATTERN.test(normalizedEmail) && !submitting;

	const handleCreate = async () => {
		if (!canSubmit) return;
		setSubmitting(true);
		setError('');
		try {
			const created = await createOrganization({
				name: name.trim(),
				ownerEmail: normalizedEmail,
				defaultLanguage: language,
			});
			setResult({ ...created, name: name.trim() });
			onCreated?.(created.organizationId);
		} catch (err) {
			logError(err, { operation: 'OpenOrganizationModal.create' });
			setError(t('Could not create the organization. Please try again.'));
		} finally {
			setSubmitting(false);
		}
	};

	const handleCopy = async () => {
		if (!result?.inviteLink) return;
		try {
			await navigator.clipboard.writeText(result.inviteLink);
			setCopied(true);
			window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
		} catch (err) {
			logError(err, { operation: 'OpenOrganizationModal.copyLink' });
		}
	};

	if (result) {
		return (
			<SimpleModal
				title={t('Organization created')}
				onClose={onClose}
				size="medium"
				footer={<Button text={t('Done')} variant="secondary" onClick={onClose} />}
			>
				<div className={styles.form}>
					<p className={styles.info}>
						{result.inviteLink
							? t('We emailed the invitation. You can also share this link directly:')
							: t('The owner already has an account and was added to the organization.')}
					</p>
					{result.inviteLink && (
						<div className={styles.linkRow}>
							<code className={styles.link} dir="ltr">
								{result.inviteLink}
							</code>
							<Button
								text={copied ? t('Copied') : t('Copy link')}
								variant="secondary"
								size="small"
								onClick={handleCopy}
							/>
						</div>
					)}
					<Link to={`/orgs/${result.organizationId}`} className="button button--primary">
						{t('Enter this organization')}
					</Link>
				</div>
			</SimpleModal>
		);
	}

	return (
		<SimpleModal
			title={t('Open organization')}
			onClose={onClose}
			busy={submitting}
			size="medium"
			initialFocusRef={focusRef}
			footer={
				<>
					<Button text={t('Cancel')} variant="secondary" disabled={submitting} onClick={onClose} />
					<Button
						text={t('Open organization')}
						variant="primary"
						disabled={!canSubmit}
						loading={submitting}
						onClick={handleCreate}
					/>
				</>
			}
		>
			<form
				className={styles.form}
				onSubmit={(event) => {
					event.preventDefault();
					void handleCreate();
				}}
			>
				<div ref={focusRef} tabIndex={-1} className={styles.field}>
					<Input
						label={t('Organization name')}
						value={name}
						onChange={setName}
						required
						fullWidth
						autoFocus
						disabled={submitting}
					/>
				</div>
				<Input
					type="email"
					label={t("First admin's email")}
					value={email}
					onChange={setEmail}
					placeholder="name@example.com"
					required
					fullWidth
					disabled={submitting}
				/>
				<fieldset className={styles.fieldset} disabled={submitting}>
					<legend className={styles.legend}>{t('Language')}</legend>
					<label className={styles.radio}>
						<input
							type="radio"
							name="org-language"
							value="he"
							checked={language === 'he'}
							onChange={() => setLanguage('he')}
						/>
						<span>עברית</span>
					</label>
					<label className={styles.radio}>
						<input
							type="radio"
							name="org-language"
							value="en"
							checked={language === 'en'}
							onChange={() => setLanguage('en')}
						/>
						<span>English</span>
					</label>
				</fieldset>
				<p className={styles.info}>
					{t("We'll email an invitation. They become Owner when they sign in.")}
				</p>
				{error && (
					<p className={styles.error} role="alert">
						{error}
					</p>
				)}
			</form>
		</SimpleModal>
	);
}
