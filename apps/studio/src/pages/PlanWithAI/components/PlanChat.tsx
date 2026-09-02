import {
	useEffect,
	useId,
	useRef,
	useState,
	type FC,
	type FormEvent,
	type KeyboardEvent,
	type UIEvent,
} from 'react';
import clsx from 'clsx';
import { STUDIO_PLAN_MAX_MESSAGE_CHARS, type StudioPlanMessage } from '@freedi/shared-types';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { STILL_WORKING_AFTER_MS, type PlanPhase } from '../planTypes';

/**
 * PlanChat — the conversation with the AI consultant.
 * Styles: styles/organisms/_plan-chat.scss (.plan-chat)
 *
 * The log is a polite live region; bubbles carry `dir="auto"` so Hebrew and
 * English turns each read the right way. Enter sends, Shift+Enter breaks a
 * line, and an IME composition never sends by accident.
 */
export interface DraftSeed {
	text: string;
	/** Bump to re-apply the same text. */
	key: number;
}

export interface PlanChatProps {
	messages: StudioPlanMessage[];
	phase: PlanPhase;
	waitingSince: number | null;
	failedMessage: string | null;
	error: string | null;
	/** Text to place in the composer (e.g. "Change \"…\": "). */
	draftSeed?: DraftSeed | null;
	onSend: (text: string) => void;
	onRetry: () => void;
	className?: string;
}

const NEAR_BOTTOM_PX = 48;
const MAX_ROWS = 6;

function rowsFor(text: string): number {
	return Math.min(MAX_ROWS, Math.max(1, text.split('\n').length));
}

const PlanChat: FC<PlanChatProps> = ({
	messages,
	phase,
	waitingSince,
	failedMessage,
	error,
	draftSeed,
	onSend,
	onRetry,
	className,
}) => {
	const { t } = useTranslation();
	const composerId = useId();
	const logRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const nearBottomRef = useRef(true);
	const wasDisabledRef = useRef(false);

	const [draft, setDraft] = useState('');
	const [showJump, setShowJump] = useState(false);
	const [stillWorking, setStillWorking] = useState(false);

	const typing = phase === 'starting' || phase === 'waiting';
	const disabled = phase !== 'chatting';
	const canSend = !disabled && draft.trim().length > 0;

	// "Still working…" after a long turn.
	useEffect(() => {
		setStillWorking(false);
		if (waitingSince === null) return;
		const elapsed = Date.now() - waitingSince;
		const timer = window.setTimeout(
			() => setStillWorking(true),
			Math.max(0, STILL_WORKING_AFTER_MS - elapsed),
		);

		return () => window.clearTimeout(timer);
	}, [waitingSince]);

	// Keep the newest turn in view unless the reader scrolled up.
	useEffect(() => {
		const log = logRef.current;
		if (!log) return;
		if (nearBottomRef.current) {
			log.scrollTop = log.scrollHeight;
			setShowJump(false);
		} else if (messages.length > 0) {
			setShowJump(true);
		}
	}, [messages.length, typing]);

	// Give focus back to the composer once a turn completes.
	useEffect(() => {
		if (!disabled && wasDisabledRef.current) textareaRef.current?.focus();
		wasDisabledRef.current = disabled;
	}, [disabled]);

	// "Ask to change" prefill.
	useEffect(() => {
		if (!draftSeed) return;
		setDraft(draftSeed.text);
		const field = textareaRef.current;
		if (field) {
			field.focus();
			window.setTimeout(() => field.setSelectionRange(field.value.length, field.value.length), 0);
		}
	}, [draftSeed]);

	const handleScroll = (event: UIEvent<HTMLDivElement>) => {
		const el = event.currentTarget;
		const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_PX;
		nearBottomRef.current = nearBottom;
		if (nearBottom) setShowJump(false);
	};

	const jumpToLatest = () => {
		const log = logRef.current;
		if (log) log.scrollTop = log.scrollHeight;
		nearBottomRef.current = true;
		setShowJump(false);
	};

	const submit = () => {
		if (!canSend) return;
		onSend(draft.trim());
		setDraft('');
		nearBottomRef.current = true;
	};

	const handleSubmit = (event: FormEvent) => {
		event.preventDefault();
		submit();
	};

	const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
		if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
		event.preventDefault();
		submit();
	};

	return (
		<div className={clsx('plan-chat', className)}>
			<div className="plan-chat__scroll">
				<div
					ref={logRef}
					className="plan-chat__log"
					role="log"
					aria-live="polite"
					aria-relevant="additions"
					aria-label={t('Conversation with the consultant')}
					onScroll={handleScroll}
				>
					{messages.map((message, index) => (
						<div
							key={`${message.createdAt}-${index}`}
							className={clsx('plan-chat__bubble', `plan-chat__bubble--${message.role}`)}
						>
							<span className="visually-hidden">
								{message.role === 'user' ? t('You') : t('Consultant')}:{' '}
							</span>
							<p className="plan-chat__text" dir="auto">
								{message.content}
							</p>
						</div>
					))}

					{typing && (
						<div className="plan-chat__bubble plan-chat__bubble--assistant" role="status">
							<span className="plan-chat__dots" aria-hidden="true">
								<span />
								<span />
								<span />
							</span>
							<span className="plan-chat__typing">
								{stillWorking ? t('Still working…') : t('The consultant is thinking…')}
							</span>
						</div>
					)}
				</div>

				{showJump && (
					<button type="button" className="plan-chat__jump" onClick={jumpToLatest}>
						{t('New reply')} ↓
					</button>
				)}
			</div>

			{failedMessage !== null && error && (
				<div className="plan-chat__error" role="alert">
					<span>{error}</span>
					<Button text={t('Retry')} variant="secondary" size="small" onClick={onRetry} />
				</div>
			)}

			<form className="plan-chat__composer" onSubmit={handleSubmit}>
				<label htmlFor={composerId} className="visually-hidden">
					{t('Message to the consultant')}
				</label>
				<textarea
					ref={textareaRef}
					id={composerId}
					className="plan-chat__input"
					value={draft}
					rows={rowsFor(draft)}
					maxLength={STUDIO_PLAN_MAX_MESSAGE_CHARS}
					placeholder={t('Describe the challenge in your own words…')}
					disabled={disabled}
					dir="auto"
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={handleKeyDown}
				/>
				<Button type="submit" text={t('Send')} variant="primary" disabled={!canSend} />
				<p className="plan-chat__hint">{t('Enter to send · Shift+Enter for a new line')}</p>
			</form>
		</div>
	);
};

export default PlanChat;
