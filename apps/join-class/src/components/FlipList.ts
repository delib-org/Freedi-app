import m from 'mithril';
import { orderChanged, playFlip, recordPositions } from '@/lib/flipReorder';
import type { Positions } from '@/lib/flipReorder';

/**
 * A list whose items re-order while people rate (rank by C_p): when the order
 * of `ids` changes, every moved child glides from its old place to its new one
 * (flipReorder). The children must be direct children carrying `data-key`.
 * No glide under prefers-reduced-motion (playFlip checks it). (Trello csuayEmX.)
 */

export interface FlipListAttrs {
	/** Mithril selector of the list element, e.g. 'ul.gate-panel__list'. */
	selector: string;
	/** The children's keys in display order. */
	ids: readonly string[];
	/** Extra attributes for the list element. */
	attrs?: Record<string, unknown>;
}

const before = new WeakMap<Element, Positions>();

export const FlipList: m.Component<FlipListAttrs> = {
	onbeforeupdate(vnode, old) {
		if (old.dom && orderChanged(old.attrs.ids, vnode.attrs.ids)) {
			before.set(old.dom, recordPositions(old.dom));
		}
	},

	onupdate(vnode) {
		const positions = before.get(vnode.dom);
		if (!positions) return;
		before.delete(vnode.dom);
		playFlip(vnode.dom, positions);
	},

	view({ attrs, children }) {
		return m(attrs.selector, attrs.attrs ?? {}, children);
	},
};
