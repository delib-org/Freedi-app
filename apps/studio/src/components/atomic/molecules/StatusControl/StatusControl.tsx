import React, { useEffect, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import type { ActivityRunState } from '@freedi/event-core';
import { useTranslation } from '@freedi/shared-i18n/react';
import { StatusPill, STATUS_GLYPHS } from '@/components/atomic/atoms/Tag';
import { Button } from '@/components/atomic/atoms/Button';

/**
 * StatusControl molecule — Open / Freeze / Close radiogroup over the shared
 * `.segmented-control` geometry (+ `--status` modifier), with a per-status
 * hint and an inline confirm panel for the destructive transitions
 * (close, and reopen from closed).
 * Styles: styles/molecules/_status-control.scss
 */

export type StatusControlTarget = Exclude<ActivityRunState, 'queued'>;

export interface StatusControlProps {
	value: ActivityRunState;
	onChange: (next: StatusControlTarget) => Promise<void> | void;
	busy?: boolean;
	/** Read-only: renders a static StatusPill + hint. */
	disabled?: boolean;
	compact?: boolean;
	/** Ask before closing (and before reopening from closed). Default true. */
	confirmClose?: boolean;
	/** Accessible name of the group (defaults to "Question status"). */
	ariaLabel?: string;
	/**
	 * A Sign document: "Open for comment" instead of "Open", document hints,
	 * and closing needs no confirmation (the text stays readable).
	 */
	document?: boolean;
	className?: string;
}

const SEGMENTS: readonly { value: StatusControlTarget; label: string }[] = [
	{ value: 'open', label: 'Open' },
	{ value: 'frozen', label: 'Freeze' },
	{ value: 'closed', label: 'Close' },
];

const DOCUMENT_SEGMENTS: readonly { value: StatusControlTarget; label: string }[] = [
	{ value: 'open', label: 'Open for comment' },
	{ value: 'frozen', label: 'Freeze' },
	{ value: 'closed', label: 'Close' },
];

export const STATUS_HINTS: Record<ActivityRunState, string> = {
	queued: 'Only you can see it.',
	open: 'Participants can take part.',
	frozen: 'Visible, but nobody can act.',
	closed: 'Participants see "this question is closed".',
};

export const DOCUMENT_STATUS_HINTS: Record<ActivityRunState, string> = {
	queued: 'In review — only admins can see it. Open it when the text is ready.',
	open: 'Anyone with the link can read and comment, paragraph by paragraph.',
	frozen: 'Readable, but no new comments.',
	closed: 'Comments are closed; the text stays readable.',
};

const StatusControl: React.FC<StatusControlProps> = ({
	value,
	onChange,
	busy = false,
	disabled = false,
	compact = false,
	confirmClose = true,
	ariaLabel,
	document = false,
	className,
}) => {
	const { t } = useTranslation();
	const segments = document ? DOCUMENT_SEGMENTS : SEGMENTS;
	const hints = document ? DOCUMENT_STATUS_HINTS : STATUS_HINTS;
	const hintId = useId();
	const confirmId = useId();
	const [pending, setPending] = useState<StatusControlTarget | null>(null);
	const [saving, setSaving] = useState(false);
	const [focusIndex, setFocusIndex] = useState<number>(() =>
		Math.max(
			0,
			segments.findIndex((s) => s.value === value),
		),
	);
	const segmentRefs = useRef<(HTMLButtonElement | null)[]>([]);
	const keepButtonRef = useRef<HTMLButtonElement>(null);
	const mountedRef = useRef(true);

	useEffect(() => {
		mountedRef.current = true;

		return () => {
			mountedRef.current = false;
		};
	}, []);

	// Keep the roving tabindex on the active segment when the value changes.
	useEffect(() => {
		const index = segments.findIndex((s) => s.value === value);
		if (index >= 0) setFocusIndex(index);
	}, [value]);

	// The safe choice ("Keep open" / "Keep closed") gets focus by default.
	useEffect(() => {
		if (pending) keepButtonRef.current?.focus();
	}, [pending]);

	const isBusy = busy || saving;

	const commit = async (next: StatusControlTarget) => {
		setPending(null);
		setSaving(true);
		try {
			await onChange(next);
		} finally {
			if (mountedRef.current) setSaving(false);
		}
	};

	const select = (next: StatusControlTarget) => {
		if (isBusy || next === value) return;
		const needsConfirm = confirmClose && (next === 'closed' || value === 'closed');
		if (needsConfirm) {
			setPending(next);

			return;
		}
		void commit(next);
	};

	const cancel = () => {
		setPending(null);
		const index = segments.findIndex((s) => s.value === value);
		segmentRefs.current[index >= 0 ? index : focusIndex]?.focus();
	};

	const handleSegmentKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
		let next: number | null = null;
		switch (event.key) {
			case 'ArrowRight':
			case 'ArrowDown':
				next = (index + 1) % segments.length;
				break;
			case 'ArrowLeft':
			case 'ArrowUp':
				next = (index - 1 + segments.length) % segments.length;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = segments.length - 1;
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				select(segments[index].value);

				return;
			default:
				return;
		}
		event.preventDefault();
		setFocusIndex(next);
		segmentRefs.current[next]?.focus();
	};

	const handleConfirmKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
		if (event.key === 'Escape') {
			event.preventDefault();
			event.stopPropagation();
			cancel();
		}
	};

	const wrapperClasses = clsx(
		'status-control',
		isBusy && 'status-control--busy',
		disabled && 'status-control--disabled',
		compact && 'status-control--compact',
		className,
	);

	if (disabled) {
		return (
			<div className={wrapperClasses}>
				<StatusPill status={value} document={document} size={compact ? 'small' : 'large'} />
				{!compact && (
					<p className="status-control__hint" id={hintId}>
						{t(hints[value])}
					</p>
				)}
			</div>
		);
	}

	const isClosing = pending === 'closed';
	const confirmText = isClosing
		? document
			? t('Close comments? The text stays readable, but nobody can comment.')
			: t('Close this question? Participants will no longer be able to answer.')
		: document
			? t('People will be able to comment again.')
			: t('Participants will be able to act again.');
	const keepLabel = value === 'closed' ? t('Keep closed') : t('Keep open');
	const proceedLabel = isClosing ? t('Close question') : t('Reopen');

	return (
		<div className={wrapperClasses}>
			<div
				role="radiogroup"
				aria-label={ariaLabel ?? (document ? t('Document status') : t('Question status'))}
				aria-describedby={hintId}
				aria-busy={isBusy || undefined}
				className="segmented-control segmented-control--status"
			>
				{segments.map((segment, index) => {
					const isActive = segment.value === value;

					return (
						<button
							key={segment.value}
							ref={(el) => {
								segmentRefs.current[index] = el;
							}}
							type="button"
							role="radio"
							aria-checked={isActive}
							aria-disabled={isBusy || undefined}
							tabIndex={index === focusIndex ? 0 : -1}
							className={clsx(
								'segmented-control__segment',
								`segmented-control__segment--${segment.value}`,
								isActive && 'segmented-control__segment--active',
							)}
							onClick={() => select(segment.value)}
							onKeyDown={(event) => handleSegmentKeyDown(event, index)}
							onFocus={() => setFocusIndex(index)}
						>
							<span className="segmented-control__glyph" aria-hidden="true">
								{STATUS_GLYPHS[segment.value]}
							</span>
							{t(segment.label)}
						</button>
					);
				})}
			</div>

			{!compact && (
				<p className="status-control__hint" id={hintId}>
					{t(hints[value])}
					{isBusy && (
						<>
							{' '}
							<span className="status-control__busy">{t('Saving…')}</span>
						</>
					)}
				</p>
			)}

			{pending && (
				<div
					className="status-control__confirm"
					role="alertdialog"
					aria-modal="false"
					aria-labelledby={confirmId}
					onKeyDown={handleConfirmKeyDown}
				>
					<p className="status-control__confirm-text" id={confirmId}>
						{confirmText}
					</p>
					<div className="status-control__confirm-actions">
						<button
							ref={keepButtonRef}
							type="button"
							className="button button--secondary button--small"
							onClick={cancel}
						>
							{keepLabel}
						</button>
						<Button
							text={proceedLabel}
							variant={isClosing ? 'reject' : 'primary'}
							size="small"
							onClick={() => void commit(pending)}
						/>
					</div>
				</div>
			)}
		</div>
	);
};

export default StatusControl;
