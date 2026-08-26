import { useId, useState, type FC } from 'react';
import clsx from 'clsx';
import { useTranslation } from '@freedi/shared-i18n/react';
import { Button } from '@/components/atomic/atoms/Button';
import { Checkbox } from '@/components/atomic/atoms/Checkbox';
import { SegmentedControl } from '@/components/atomic/atoms/SegmentedControl';
import type { NudgeAudience, NudgeChannel } from '@/db/orgFunctions';
import { formatRelativeTime, DAY_MS } from '@/utils/relativeTime';
import { logError } from '@/utils/logError';

/**
 * NudgeComposer Molecule — write a short update to a question's participants.
 * Styles: styles/organisms/_nudge-composer.scss (.nudge-composer)
 *
 * Copy is deliberately non-guilting (invitations, not reminders of failure);
 * a recent send shows a cooldown note but never blocks.
 */
export interface NudgePayload {
	message: string;
	audience: NudgeAudience;
	channels: NudgeChannel[];
}

export interface NudgeComposerProps {
	/** People per audience — drives the segment counts and the send button. */
	counts: Record<NudgeAudience, number>;
	/** Epoch-ms of the last nudge; within 24h a cooldown strip is shown. */
	lastNudgeAt?: number;
	/** Whether the email channel is offered at all. */
	emailEnabled: boolean;
	/** Render without card chrome (inside the drawer). */
	inline?: boolean;
	onSend: (payload: NudgePayload) => Promise<void>;
	onCancel: () => void;
	className?: string;
}

export const NUDGE_MESSAGE_MAX = 280;

const NudgeComposer: FC<NudgeComposerProps> = ({
	counts,
	lastNudgeAt,
	emailEnabled,
	inline = false,
	onSend,
	onCancel,
	className,
}) => {
	const { t, tWithParams, currentLanguage } = useTranslation();
	const messageId = useId();
	const [audience, setAudience] = useState<NudgeAudience>('all');
	const [message, setMessage] = useState('');
	const [inApp, setInApp] = useState(true);
	const [email, setEmail] = useState(false);
	const [sending, setSending] = useState(false);
	const [sent, setSent] = useState(false);
	const [error, setError] = useState('');

	const audienceSegments = [
		{ id: 'all', label: t('Everyone who joined'), count: counts.all },
		{ id: 'notSuggested', label: t("Joined but haven't participated"), count: counts.notSuggested },
		{ id: 'notEvaluated', label: t('Participated'), count: counts.notEvaluated },
	];

	const templates = [
		t('Share your idea'),
		t('Rate what others suggested'),
		t('Last day to take part'),
	];

	const channels: NudgeChannel[] = [
		...(inApp ? (['inApp'] as const) : []),
		...(email && emailEnabled ? (['email'] as const) : []),
	];
	const recipientCount = counts[audience];
	const trimmed = message.trim();
	const canSend = !sending && trimmed.length > 0 && channels.length > 0 && recipientCount > 0;

	const now = Date.now();
	const inCooldown = lastNudgeAt !== undefined && now - lastNudgeAt < DAY_MS;

	const handleSend = async () => {
		if (!canSend) return;
		setSending(true);
		setError('');
		try {
			await onSend({ message: trimmed, audience, channels });
			setSent(true);
		} catch (err) {
			logError(err, {
				operation: 'NudgeComposer.send',
				metadata: { audience, channels, length: trimmed.length },
			});
			setError(t('Could not send the update. Please try again.'));
		} finally {
			setSending(false);
		}
	};

	const rootClasses = clsx(
		'nudge-composer',
		inline && 'nudge-composer--inline',
		sent && 'nudge-composer--sent',
		className,
	);

	if (sent) {
		return (
			<div className={rootClasses} role="status">
				<p className="nudge-composer__success">
					{tWithParams('Update sent to {{count}} people', { count: recipientCount })}
				</p>
			</div>
		);
	}

	return (
		<form
			className={rootClasses}
			onSubmit={(event) => {
				event.preventDefault();
				void handleSend();
			}}
		>
			<div className="nudge-composer__audience">
				<span className="nudge-composer__label">{t('Send to')}</span>
				<SegmentedControl
					segments={audienceSegments}
					activeId={audience}
					onChange={(id) => setAudience(id as NudgeAudience)}
				/>
			</div>

			<div className="nudge-composer__templates" aria-label={t('Message templates')}>
				{templates.map((template) => (
					<button
						key={template}
						type="button"
						className="nudge-composer__template"
						onClick={() => setMessage(template)}
					>
						{template}
					</button>
				))}
			</div>

			<label className="nudge-composer__label" htmlFor={messageId}>
				{t('Message')}
			</label>
			<textarea
				id={messageId}
				className="nudge-composer__message"
				value={message}
				maxLength={NUDGE_MESSAGE_MAX}
				rows={3}
				placeholder={t('What would you like people to know?')}
				onChange={(event) => setMessage(event.target.value)}
				aria-describedby={`${messageId}-counter`}
			/>
			<span id={`${messageId}-counter`} className="nudge-composer__counter" aria-live="polite">
				<span className="stat-number">
					{message.length}/{NUDGE_MESSAGE_MAX}
				</span>
			</span>

			<div className="nudge-composer__channels">
				<Checkbox label={t('In-app')} checked={inApp} onChange={setInApp} />
				{emailEnabled && <Checkbox label={t('Email')} checked={email} onChange={setEmail} />}
			</div>

			{inCooldown && lastNudgeAt !== undefined && (
				<p className="nudge-composer__cooldown">
					{tWithParams('You sent one {{ago}} — people may find another one annoying', {
						ago: formatRelativeTime(lastNudgeAt, currentLanguage, now),
					})}
				</p>
			)}

			{error && (
				<p className="nudge-composer__error" role="alert">
					{error}
				</p>
			)}

			<div className="nudge-composer__footer">
				<Button
					type="submit"
					variant="primary"
					text={tWithParams('Send to {{count}} people', { count: recipientCount })}
					disabled={!canSend}
					loading={sending}
				/>
				<Button type="button" variant="secondary" text={t('Cancel')} onClick={onCancel} />
			</div>
		</form>
	);
};

export default NudgeComposer;
