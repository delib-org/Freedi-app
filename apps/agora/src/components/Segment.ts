import m from 'mithril';

export interface SegmentOption {
	id: string;
	label: string;
	/** A route: the option is a link and the switch is navigation */
	href?: string;
}

export interface SegmentAttrs {
	options: readonly SegmentOption[];
	selected: string;
	ariaLabel: string;
	/**
	 * Without `href`s the options are tabs that switch a section in place
	 * (arrow keys move between them); with them they are links.
	 */
	onSelect?: (id: string) => void;
	/** Id prefix for tabs, so a panel can name the tab that labels it */
	idPrefix?: string;
	/** Stays under the teacher bar while the section below it scrolls */
	sticky?: boolean;
}

/**
 * The pill switch: "my scenarios | the library", "achievements | students |
 * lessons". Links when it moves between pages, a tab list when it moves
 * between sections of one page.
 */
export const Segment: m.Component<SegmentAttrs> = {
	view({ attrs }) {
		const { options, selected, ariaLabel, onSelect, idPrefix = 'seg', sticky } = attrs;
		const extra = sticky ? ' segment--sticky' : '';
		const tabs = options.every((option) => option.href === undefined);

		if (!tabs) {
			return m(
				`nav.segment${extra}`,
				{ 'aria-label': ariaLabel },
				options.map((option) => {
					const on = option.id === selected;

					return m(
						m.route.Link,
						{
							key: option.id,
							href: option.href ?? '',
							class: `segment__opt${on ? ' segment__opt--on' : ''}`,
							'aria-current': on ? 'page' : undefined,
						},
						option.label,
					);
				}),
			);
		}

		function onKey(event: KeyboardEvent): void {
			const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
			if (!step) return;
			event.preventDefault();
			const rtl = document.documentElement.dir === 'rtl';
			const at = options.findIndex((option) => option.id === selected);
			const next = options[(at + (rtl ? -step : step) + options.length) % options.length];
			onSelect?.(next.id);
			requestAnimationFrame(() => document.getElementById(`${idPrefix}-tab-${next.id}`)?.focus());
		}

		return m(
			`.segment${extra}`,
			{ role: 'tablist', 'aria-label': ariaLabel, onkeydown: onKey },
			options.map((option) => {
				const on = option.id === selected;

				return m(
					'button.segment__opt',
					{
						key: option.id,
						id: `${idPrefix}-tab-${option.id}`,
						type: 'button',
						role: 'tab',
						class: on ? 'segment__opt--on' : undefined,
						'aria-selected': String(on),
						'aria-controls': `${idPrefix}-panel`,
						tabindex: on ? 0 : -1,
						onclick: () => onSelect?.(option.id),
					},
					option.label,
				);
			}),
		);
	},
};
