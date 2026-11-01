import type { RefObject } from 'react';
import {
	FEEDBACK_FAILURE_KEY,
	FEEDBACK_MAILTO,
	ODYSSEY_FEEDBACK_MESSAGE_MAX,
	type FeedbackFailure,
} from '../lib/feedback';
import { formatNumber } from '../i18n/i18n';
import { useT } from '../i18n/useT';

export type LetterStatus = 'idle' | 'sending' | 'sent';

export interface LetterDraft {
	message: string;
	email: string;
}

interface FeedbackLetterProps {
	titleId: string;
	draft: LetterDraft;
	onDraftChange: (draft: LetterDraft) => void;
	textareaRef: RefObject<HTMLTextAreaElement>;
	emailRef: RefObject<HTMLInputElement>;
	headingRef: RefObject<HTMLParagraphElement>;
	status: LetterStatus;
	failure: FeedbackFailure | null;
	/** Whether the address was prefilled from a signed-in Google account. */
	prefilled: boolean;
	/** The address the letter actually went out with, once sent. */
	sentTo: string;
	onSubmit: () => void;
	onClose: () => void;
	onWriteAnother: () => void;
}

/** Show the counter only once the length is worth thinking about. */
const COUNTER_FROM = 3000;

/**
 * The letter itself. Presentation only — it touches no Firebase and owns no
 * draft, so closing the dialog cannot lose what someone typed.
 */
export default function FeedbackLetter({
	titleId,
	draft,
	onDraftChange,
	textareaRef,
	emailRef,
	headingRef,
	status,
	failure,
	prefilled,
	sentTo,
	onSubmit,
	onClose,
	onWriteAnother,
}: FeedbackLetterProps) {
	const { t } = useT();
	const busy = status === 'sending';
	const canSend = draft.message.trim().length > 0 && !busy;

	return (
		<div className="panel flex flex-col gap-3" data-testid="feedback-letter">
			<div className="flex items-center gap-2">
				<strong id={titleId} className="text-[15px] text-[var(--cream)]">
					{t('feedback.title')}
				</strong>
				<button
					type="button"
					className="ms-auto text-[13px] opacity-70 hover:opacity-100"
					onClick={onClose}
					aria-label={t('common.close')}
				>
					✕
				</button>
			</div>

			{status === 'sent' ? (
				<>
					<p ref={headingRef} tabIndex={-1} className="m-0 text-[15px] text-[var(--gold-strong)]">
						{t('feedback.sent')}
					</p>
					<p className="m-0 text-[13px] opacity-85">
						{sentTo
							? t('feedback.thanksWithEmail', { email: sentTo })
							: t('feedback.thanksNoEmail')}
					</p>
					<div className="flex items-center gap-3">
						<button type="button" className="btn-outline" onClick={onClose}>
							{t('feedback.backToVoyage')}
						</button>
						<button
							type="button"
							className="text-[13px] underline opacity-80 hover:opacity-100"
							onClick={onWriteAnother}
						>
							{t('feedback.writeAnother')}
						</button>
					</div>
				</>
			) : (
				<>
					<p className="m-0 text-[13px] opacity-80">{t('feedback.intro')}</p>

					<div>
						<label className="block mb-1 text-[13px]" htmlFor="feedback-message">
							{t('feedback.messageLabel')}
						</label>
						<textarea
							id="feedback-message"
							ref={textareaRef}
							rows={5}
							maxLength={ODYSSEY_FEEDBACK_MESSAGE_MAX}
							disabled={busy}
							value={draft.message}
							aria-invalid={failure === 'tooShort' || failure === 'tooLong'}
							placeholder={t('feedback.messagePlaceholder')}
							onChange={(event) => onDraftChange({ ...draft, message: event.target.value })}
						/>
						{draft.message.length >= COUNTER_FROM ? (
							<p className="m-0 mt-1 text-[12px] opacity-60">
								{formatNumber(draft.message.length)} / {formatNumber(ODYSSEY_FEEDBACK_MESSAGE_MAX)}
							</p>
						) : null}
					</div>

					<div>
						<label className="block mb-1 text-[13px]" htmlFor="feedback-email">
							{t('feedback.emailLabel')}
						</label>
						<input
							id="feedback-email"
							ref={emailRef}
							type="email"
							dir="ltr"
							disabled={busy}
							value={draft.email}
							aria-invalid={failure === 'badEmail'}
							onChange={(event) => onDraftChange({ ...draft, email: event.target.value })}
						/>
						<p className="m-0 mt-1 text-[13px] opacity-80">
							{prefilled ? t('feedback.emailPrefilled') : t('feedback.emailNote')}
						</p>
					</div>

					{/* "Silently attached" means not a form field — not undisclosed.
					    A hidden attachment someone discovers later in a reply is the
					    kind of surprise that closes tabs in a political app. */}
					<p className="m-0 text-[13px] opacity-70">{t('feedback.diagnostics')}</p>

					<div className="flex flex-wrap items-center gap-3">
						<button type="button" className="btn" disabled={!canSend} onClick={onSubmit}>
							{busy ? t('feedback.sending') : t('feedback.send')}
						</button>
						<span
							role="status"
							aria-live="polite"
							className="text-[13px] text-[var(--gold-strong)]"
						>
							{failure ? t(FEEDBACK_FAILURE_KEY[failure]) : ''}
						</span>
					</div>

					{failure === 'failed' ? (
						<p className="m-0 text-[13px] opacity-75">
							{t('feedback.alsoA')}{' '}
							<a className="underline" href={FEEDBACK_MAILTO}>
								{t('feedback.mailLink')}
							</a>
							{t('feedback.alsoB')}
						</p>
					) : null}
				</>
			)}
		</div>
	);
}
