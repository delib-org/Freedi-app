import {
	FC,
	type KeyboardEvent as ReactKeyboardEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from '@/controllers/hooks/useTranslation';
import type { ClusterPaletteEntry } from '../mapHelpers/mindElixirTransform';
import styles from './NoteFocusOverlay.module.scss';

interface Props {
	/** Full note text to display. */
	text: string;
	/** The note's own text direction (LTR/RTL), decided by the caller. */
	dir: 'ltr' | 'rtl';
	/** Paper palette so the overlay looks like the same note, enlarged. */
	color: ClusterPaletteEntry;
	/** The source card's viewport rect at open time — the scale-in origin. */
	sourceRect: DOMRect;
	/** Close the overlay (parent unmounts this component). */
	onClose: () => void;
}

// Fallback duration (ms) to unmount if `transitionend` never fires (e.g. the
// exit was interrupted, or reduced-motion collapsed the transition to nothing).
const EXIT_FALLBACK_MS = 320;

/**
 * "Lift the note" focus overlay. Renders the full note text in a large,
 * scrollable panel that scales up from the source card's position. Portaled to
 * document.body so it escapes the board's pan/zoom transform and pan handler.
 */
const NoteFocusOverlay: FC<Props> = ({ text, dir, color, sourceRect, onClose }) => {
	const { t } = useTranslation();
	const backdropRef = useRef<HTMLDivElement>(null);
	const noteRef = useRef<HTMLDivElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	// The element focused before we opened, so we can restore focus on close.
	const returnFocusRef = useRef<HTMLElement | null>(null);
	const [open, setOpen] = useState(false);
	const [closing, setClosing] = useState(false);

	// Enter animation: anchor the scale-in origin to the source card, then flip
	// `open` on the next frame so the CSS transition runs from that origin.
	useLayoutEffect(() => {
		returnFocusRef.current = (document.activeElement as HTMLElement | null) ?? null;
		const noteEl = noteRef.current;
		if (noteEl) {
			const noteRect = noteEl.getBoundingClientRect();
			const originX = sourceRect.left + sourceRect.width / 2 - noteRect.left;
			const originY = sourceRect.top + sourceRect.height / 2 - noteRect.top;
			noteEl.style.transformOrigin = `${originX}px ${originY}px`;
		}
		const raf = requestAnimationFrame(() => setOpen(true));

		return () => cancelAnimationFrame(raf);
	}, [sourceRect]);

	// Move focus into the dialog once it's mounted; restore it on unmount.
	useEffect(() => {
		closeRef.current?.focus();

		return () => {
			returnFocusRef.current?.focus?.();
		};
	}, []);

	const beginClose = useCallback(() => {
		if (closing) return;
		setClosing(true);
		setOpen(false);
		const timeout = window.setTimeout(onClose, EXIT_FALLBACK_MS);
		const noteEl = noteRef.current;
		const onEnd = (e: TransitionEvent) => {
			if (e.target !== noteEl || e.propertyName !== 'transform') return;
			window.clearTimeout(timeout);
			onClose();
		};
		noteEl?.addEventListener('transitionend', onEnd);
	}, [closing, onClose]);

	// Escape closes; keep focus trapped between the close button and the
	// scrollable text region so keyboard users can't tab out to the board.
	const onKeyDown = (e: ReactKeyboardEvent) => {
		if (e.key === 'Escape') {
			e.stopPropagation();
			beginClose();

			return;
		}
		if (e.key !== 'Tab') return;
		const focusables = [closeRef.current, noteRef.current].filter(
			(el): el is HTMLButtonElement | HTMLDivElement => el !== null,
		);
		if (focusables.length === 0) return;
		const first = focusables[0];
		const last = focusables[focusables.length - 1];
		const active = document.activeElement;
		if (e.shiftKey && active === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && active === last) {
			e.preventDefault();
			first.focus();
		}
	};

	return createPortal(
		<div
			ref={backdropRef}
			className={`${styles.backdrop} ${open ? styles.open : ''} ${closing ? styles.closing : ''}`}
			onPointerDown={(e) => {
				// Backdrop click (not a click inside the note) closes. Stop the event
				// so the board's canvas pan handler never sees it.
				e.stopPropagation();
				if (e.target === backdropRef.current) beginClose();
			}}
			onKeyDown={onKeyDown}
		>
			<div
				ref={noteRef}
				className={styles.note}
				style={{ background: color.card, color: color.text }}
				dir={dir}
				role="dialog"
				aria-modal="true"
				aria-label={t('Full note')}
			>
				<button
					ref={closeRef}
					type="button"
					className={styles.close}
					aria-label={t('Close')}
					onClick={beginClose}
				>
					✕
				</button>
				{/* tabindex so keyboard users can focus and scroll the long text. */}
				<div className={styles.noteText} tabIndex={0}>
					{text}
				</div>
			</div>
		</div>,
		document.body,
	);
};

export default NoteFocusOverlay;
