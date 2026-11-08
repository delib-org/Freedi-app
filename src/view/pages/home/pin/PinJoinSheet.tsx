import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { Sheet } from '@/view/components/atomic/molecules/Sheet';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import {
	getInvitationPathName,
	getMaxInvitationDigits,
} from '@/controllers/db/invitations/getInvitations';
import { logError } from '@/utils/errorHandling';
import styles from './PinJoinSheet.module.scss';

const DEFAULT_PIN_DIGITS = 6;

interface PinJoinSheetProps {
	isOpen: boolean;
	onClose: () => void;
}

/**
 * "הצטרפות עם קוד" — one numeric field over the existing invitation lookup
 * (the same getInvitationPathName the legacy InvitationModal uses).
 */
export default function PinJoinSheet({ isOpen, onClose }: PinJoinSheetProps) {
	const { t } = useTranslation();
	const navigate = useNavigate();
	const [pin, setPin] = useState('');
	const [digits, setDigits] = useState(DEFAULT_PIN_DIGITS);
	const [error, setError] = useState('');
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		if (!isOpen) return;
		setPin('');
		setError('');
		let cancelled = false;
		getMaxInvitationDigits()
			.then((max) => {
				if (!cancelled && max) setDigits(max);
			})
			.catch((err: unknown) => logError(err, { operation: 'home.PinJoinSheet.getMaxDigits' }));

		return () => {
			cancelled = true;
		};
	}, [isOpen]);

	async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (!pin || busy) return;
		setBusy(true);
		setError('');
		try {
			const pathname = await getInvitationPathName(Number(pin));
			if (!pathname) {
				setError(t("Couldn't find the invitation. Please check the PIN and try again."));

				return;
			}
			onClose();
			navigate(pathname);
		} catch (err) {
			logError(err, { operation: 'home.PinJoinSheet.handleSubmit', metadata: { digits } });
			setError(t("Couldn't find the invitation. Please check the PIN and try again."));
		} finally {
			setBusy(false);
		}
	}

	return (
		<Sheet isOpen={isOpen} onClose={onClose} title={t('Join with a code')} id="pin-join-sheet">
			<form className={styles.pin} onSubmit={handleSubmit}>
				<p className={styles.pin__hint}>
					{t('The host shows a {n}-digit code on the screen.').replace('{n}', String(digits))}
				</p>
				<input
					className={styles.pin__input}
					value={pin}
					onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, digits))}
					inputMode="numeric"
					autoComplete="one-time-code"
					pattern="[0-9]*"
					placeholder={Array.from({ length: digits }, () => '•').join(' ')}
					aria-label={t('Join with PIN number')}
					aria-invalid={!!error || undefined}
					aria-describedby={error ? 'pin-join-error' : undefined}
					data-testid="pin-join-input"
				/>
				{error && (
					<p id="pin-join-error" className={styles.pin__error} role="alert">
						{error}
					</p>
				)}
				<button
					type="submit"
					className={styles.pin__submit}
					disabled={!pin || busy}
					data-testid="pin-join-submit"
				>
					{t('Join')}
				</button>
			</form>
		</Sheet>
	);
}
