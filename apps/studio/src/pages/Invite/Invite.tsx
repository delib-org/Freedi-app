import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from '@freedi/shared-i18n/react';
import { acceptOrgInvite, type AcceptOrgInviteResult } from '@/db/orgFunctions';
import { Button, EmptyState, RoleBadge } from '@/components/atomic/atoms';
import { logError } from '@/utils/logError';
import StudioPage from '../_shared/StudioPage';
import { classifyInviteError, getErrorMessage } from '../_shared/callableErrors';
import styles from './Invite.module.scss';

/** How long the success card stays before the console opens the org. */
export const INVITE_REDIRECT_MS = 1800;

type InviteStatus =
	| { kind: 'pending' }
	| { kind: 'accepted'; result: AcceptOrgInviteResult }
	| { kind: 'error'; message: string };

/**
 * `/invite?token=…` — accepts an organization invitation for the signed-in
 * user (App shows Login first when signed out, keeping the URL intact).
 */
export default function Invite() {
	const { t, tWithParams } = useTranslation();
	const [params] = useSearchParams();
	const navigate = useNavigate();
	const token = params.get('token') ?? '';
	const [status, setStatus] = useState<InviteStatus>({ kind: 'pending' });
	const attemptedToken = useRef<string | null>(null);

	useEffect(() => {
		if (!token) {
			setStatus({ kind: 'error', message: t('This invitation link is invalid.') });

			return;
		}
		if (attemptedToken.current === token) return;
		attemptedToken.current = token;

		acceptOrgInvite({ token })
			.then((result) => setStatus({ kind: 'accepted', result }))
			.catch((error) => {
				logError(error, { operation: 'Invite.accept' });
				const kind = classifyInviteError(error);
				const message =
					kind === 'expired'
						? t('This invitation has expired. Ask for a new one.')
						: kind === 'wrongEmail'
							? t('This invitation was sent to a different email address.')
							: tWithParams('Could not accept the invitation: {{details}}', {
									details: getErrorMessage(error) || t('Unknown error'),
								});
				setStatus({ kind: 'error', message });
			});
	}, [token, t, tWithParams]);

	useEffect(() => {
		if (status.kind !== 'accepted') return;
		const timer = window.setTimeout(
			() => navigate(`/orgs/${status.result.organizationId}`, { replace: true }),
			INVITE_REDIRECT_MS,
		);

		return () => window.clearTimeout(timer);
	}, [status, navigate]);

	return (
		<StudioPage breadcrumb={[{ label: t('Invitation') }]}>
			<div className={styles.center}>
				{status.kind === 'pending' && (
					<EmptyState icon="✉️" title={t('Accepting your invitation…')} compact />
				)}

				{status.kind === 'accepted' && (
					<EmptyState
						icon="🎉"
						title={tWithParams('You have joined {{org}}', {
							org: status.result.organizationName,
						})}
						text={t('Your role in this organization:')}
						action={
							<div className={styles.result}>
								<RoleBadge role={status.result.role} size="large" />
								<Button
									text={t('Open the organization')}
									variant="primary"
									onClick={() =>
										navigate(`/orgs/${status.result.organizationId}`, { replace: true })
									}
								/>
							</div>
						}
					/>
				)}

				{status.kind === 'error' && (
					<EmptyState
						variant="error"
						icon="⚠️"
						title={t('Could not accept the invitation')}
						text={status.message}
						secondary={<Link to="/">{t('Go to your questions')}</Link>}
					/>
				)}
			</div>
		</StudioPage>
	);
}
