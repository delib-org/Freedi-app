import type { RefObject } from 'react';
import {
	FEEDBACK_FAILURE_TEXT,
	FEEDBACK_MAILTO,
	ODYSSEY_FEEDBACK_MESSAGE_MAX,
	type FeedbackFailure,
} from '../lib/feedback';

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
	const busy = status === 'sending';
	const canSend = draft.message.trim().length > 0 && !busy;

	return (
		<div className="panel flex flex-col gap-3" data-testid="feedback-letter">
			<div className="flex items-center gap-2">
				<strong id={titleId} className="text-[15px] text-[var(--cream)]">
					🪶 מכתב לבוני הספינה
				</strong>
				<button
					type="button"
					className="mr-auto text-[13px] opacity-70 hover:opacity-100"
					onClick={onClose}
					aria-label="סגירה"
				>
					✕
				</button>
			</div>

			{status === 'sent' ? (
				<>
					<p ref={headingRef} tabIndex={-1} className="m-0 text-[15px] text-[var(--gold-strong)]">
						המכתב יצא לדרך ⛵
					</p>
					<p className="m-0 text-[13px] opacity-85">
						{sentTo
							? `תודה. אם יהיה לנו מה לענות, נכתוב אל ${sentTo}.`
							: 'תודה. כתבתם בלי כתובת, אז לא נוכל לענות — אבל המכתב הגיע אלינו.'}
					</p>
					<div className="flex items-center gap-3">
						<button type="button" className="btn-outline" onClick={onClose}>
							חזרה למסע
						</button>
						<button
							type="button"
							className="text-[13px] underline opacity-80 hover:opacity-100"
							onClick={onWriteAnother}
						>
							לכתוב עוד מכתב
						</button>
					</div>
				</>
			) : (
				<>
					<p className="m-0 text-[13px] opacity-80">
						משהו נשבר, משהו לא ברור, או רעיון לשיפור — ספרו לנו. אנחנו, הצוות שבונה את המשחק, קוראים
						כל מכתב.
					</p>

					<div>
						<label className="block mb-1 text-[13px]" htmlFor="feedback-message">
							מה תרצו לספר לנו?
						</label>
						<textarea
							id="feedback-message"
							ref={textareaRef}
							rows={5}
							maxLength={ODYSSEY_FEEDBACK_MESSAGE_MAX}
							disabled={busy}
							value={draft.message}
							aria-invalid={failure === 'tooShort' || failure === 'tooLong'}
							placeholder="למשל: הכפתור לא הגיב, השאלה הזאת לא הייתה ברורה, חסר אי במפה…"
							onChange={(event) => onDraftChange({ ...draft, message: event.target.value })}
						/>
						{draft.message.length >= COUNTER_FROM ? (
							<p className="m-0 mt-1 text-[12px] opacity-60">
								{draft.message.length.toLocaleString('he-IL')} /{' '}
								{ODYSSEY_FEEDBACK_MESSAGE_MAX.toLocaleString('he-IL')}
							</p>
						) : null}
					</div>

					<div>
						<label className="block mb-1 text-[13px]" htmlFor="feedback-email">
							מייל למענה — לא חובה
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
							{prefilled
								? 'זו הכתובת שנכנסתם איתה. אפשר למחוק אותה — אז לא נוכל לענות, אבל המכתב יגיע.'
								: 'נשתמש בכתובת רק כדי לענות על המכתב הזה. היא לא מצורפת לתשובות שלכם במסע, לא נשמרת איתן ולא נמסרת לאיש.'}
						</p>
					</div>

					{/* "Silently attached" means not a form field — not undisclosed.
					    A hidden attachment someone discovers later in a reply is the
					    kind of surprise that closes tabs in a political app. */}
					<p className="m-0 text-[13px] opacity-70">
						למכתב מצורפים פרטים טכניים — המסך שבו הייתם, הדפדפן, גודל החלון ומזהה המשתמש — כדי שנוכל
						לשחזר תקלה. תשובות מהמסע לא מצורפות.
					</p>

					<div className="flex flex-wrap items-center gap-3">
						<button type="button" className="btn" disabled={!canSend} onClick={onSubmit}>
							{busy ? 'שולחים…' : 'לשלוח את המכתב'}
						</button>
						<span
							role="status"
							aria-live="polite"
							className="text-[13px] text-[var(--gold-strong)]"
						>
							{failure ? FEEDBACK_FAILURE_TEXT[failure] : ''}
						</span>
					</div>

					{failure === 'failed' ? (
						<p className="m-0 text-[13px] opacity-75">
							אפשר גם{' '}
							<a className="underline" href={FEEDBACK_MAILTO}>
								לכתוב לנו ישירות במייל
							</a>
							.
						</p>
					) : null}
				</>
			)}
		</div>
	);
}
