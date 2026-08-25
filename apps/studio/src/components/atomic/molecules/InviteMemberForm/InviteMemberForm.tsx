import { useState, type FC } from 'react';
import clsx from 'clsx';
import { OrganizationRole } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { Input } from '@/components/atomic/atoms/Input';
import { SegmentedControl } from '@/components/atomic/atoms/SegmentedControl';
import type { GrantableOrgRole } from '@/db/orgFunctions';
import { logError } from '@/utils/logError';

/**
 * InviteMemberForm Molecule — email + role → invitation link.
 * Styles: styles/organisms/_invite-form.scss (.invite-form)
 */
export interface InviteMemberFormProps {
	onInvite: (email: string, role: GrantableOrgRole) => Promise<{ inviteLink: string }>;
	/** Emails already on the roster or pending — blocked with a hint. */
	existingEmails: string[];
	/** Only owners may grant the owner role. */
	canInviteOwner: boolean;
	busy?: boolean;
	className?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COPIED_FEEDBACK_MS = 2000;

const InviteMemberForm: FC<InviteMemberFormProps> = ({
	onInvite,
	existingEmails,
	canInviteOwner,
	busy = false,
	className,
}) => {
	const { t } = useTranslation();
	const [email, setEmail] = useState('');
	const [role, setRole] = useState<GrantableOrgRole>(OrganizationRole.admin);
	const [touched, setTouched] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [inviteLink, setInviteLink] = useState('');
	const [copied, setCopied] = useState(false);
	const [error, setError] = useState('');

	const normalized = email.trim().toLowerCase();
	const isDuplicate = existingEmails.some((e) => e.toLowerCase() === normalized);
	const isValidEmail = EMAIL_PATTERN.test(normalized);

	const validationMessage = (() => {
		if (!touched || normalized.length === 0) return '';
		if (!isValidEmail) return t('Enter a valid email address');
		if (isDuplicate) return t('Already a member');

		return '';
	})();

	const canSubmit = !busy && !submitting && isValidEmail && !isDuplicate;

	const roleSegments = [
		{ id: OrganizationRole.admin, label: t('Admin') },
		...(canInviteOwner ? [{ id: OrganizationRole.owner, label: t('Owner') }] : []),
	];

	const handleSubmit = async () => {
		setTouched(true);
		if (!canSubmit) return;
		setSubmitting(true);
		setError('');
		try {
			const result = await onInvite(normalized, role);
			setInviteLink(result.inviteLink);
			setEmail('');
			setTouched(false);
		} catch (err) {
			logError(err, { operation: 'InviteMemberForm.invite', metadata: { role } });
			setError(t('Could not send the invitation. Please try again.'));
		} finally {
			setSubmitting(false);
		}
	};

	const handleCopy = async () => {
		try {
			await navigator.clipboard.writeText(inviteLink);
			setCopied(true);
			window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
		} catch (err) {
			logError(err, { operation: 'InviteMemberForm.copyLink' });
		}
	};

	return (
		<form
			className={clsx('invite-form', className)}
			onSubmit={(event) => {
				event.preventDefault();
				void handleSubmit();
			}}
		>
			<div className="invite-form__email">
				<Input
					type="email"
					label={t('Email')}
					value={email}
					onChange={setEmail}
					onBlur={() => setTouched(true)}
					placeholder="name@example.com"
					state={validationMessage ? 'error' : 'default'}
					errorText={validationMessage || undefined}
					disabled={busy || submitting}
					required
					fullWidth
				/>
			</div>

			<div className="invite-form__role">
				<span className="invite-form__label">{t('Role')}</span>
				<SegmentedControl
					segments={roleSegments}
					activeId={role}
					onChange={(id) => setRole(id as GrantableOrgRole)}
				/>
			</div>

			<div className="invite-form__submit">
				<Button
					type="submit"
					variant="primary"
					text={t('Send invite')}
					disabled={!canSubmit}
					loading={submitting}
				/>
			</div>

			{error && (
				<p className="invite-form__error" role="alert">
					{error}
				</p>
			)}

			{inviteLink && (
				<div className="invite-form__result" role="status">
					<p className="invite-form__result-title">{t('Invitation sent')}</p>
					<p className="invite-form__hint">{t('You can also share this link directly:')}</p>
					<div className="invite-form__link-row">
						<code className="invite-form__link" dir="ltr">
							{inviteLink}
						</code>
						<Button
							type="button"
							variant="secondary"
							size="small"
							text={copied ? t('Copied') : t('Copy link')}
							onClick={handleCopy}
						/>
					</div>
				</div>
			)}
		</form>
	);
};

export default InviteMemberForm;
