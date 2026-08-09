import m from 'mithril';

/**
 * Long enough to read as "this folded away", short enough that a reader
 * flicking between two conversations never waits on it. Matches
 * --motion-base, which the chevron rotation already uses.
 */
const DURATION = 300;
const EASING = 'cubic-bezier(0.4, 0, 0.2, 1)';

function reducedMotion(): boolean {
	return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Is this fold (if there is one) mid-motion right now? Strictly `running` —
 * a finished animation lingers on the element, and treating that as "in
 * motion" would silence every later fold inside an already-open section.
 */
function isFolding(panel: Element | null | undefined): boolean {
	return (
		panel !== null &&
		panel !== undefined &&
		panel.getAnimations().some((animation) => animation.playState === 'running')
	);
}

/**
 * Unfold or fold a panel by animating its own height. The panel is measured
 * live (scrollHeight on the way in, offsetHeight on the way out) so nothing
 * has to declare a height up front — a thread grows with every message.
 */
function slide(panel: HTMLElement, opening: boolean): Animation | null {
	if (reducedMotion() || typeof panel.animate !== 'function') return null;
	// One fold at a time on any path down the tree. A section that unfolds
	// with an already-open conversation inside it used to play BOTH folds —
	// the section grew, and then its content grew again inside it, which
	// reads as the accordion opening twice. The outermost fold wins: it
	// carries everything under it, so the nested ones stand down.
	//
	// Both directions of the race are covered — Mithril fires a child's
	// oncreate before its parent's, so the parent cancels what the child
	// already started (before measuring, or it would measure a panel
	// collapsed to nothing), and a child created under a fold already in
	// motion sees it above and skips.
	for (const nested of panel.querySelectorAll<HTMLElement>('.collapsible')) {
		for (const running of nested.getAnimations()) running.cancel();
	}
	if (isFolding(panel.parentElement?.closest('.collapsible'))) return null;

	const shut: Keyframe = { height: '0px', opacity: 0 };
	const grown: Keyframe = {
		height: `${opening ? panel.scrollHeight : panel.offsetHeight}px`,
		opacity: 1,
	};
	// The panel must clip while it is shorter than its content, or the thread
	// spills over the row below it mid-fold
	panel.style.overflow = 'hidden';
	const animation = panel.animate(opening ? [shut, grown] : [grown, shut], {
		duration: DURATION,
		easing: EASING,
		// Closing holds its last frame: the node lives until Mithril removes
		// it, and without the hold it snaps back to full height for a frame
		fill: opening ? 'none' : 'forwards',
	});
	animation.finished
		.then(() => {
			// Hand the height back to the content once open, so a new message
			// (or a stretched textarea) is not clipped by a stale measurement
			if (opening) panel.style.overflow = '';
		})
		.catch(() => {
			panel.style.overflow = '';
		});

	return animation;
}

/**
 * A panel that unfolds instead of appearing, and folds away instead of
 * vanishing. Wrap the body of an accordion in it: when one row opens while
 * another closes, the two motions run side by side and the eye follows the
 * handoff instead of re-finding the page after a jump.
 */
export function Collapsible(): m.Component {
	let opening: Animation | null = null;

	return {
		oncreate({ dom }) {
			opening = slide(dom as HTMLElement, true);
		},

		onbeforeremove({ dom }) {
			// A half-grown panel folds from where it actually is
			opening?.cancel();
			opening = null;
			const closing = slide(dom as HTMLElement, false);
			if (!closing) return;

			return closing.finished.catch(() => undefined);
		},

		onremove() {
			opening?.cancel();
			opening = null;
		},

		view({ children }) {
			return m('.collapsible', children);
		},
	};
}
