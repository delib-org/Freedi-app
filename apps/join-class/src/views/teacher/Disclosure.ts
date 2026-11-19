import m from 'mithril';

/**
 * One closed-by-default panel behind a button (design 6): a disclosure, not an ARIA menu,
 * because the panels hold radio groups and links. The button carries `aria-expanded` and
 * `aria-controls`; Escape closes the panel and returns focus to the button; a tap outside
 * closes it. A popover on a laptop, a bottom sheet on a phone (the styles decide).
 */

export interface DisclosureAttrs {
	/** Unique on the screen: the panel's id, and the state key. */
	id: string;
	/** The visible words of the button. */
	label: string;
	/** A longer name for assistive technology, when the visible words are short ("More"). */
	ariaLabel?: string;
	testId?: string;
	/** The panel's own accessible name. */
	panelLabel: string;
	/** Which edge of the button the popover lines up with. */
	align?: 'start' | 'end';
	/** Drawn only while the panel is open. */
	content: (close: () => void) => m.Children;
}

const openIds = new Set<string>();

export function isDisclosureOpen(id: string): boolean {
	return openIds.has(id);
}

export function openDisclosure(id: string): void {
	openIds.add(id);
}

export function closeDisclosure(id: string): void {
	openIds.delete(id);
}

function toggle(id: string): void {
	if (openIds.has(id)) openIds.delete(id);
	else openIds.add(id);
}

interface DisclosureState {
	onDocumentClick?: (event: MouseEvent) => void;
}

export const toggleIdOf = (id: string): string => `${id}-toggle`;

export const Disclosure: m.Component<DisclosureAttrs> = {
	oncreate(vnode) {
		const state = vnode.state as DisclosureState;
		state.onDocumentClick = (event: MouseEvent) => {
			if (openIds.has(vnode.attrs.id) && !vnode.dom.contains(event.target as Node)) {
				openIds.delete(vnode.attrs.id);
				m.redraw();
			}
		};
		document.addEventListener('click', state.onDocumentClick);
	},

	onremove(vnode) {
		const { onDocumentClick } = vnode.state as DisclosureState;
		if (onDocumentClick) document.removeEventListener('click', onDocumentClick);
		openIds.delete(vnode.attrs.id);
	},

	view({ attrs }) {
		const open = openIds.has(attrs.id);
		const close = (): void => {
			openIds.delete(attrs.id);
			document.getElementById(toggleIdOf(attrs.id))?.focus();
		};

		return m(
			'div.disclosure',
			{
				class: attrs.align === 'end' ? 'disclosure--end' : '',
				onkeydown: (event: KeyboardEvent) => {
					if (event.key === 'Escape' && openIds.has(attrs.id)) {
						event.stopPropagation();
						close();
					}
				},
			},
			[
				m(
					'button.btn.btn--tertiary.disclosure__toggle',
					{
						id: toggleIdOf(attrs.id),
						type: 'button',
						'aria-expanded': open ? 'true' : 'false',
						'aria-controls': attrs.id,
						'aria-label': attrs.ariaLabel,
						'data-testid': attrs.testId,
						onclick: () => toggle(attrs.id),
					},
					[m('span', attrs.label), m('span.disclosure__caret', { 'aria-hidden': 'true' }, '▾')],
				),
				m(
					'div.disclosure__panel',
					{
						id: attrs.id,
						hidden: !open,
						role: 'region',
						'aria-label': attrs.panelLabel,
					},
					open ? attrs.content(close) : null,
				),
			],
		);
	},
};
