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
	/** Full note text to display / edit. */
	text: string;
	/** The note's own text direction (LTR/RTL), decided by the caller. */
	dir: 'ltr' | 'rtl';
	/** Paper palette so the overlay looks like the same note, enlarged. */
	color: ClusterPaletteEntry;
	/** The source card's viewport rect at open time — the scale-in origin. */
	sourceRect: DOMRect;
	/** Whether the current user may edit this note. */
	canEdit: boolean;
	/** Open directly in edit mode (parent-controlled). */
	editing: boolean;
	/** Ask the parent to switch this note into edit mode. */
	onRequestEdit: () => void;
	/** Persist edited text. */
	onSave: (value: string) => void;
	/** Close the overlay (parent unmounts this component). */
	onClose: () => void;
}

// Fallback duration (ms) to unmount if `transitionend` never fires (e.g. the
// exit was interrupted, or reduced-motion collapsed the transition to nothing).
const EXIT_FALLBACK_MS = 320;

const FOCUSABLE = 'button, textarea, [href], input, select, [tabindex]:not([tabindex="-1"])';

/**
 * "Lift the note" focus overlay. Renders the full note text in a large,
 * scrollable panel that scales up from the source card's position. With edit
 * rights the same panel becomes the editor — so editing happens in a
 * comfortable box, not the cramped 120px card. Portaled to document.body so it
 * escapes the board's pan/zoom transform and pan handler.
 */
const NoteFocusOverlay: FC<Props> = ({
	text,
	dir,
	color,
	sourceRect,
	canEdit,
	editing,
	onRequestEdit,
	onSave,
	onClose,
}) => {
	const { t } = useTranslation();
	const backdropRef = useRef<HTMLDivElement>(null);
	const noteRef = useRef<HTMLDivElement>(null);
	const closeRef = useRef<HTMLButtonElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	// The element focused before we opened, so we can restore focus on close.
	const returnFocusRef = useRef<HTMLElement | null>(null);
	const [open, setOpen] = useState(false);
	const [closing, setClosing] = useState(false);
	const [draft, setDraft] = useState(text);

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

	// Focus the editor when editing, else the close button. Restore focus on
	// unmount so keyboard users return to where they were on the board.
	useEffect(() => {
		if (editing) {
			const el = textareaRef.current;
			if (el) {
				el.focus();
				// Caret at the end rather than selecting everything — friendlier for
				// appending to an existing note.
				el.setSelectionRange(el.value.length, el.value.length);
			}
		} else {
			closeRef.current?.focus();
		}
	}, [editing]);

	useEffect(
		() => () => {
			returnFocusRef.current?.focus?.();
		},
		[],
	);

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

	const save = useCallback(() => {
		onSave(draft.trim());
		beginClose();
	}, [draft, onSave, beginClose]);

	// Escape closes/cancels; Tab is trapped within the panel so focus can't
	// escape to the board behind the backdrop.
	const onKeyDown = (e: ReactKeyboardEvent) => {
		if (e.key === 'Escape') {
			e.stopPropagation();
			beginClose();

			return;
		}
		if (e.key !== 'Tab') return;
		const focusables = Array.from(
			noteRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [],
		).filter((el) => !el.hasAttribute('disabled'));
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
				aria-label={editing ? t('Edit') : t('Full note')}
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

				{editing ? (
					<textarea
						ref={textareaRef}
						className={styles.noteEdit}
						value={draft}
						dir="auto"
						onChange={(e) => setDraft(e.target.value)}
						onKeyDown={(e) => {
							// Enter inserts a newline (multi-line notes); Cmd/Ctrl+Enter saves.
							if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
								e.preventDefault();
								save();
							}
						}}
					/>
				) : (
					// tabindex so keyboard users can focus and scroll the long text.
					<div className={styles.noteText} tabIndex={0}>
						{text}
					</div>
				)}

				<div className={styles.footer}>
					{editing ? (
						<>
							<button type="button" className={styles.btnSecondary} onClick={beginClose}>
								{t('Cancel')}
							</button>
							<button type="button" className={styles.btnPrimary} onClick={save}>
								{t('Save')}
							</button>
						</>
					) : (
						canEdit && (
							<button type="button" className={styles.btnPrimary} onClick={onRequestEdit}>
								{t('Edit')}
							</button>
						)
					)}
				</div>
			</div>
		</div>,
		document.body,
	);
};

export default NoteFocusOverlay;
