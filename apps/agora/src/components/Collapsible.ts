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
 * Unfold or fold a panel by animating its own height. The panel is measured
 * live (scrollHeight on the way in, offsetHeight on the way out) so nothing
 * has to declare a height up front — a thread grows with every message.
 */
function slide(panel: HTMLElement, opening: boolean): Animation | null {
	if (reducedMotion() || typeof panel.animate !== 'function') return null;

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
