import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useUser } from '../lib/user';
import { useDialogMechanics } from '../lib/dialogMechanics';
import {
	ODYSSEY_FEEDBACK_MESSAGE_MAX,
	ODYSSEY_FEEDBACK_MESSAGE_MIN,
	isPlausibleEmail,
	submitFeedback,
	toFeedbackFailure,
	type FeedbackFailure,
} from '../lib/feedback';
import FeedbackLetter, { type LetterDraft, type LetterStatus } from './FeedbackLetter';

const EMPTY_DRAFT: LetterDraft = { message: '', email: '' };

/**
 * The always-present way to write to the people who built the game.
 *
 * Mounted once in App.tsx rather than in GameChrome, for four reasons: it must
 * appear on the intro and privacy screens, where the top bar's buttons are
 * hidden behind a signed-in check; it sits outside `.page`, so that file's
 * pointer-events rules never apply to it; it survives navigation, so a draft
 * typed on one screen is still there on the next; and a bottom-corner button
 * inside a <nav> would be semantically wrong.
 *
 * The draft lives HERE, not in the letter, so closing the dialog — by ✕, by
 * Escape, or by clicking the scrim — never loses what someone typed. It is kept
 * in memory only: this is a pre-election political app, and an unsent complaint
 * is not something to leave behind in localStorage.
 */
export default function FeedbackDock() {
	const { user } = useUser();
	const [open, setOpen] = useState(false);
	const [draft, setDraft] = useState<LetterDraft>(EMPTY_DRAFT);
	const [status, setStatus] = useState<LetterStatus>('idle');
	const [failure, setFailure] = useState<FeedbackFailure | null>(null);
	const [sentTo, setSentTo] = useState('');
	const [prefilled, setPrefilled] = useState(false);

	const panelRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const emailRef = useRef<HTMLInputElement>(null);
	const headingRef = useRef<HTMLParagraphElement>(null);
	const titleId = useId();

	useDialogMechanics({
		isOpen: open,
		onClose: () => setOpen(false),
		panelRef,
		initialFocusRef: textareaRef,
	});

	// A signed-in player already told us their address once; asking again is
	// friction. An anonymous sailor has none, and gets an empty field.
	useEffect(() => {
		if (!open) return;
		const address = user && !user.isAnonymous ? (user.email ?? '') : '';
		if (!address) return;
		setDraft((current) => (current.email ? current : { ...current, email: address }));
		setPrefilled(true);
	}, [open, user]);

	// The confirmation is the whole point of the send; move focus to it so it is
	// announced rather than silently replacing the form.
	useEffect(() => {
		if (status === 'sent') headingRef.current?.focus();
	}, [status]);

	async function send(): Promise<void> {
		const message = draft.message.trim();
		const email = draft.email.trim();

		if (message.length < ODYSSEY_FEEDBACK_MESSAGE_MIN) {
			setFailure('tooShort');
			textareaRef.current?.focus();

			return;
		}
		if (message.length > ODYSSEY_FEEDBACK_MESSAGE_MAX) {
			setFailure('tooLong');
			textareaRef.current?.focus();

			return;
		}
		if (email && !isPlausibleEmail(email)) {
			setFailure('badEmail');
			emailRef.current?.focus();

			return;
		}

		setFailure(null);
		setStatus('sending');
		try {
			await submitFeedback({ message, email: email || undefined });
			// Deliberately not branching on `emailed`: the letter is stored either
			// way, and telling someone it failed when we hold it would only make
			// them write it again.
			setSentTo(email);
			setDraft(EMPTY_DRAFT);
			setStatus('sent');
		} catch (error) {
			console.error('[Odyssey] sending feedback failed:', error);
			setFailure(toFeedbackFailure(error));
			setStatus('idle');
		}
	}

	function close(): void {
		setOpen(false);
		setFailure(null);
		if (status === 'sent') setStatus('idle');
	}

	return (
		<>
			<button
				type="button"
				className="letter-dock"
				aria-haspopup="dialog"
				aria-expanded={open}
				title="מכתב לבוני הספינה"
				aria-label="מכתב לבוני הספינה"
				onClick={() => setOpen(true)}
			>
				<span className="letter-dock__icon" aria-hidden="true">
					🪶
				</span>
				<span className="letter-dock__label">מכתב לבוני הספינה</span>
			</button>

			{/* Through a portal: useDialogMechanics marks #root inert, which would
			    otherwise inert this dialog along with everything else. */}
			{open
				? createPortal(
						<div
							className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 pt-16"
							dir="rtl"
							onClick={(event) => {
								if (event.target === event.currentTarget) close();
							}}
						>
							<div
								ref={panelRef}
								role="dialog"
								aria-modal="true"
								aria-labelledby={titleId}
								className="w-full max-w-md"
							>
								<FeedbackLetter
									titleId={titleId}
									draft={draft}
									onDraftChange={(next) => {
										setDraft(next);
										setFailure(null);
									}}
									textareaRef={textareaRef}
									emailRef={emailRef}
									headingRef={headingRef}
									status={status}
									failure={failure}
									prefilled={prefilled}
									sentTo={sentTo}
									onSubmit={() => void send()}
									onClose={close}
									onWriteAnother={() => {
										setStatus('idle');
										setFailure(null);
										textareaRef.current?.focus();
									}}
								/>
							</div>
						</div>,
						document.body,
					)
				: null}
		</>
	);
}
