/**
 * Smooth open/close transition — animates height + padding + margin (like
 * Svelte's `slide`) *and* opacity together, so expanding/collapsing a thread
 * reads as one fluid motion instead of a height-only snap. Used for the message
 * children, the reply composer, and the AI panel.
 */
import { cubicOut } from 'svelte/easing';
import type { EasingFunction, TransitionConfig } from 'svelte/transition';

interface SlideFadeParams {
	duration?: number;
	delay?: number;
	easing?: EasingFunction;
}

export function slideFade(
	node: Element,
	{ duration = 280, delay = 0, easing = cubicOut }: SlideFadeParams = {},
): TransitionConfig {
	const style = getComputedStyle(node);
	const height = parseFloat(style.height) || 0;
	const paddingTop = parseFloat(style.paddingTop) || 0;
	const paddingBottom = parseFloat(style.paddingBottom) || 0;
	const marginTop = parseFloat(style.marginTop) || 0;
	const marginBottom = parseFloat(style.marginBottom) || 0;
	const borderTop = parseFloat(style.borderTopWidth) || 0;
	const borderBottom = parseFloat(style.borderBottomWidth) || 0;

	return {
		duration,
		delay,
		easing,
		css: (t) => {
			// Opacity ramps a touch faster than height so content is readable
			// before the slide fully settles.
			const o = Math.min(1, t * 1.4);

			return (
				`overflow: hidden;` +
				`opacity: ${o};` +
				`height: ${t * height}px;` +
				`padding-top: ${t * paddingTop}px;` +
				`padding-bottom: ${t * paddingBottom}px;` +
				`margin-top: ${t * marginTop}px;` +
				`margin-bottom: ${t * marginBottom}px;` +
				`border-top-width: ${t * borderTop}px;` +
				`border-bottom-width: ${t * borderBottom}px;`
			);
		},
	};
}
