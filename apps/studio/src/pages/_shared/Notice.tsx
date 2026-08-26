import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

/**
 * A transient status message over the shared `.toast` block — for "link
 * copied" style feedback that needs no Undo. `useNotice()` owns the timer;
 * render `<Notice notice={notice} />` once per page.
 */
export type NoticeTone = 'success' | 'error' | 'info';

export interface NoticeState {
	id: number;
	message: string;
	tone: NoticeTone;
}

export const NOTICE_DURATION_MS = 3500;

export interface UseNoticeResult {
	notice: NoticeState | null;
	show: (message: string, tone?: NoticeTone) => void;
}

export function useNotice(durationMs: number = NOTICE_DURATION_MS): UseNoticeResult {
	const [notice, setNotice] = useState<NoticeState | null>(null);
	const timer = useRef<number | null>(null);
	const nextId = useRef(1);

	const show = useCallback(
		(message: string, tone: NoticeTone = 'success') => {
			if (timer.current !== null) window.clearTimeout(timer.current);
			setNotice({ id: nextId.current++, message, tone });
			timer.current = window.setTimeout(() => setNotice(null), durationMs);
		},
		[durationMs],
	);

	useEffect(
		() => () => {
			if (timer.current !== null) window.clearTimeout(timer.current);
		},
		[],
	);

	return { notice, show };
}

export function Notice({ notice }: { notice: NoticeState | null }) {
	if (!notice) return null;

	return (
		<div className="toast-container toast-container--bottom-center toast-container--studio">
			<div
				key={notice.id}
				className={clsx('toast', `toast--${notice.tone}`, 'toast--visible')}
				role={notice.tone === 'error' ? 'alert' : 'status'}
				aria-live="polite"
			>
				<div className="toast__content">
					<p className="toast__message">{notice.message}</p>
				</div>
			</div>
		</div>
	);
}
