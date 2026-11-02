import {
	RefObject,
	SyntheticEvent,
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from 'react';
import { UI } from '@/constants/common';

export type CollapsePhase = 'closed' | 'opening' | 'open' | 'closing';

export interface CollapseState {
	phase: CollapsePhase;
	/** Children are rendered: everything except fully closed. */
	isMounted: boolean;
	/** Drives the visual open class (1fr, opaque). Lags `opening` by two frames so the move can start. */
	isExpanded: boolean;
	/** True while the height is moving; the body clips only then. */
	isMoving: boolean;
	/** Keyboard focus must not enter the body. */
	isInert: boolean;
	/** Attach to the Collapse root so its computed transition tells us whether it moves at all. */
	ref: RefObject<HTMLDivElement>;
	onTransitionEnd: (event: SyntheticEvent<HTMLDivElement, TransitionEvent>) => void;
}

const HEIGHT_PROPERTY = 'grid-template-rows';

function prefersInstant(): boolean {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;

	return window.matchMedia('(prefers-reduced-motion: reduce)').matches === true;
}

/** True when CSS gives the element no transition (reduced motion, or no stylesheet as in jsdom). */
function hasNoTransition(element: HTMLElement | null): boolean {
	if (!element || typeof window.getComputedStyle !== 'function') return false;
	const durations = window.getComputedStyle(element).transitionDuration.split(',');

	return durations.every((value) => {
		const trimmed = value.trim();

		return trimmed === '' || parseFloat(trimmed) === 0;
	});
}

/**
 * Open/close lifecycle of a collapsible body: closed -> opening -> open -> closing -> closed.
 * Children stay mounted only until the closing move ends, so a closed section
 * holds no listeners. Reduced motion (or no matchMedia) skips the moves.
 */
export function useCollapseState(isOpen: boolean): CollapseState {
	const ref = useRef<HTMLDivElement>(null);
	const [phase, setPhase] = useState<CollapsePhase>(isOpen ? 'open' : 'closed');
	const [isExpanded, setIsExpanded] = useState<boolean>(isOpen);
	const [previousIsOpen, setPreviousIsOpen] = useState<boolean>(isOpen);

	// Derived during render, so the first open renders the content in the same commit.
	if (previousIsOpen !== isOpen) {
		setPreviousIsOpen(isOpen);
		if (prefersInstant()) {
			setPhase(isOpen ? 'open' : 'closed');
			setIsExpanded(isOpen);
		} else if (isOpen) {
			setPhase('opening');
			// Re-opening mid-close: the body is already mounted and collapsing, so reverse at once.
			setIsExpanded(phase === 'closing');
		} else {
			setPhase('closing');
			setIsExpanded(false);
		}
	}

	const settle = useCallback((): void => {
		setPhase((current) => {
			if (current === 'opening') return 'open';
			if (current === 'closing') return 'closed';

			return current;
		});
	}, []);

	// No CSS transition means no transitionend: finish before paint.
	useLayoutEffect(() => {
		if ((phase === 'opening' || phase === 'closing') && hasNoTransition(ref.current)) {
			setIsExpanded(phase === 'opening');
			settle();
		}
	}, [phase, settle]);

	// Opening: mount collapsed, then expand two frames later so the browser has a start state.
	useEffect(() => {
		if (phase !== 'opening' || isExpanded) return;
		let inner = 0;
		const outer = window.requestAnimationFrame(() => {
			inner = window.requestAnimationFrame(() => setIsExpanded(true));
		});

		return () => {
			window.cancelAnimationFrame(outer);
			window.cancelAnimationFrame(inner);
		};
	}, [phase, isExpanded]);

	// Fallback when transitionend never arrives (tab hidden, display changed).
	useEffect(() => {
		if (phase !== 'opening' && phase !== 'closing') return;
		const timer = window.setTimeout(
			settle,
			UI.COLLAPSE_DURATION_MS + UI.COLLAPSE_FALLBACK_BUFFER_MS,
		);

		return () => window.clearTimeout(timer);
	}, [phase, settle]);

	const onTransitionEnd = useCallback(
		(event: SyntheticEvent<HTMLDivElement, TransitionEvent>): void => {
			// Children's own transitions bubble up; only the height move counts.
			if (event.target !== event.currentTarget) return;
			if (event.nativeEvent.propertyName !== HEIGHT_PROPERTY) return;
			settle();
		},
		[settle],
	);

	return {
		phase,
		isMounted: phase !== 'closed',
		isExpanded,
		isMoving: phase === 'opening' || phase === 'closing',
		isInert: phase === 'closing',
		ref,
		onTransitionEnd,
	};
}
