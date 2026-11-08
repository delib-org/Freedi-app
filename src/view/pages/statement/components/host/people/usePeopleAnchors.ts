import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { UI } from '@/constants/common';
import { parsePeopleAnchor, PeopleAnchor } from '../hostHubLogic';

interface UsePeopleAnchorsOptions {
	/** Subsections rendered right now; a hash naming another one opens nothing. */
	available: ReadonlyArray<PeopleAnchor>;
	/** The first subsection with something to act on (UX 4.1), or null; applied once. */
	defaultOpen: PeopleAnchor | null;
}

export interface PeopleAnchorsState {
	isOpen: (anchor: PeopleAnchor) => boolean;
	toggle: (anchor: string) => void;
	/** Jump strip: open (never close) one subsection, scroll to it, focus its header. */
	jumpTo: (anchor: PeopleAnchor) => void;
	/** Callback ref for a subsection's header button, so a deep link can focus it. */
	registerToggle: (anchor: PeopleAnchor) => (element: HTMLButtonElement | null) => void;
}

/**
 * Which People subsections are open, driven by `#anchor` (UX 4.1): a deep
 * link opens its subsection, scrolls the heading to the top and focuses its
 * button. Opening a subsection by hand writes the hash with replaceState, so
 * Back still leaves the page through `?section=people`.
 */
export function usePeopleAnchors({
	available,
	defaultOpen,
}: UsePeopleAnchorsOptions): PeopleAnchorsState {
	const { hash, key } = useLocation();
	const [open, setOpen] = useState<ReadonlySet<PeopleAnchor>>(() => new Set());
	const toggles = useRef(new Map<PeopleAnchor, HTMLButtonElement>());
	const hasInteracted = useRef(false);
	const hasDefaulted = useRef(false);
	const availableKey = available.join(',');

	useEffect(() => {
		const requested = parsePeopleAnchor(hash);
		if (!requested || !availableKey.split(',').includes(requested)) return;

		hasInteracted.current = true;
		setOpen((prev) => (prev.has(requested) ? prev : new Set(prev).add(requested)));
		// After the hub's own effect, which scrolls to the People card.
		const frame = window.requestAnimationFrame(() => revealSubsection(requested, toggles.current));
		const cancelSettle = scrollAgainWhenSettled(requested);

		return () => {
			window.cancelAnimationFrame(frame);
			cancelSettle();
		};
	}, [hash, key, availableKey]);

	// UX 4.1 applies the default on arrival only: the first default the
	// loading data yields opens once, and later changes (Waiting emptying
	// out mid-session) never pop another subsection open.
	useEffect(() => {
		if (hasInteracted.current || hasDefaulted.current || !defaultOpen) return;
		hasDefaulted.current = true;
		setOpen((prev) => (prev.has(defaultOpen) ? prev : new Set(prev).add(defaultOpen)));
	}, [defaultOpen]);

	const toggle = useCallback(
		(id: string) => {
			const anchor = parsePeopleAnchor(id);
			if (!anchor) return;
			hasInteracted.current = true;
			const next = new Set(open);
			if (next.has(anchor)) {
				next.delete(anchor);
			} else {
				next.add(anchor);
				window.history.replaceState(window.history.state, '', `#${anchor}`);
			}
			setOpen(next);
		},
		[open],
	);

	const cancelSettle = useRef<() => void>(() => undefined);
	useEffect(() => () => cancelSettle.current(), []);

	const jumpTo = useCallback((anchor: PeopleAnchor) => {
		hasInteracted.current = true;
		setOpen((prev) => (prev.has(anchor) ? prev : new Set(prev).add(anchor)));
		window.history.replaceState(window.history.state, '', `#${anchor}`);
		window.requestAnimationFrame(() => revealSubsection(anchor, toggles.current));
		cancelSettle.current();
		cancelSettle.current = scrollAgainWhenSettled(anchor);
	}, []);

	const isOpen = useCallback((anchor: PeopleAnchor) => open.has(anchor), [open]);

	const registerToggle = useCallback(
		(anchor: PeopleAnchor) => (element: HTMLButtonElement | null) => {
			if (element) toggles.current.set(anchor, element);
			else toggles.current.delete(anchor);
		},
		[],
	);

	return { isOpen, toggle, jumpTo, registerToggle };
}

/** Scrolls the subsection's heading to the top and focuses its header button. */
function revealSubsection(
	anchor: PeopleAnchor,
	toggles: ReadonlyMap<PeopleAnchor, HTMLButtonElement>,
): void {
	document.getElementById(anchor)?.scrollIntoView?.({ block: 'start' });
	toggles.get(anchor)?.focus({ preventScroll: true });
}

const USER_INPUT_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/**
 * The body opens over a short move, so the page is still too short while the
 * first scroll runs and the browser clamps it. Scroll once more when the move
 * is over, unless the user has wheeled, touched, clicked or pressed a key since;
 * focus is already in place and is left alone. Returns a canceller.
 */
function scrollAgainWhenSettled(anchor: PeopleAnchor): () => void {
	let userMoved = false;
	const markMoved = (): void => {
		userMoved = true;
	};
	USER_INPUT_EVENTS.forEach((name) =>
		window.addEventListener(name, markMoved, { capture: true, passive: true }),
	);
	const stop = (): void =>
		USER_INPUT_EVENTS.forEach((name) => window.removeEventListener(name, markMoved, true));
	const timer = window.setTimeout(() => {
		stop();
		if (!userMoved) document.getElementById(anchor)?.scrollIntoView?.({ block: 'start' });
	}, UI.COLLAPSE_DURATION_MS + UI.COLLAPSE_FALLBACK_BUFFER_MS);

	return () => {
		window.clearTimeout(timer);
		stop();
	};
}
