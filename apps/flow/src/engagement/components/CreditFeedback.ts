/**
 * CreditFeedback — Inline text component showing "+N credits earned".
 *
 * Fades in, then auto-hides after 2 seconds.
 * Use as a closure component so each instance manages its own timer.
 *
 * Usage:
 *   m(CreditFeedback, { credits: 5 })
 */

import m from 'mithril';

export interface CreditFeedbackAttrs {
	/** Number of credits to display (e.g. 5 renders "+5 credits earned"). */
	credits: number;
}

/**
 * Closure component — each mount gets its own visibility state and timer.
 */
export function CreditFeedback(): m.Component<CreditFeedbackAttrs> {
	let visible = true;
	let fadeOut = false;
	let timer: ReturnType<typeof setTimeout> | null = null;

	function scheduleHide(): void {
		if (timer) clearTimeout(timer);

		// Start fade-out after 1.6s, then hide fully at 2s
		timer = setTimeout(() => {
			fadeOut = true;
			m.redraw();

			timer = setTimeout(() => {
				visible = false;
				m.redraw();
			}, 400);
		}, 1600);
	}

	return {
		oncreate() {
			scheduleHide();
		},

		onremove() {
			if (timer) clearTimeout(timer);
		},

		view(vnode) {
			const { credits } = vnode.attrs;

			if (!visible || credits <= 0) {
				return null;
			}

			return m(
				'span',
				{
					style: {
						display: 'inline-block',
						fontSize: 'var(--font-size-sm)',
						fontWeight: 'var(--font-weight-medium)',
						color: 'var(--color-agree-strong)',
						opacity: fadeOut ? '0' : '1',
						transform: fadeOut ? 'translateY(-4px)' : 'translateY(0)',
						transition: `opacity 400ms var(--easing-smooth), transform 400ms var(--easing-smooth)`,
						padding: '2px 0',
					},
					'aria-live': 'polite',
					role: 'status',
				},
				`+${credits} credits earned`,
			);
		},
	};
}
