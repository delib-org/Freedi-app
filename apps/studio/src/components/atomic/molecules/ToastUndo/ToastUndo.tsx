import React, { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { useTranslation } from '@freedi/shared-i18n/react';

/**
 * ToastUndo molecule — `.toast.toast--undo` (shared toast block + Studio
 * modifier). Counts down `durationMs`; pauses while hovered / focused;
 * Esc dismisses (commits); the Undo button reverts.
 * Styles: styles/molecules/_toast-undo.scss + shared molecules/_toast.scss
 */

export interface ToastUndoProps {
	message: string;
	durationMs: number;
	onUndo: () => void;
	/** Timer elapsed, or Esc / dismiss — the action commits. */
	onExpire: () => void;
	className?: string;
}

const ToastUndo: React.FC<ToastUndoProps> = ({
	message,
	durationMs,
	onUndo,
	onExpire,
	className,
}) => {
	const { t } = useTranslation();
	const [paused, setPaused] = useState(false);
	const remainingRef = useRef(durationMs);
	const startedAtRef = useRef(0);
	const timerRef = useRef<number | null>(null);
	const onExpireRef = useRef(onExpire);
	onExpireRef.current = onExpire;

	const clearTimer = useCallback(() => {
		if (timerRef.current !== null) {
			window.clearTimeout(timerRef.current);
			timerRef.current = null;
		}
	}, []);

	const startTimer = useCallback(() => {
		clearTimer();
		startedAtRef.current = Date.now();
		timerRef.current = window.setTimeout(() => {
			timerRef.current = null;
			onExpireRef.current();
		}, remainingRef.current);
	}, [clearTimer]);

	const pause = useCallback(() => {
		if (timerRef.current === null) return;
		clearTimer();
		remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
		setPaused(true);
	}, [clearTimer]);

	const resume = useCallback(() => {
		setPaused(false);
		startTimer();
	}, [startTimer]);

	useEffect(() => {
		startTimer();

		return clearTimer;
	}, [startTimer, clearTimer]);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				clearTimer();
				onExpireRef.current();
			}
		};
		document.addEventListener('keydown', onKeyDown);

		return () => document.removeEventListener('keydown', onKeyDown);
	}, [clearTimer]);

	const handleUndo = () => {
		clearTimer();
		onUndo();
	};

	return (
		<div
			className={clsx(
				'toast',
				'toast--undo',
				'toast--visible',
				paused && 'toast--paused',
				className,
			)}
			role="status"
			aria-live="polite"
			onMouseEnter={pause}
			onMouseLeave={resume}
			onFocus={pause}
			onBlur={resume}
			style={{ '--toast-duration': `${durationMs}ms` } as React.CSSProperties}
		>
			<div className="toast__content">
				<p className="toast__message">{message}</p>
			</div>
			<button type="button" className="toast__action" onClick={handleUndo}>
				{t('Undo')}
			</button>
			<span className="toast__progress" aria-hidden="true" />
		</div>
	);
};

export default ToastUndo;
