import { useId, useState, type FC } from 'react';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { studioPlanRate } from '@/db/orgFunctions';
import { logError } from '@/utils/logError';

/**
 * PlanRatingCard — one-time "How was the AI plan?" after a build
 * (`?rate=<sessionId>` on the dashboard). Remembered per session in
 * localStorage so it never asks twice. Styles: styles/molecules/_plan-rating.scss
 */
export interface PlanRatingCardProps {
	sessionId: string;
	/** Called once the card should disappear (rated, skipped or already rated). */
	onDone: () => void;
	className?: string;
}

type RatingValue = 'up' | 'down';

const NOTE_MAX = 500;
const THANKS_VISIBLE_MS = 1800;

export function planRatingStorageKey(sessionId: string): string {
	return `studio-plan-rated-${sessionId}`;
}

export function hasRatedPlan(sessionId: string): boolean {
	try {
		return window.localStorage.getItem(planRatingStorageKey(sessionId)) !== null;
	} catch {
		return false;
	}
}

function rememberRated(sessionId: string): void {
	try {
		window.localStorage.setItem(planRatingStorageKey(sessionId), String(Date.now()));
	} catch (error) {
		logError(error, { operation: 'PlanRatingCard.remember', metadata: { sessionId } });
	}
}

const PlanRatingCard: FC<PlanRatingCardProps> = ({ sessionId, onDone, className }) => {
	const { t } = useTranslation();
	const noteId = useId();
	const [value, setValue] = useState<RatingValue | null>(null);
	const [note, setNote] = useState('');
	const [sending, setSending] = useState(false);
	const [sent, setSent] = useState(false);
	const [error, setError] = useState('');

	const submit = async (withNote: boolean) => {
		if (!value || sending) return;
		setSending(true);
		setError('');
		try {
			const trimmed = note.trim();
			await studioPlanRate({
				sessionId,
				value,
				note: withNote && trimmed ? trimmed : undefined,
			});
			rememberRated(sessionId);
			setSent(true);
			window.setTimeout(onDone, THANKS_VISIBLE_MS);
		} catch (err) {
			logError(err, { operation: 'PlanRatingCard.rate', metadata: { sessionId, value } });
			setError(t('Could not send your feedback. Please try again.'));
		} finally {
			setSending(false);
		}
	};

	if (sent) {
		return (
			<section className={`plan-rating ${className ?? ''}`} role="status">
				<p className="plan-rating__thanks">{t('Thanks for your feedback')}</p>
			</section>
		);
	}

	return (
		<section className={`plan-rating ${className ?? ''}`} aria-label={t('How was the AI plan?')}>
			<h2 className="plan-rating__title">{t('How was the AI plan?')}</h2>
			<div className="plan-rating__choices" role="group" aria-label={t('How was the AI plan?')}>
				<button
					type="button"
					className="plan-rating__choice"
					aria-pressed={value === 'up'}
					onClick={() => setValue('up')}
				>
					<span aria-hidden="true">👍</span> {t('Helpful')}
				</button>
				<button
					type="button"
					className="plan-rating__choice"
					aria-pressed={value === 'down'}
					onClick={() => setValue('down')}
				>
					<span aria-hidden="true">👎</span> {t('Not helpful')}
				</button>
			</div>

			{value && (
				<>
					<label htmlFor={noteId} className="input__label">
						{t('Note (optional)')}
					</label>
					<textarea
						id={noteId}
						className="plan-rating__note"
						rows={2}
						maxLength={NOTE_MAX}
						value={note}
						dir="auto"
						placeholder={t('What worked, what did not?')}
						onChange={(event) => setNote(event.target.value)}
					/>
					{error && (
						<p className="plan-rating__error" role="alert">
							{error}
						</p>
					)}
					<div className="plan-rating__footer">
						<Button
							text={t('Send')}
							variant="primary"
							size="small"
							loading={sending}
							onClick={() => void submit(true)}
						/>
						<Button
							text={t('Skip the note')}
							variant="secondary"
							size="small"
							disabled={sending}
							onClick={() => void submit(false)}
						/>
					</div>
				</>
			)}

			{!value && (
				<div className="plan-rating__footer">
					<Button
						text={t('Not now')}
						variant="secondary"
						size="small"
						onClick={() => {
							rememberRated(sessionId);
							onDone();
						}}
					/>
				</div>
			)}
		</section>
	);
};

export default PlanRatingCard;
