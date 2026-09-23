import m from 'mithril';
import { t } from '../lib/i18n';
import { Icon, type IconName } from './Icon';
import type { PlaceDestination, PlaceTab } from '../lib/flows/placeNav';

/**
 * One bar, four doors — the village, my note, the class's board, the results.
 *
 * Props in, vnodes out: it knows nothing about the village, the iframe or the
 * lap cycle. Each screen hands it the tabs (from `placeNavTabs`) and the
 * handlers, which is what lets the 3D village and the flat view share one
 * navigator instead of teaching students two.
 *
 * A door the student cannot use is drawn locked rather than dropped: a bar
 * that changes shape between stations is a bar nobody learns. Pressing a
 * locked door says why, in a line, instead of doing nothing.
 */

const DOORS: Record<PlaceDestination, { icon: IconName; label: string }> = {
	village: { icon: 'home', label: 'village.nav.village' },
	note: { icon: 'edit', label: 'village.nav.note' },
	board: { icon: 'proposal', label: 'village.nav.board' },
	results: { icon: 'trophy', label: 'village.nav.results' },
};

/** Long enough to read a short sentence, short enough not to sit over the world */
const HINT_MS = 2500;

export interface PlaceBarAttrs {
	tabs: readonly PlaceTab[];
	onGo: (id: PlaceDestination) => void;
	/** News waiting behind a door I am not standing in */
	badges?: Partial<Record<PlaceDestination, number>>;
	/** A dot that outranks a count: news I can act on in one tap. The value is an i18n key for screen readers */
	alerts?: Partial<Record<PlaceDestination, string>>;
	/** An extra BEM modifier — the flat view floats the bar, the village pins it */
	variant?: string;
}

export function PlaceBar(): m.Component<PlaceBarAttrs> {
	let hint = '';
	let timer: ReturnType<typeof setTimeout> | undefined;

	function say(key: string): void {
		hint = key;
		clearTimeout(timer);
		timer = setTimeout(() => {
			hint = '';
			m.redraw();
		}, HINT_MS);
	}

	return {
		onremove() {
			clearTimeout(timer);
		},
		view(vnode) {
			const { tabs, onGo, badges, alerts, variant } = vnode.attrs;

			return m('.place-bar-wrap', [
				// The live region exists before it has anything to say, so a screen
				// reader announces the hint instead of the region appearing
				m(
					'p.place-bar__hint',
					{ role: 'status', class: hint ? '' : 'place-bar__hint--empty' },
					hint ? t(hint) : '',
				),
				m(
					'nav.place-bar',
					{
						'aria-label': t('village.nav.aria'),
						class: variant ? `place-bar--${variant}` : undefined,
					},
					tabs.map((tab) => {
						const door = DOORS[tab.id];
						const label = t(door.label);
						const badge = badges?.[tab.id] ?? 0;
						const alert = alerts?.[tab.id];

						return m(
							'button.place-bar__item',
							{
								key: tab.id,
								type: 'button',
								// A stable handle for the e2e walks: the labels are
								// translated into six languages, the door is not
								'data-place': tab.id,
								class:
									[
										tab.active ? 'place-bar__item--active' : '',
										tab.locked ? 'place-bar__item--locked' : '',
									]
										.filter(Boolean)
										.join(' ') || undefined,
								// Locked, not disabled: it keeps its place in the tab order so
								// a keyboard can reach it and hear why it is shut
								'aria-disabled': tab.locked ? 'true' : undefined,
								'aria-current': tab.active ? 'true' : undefined,
								title: label,
								onclick: () => {
									if (tab.locked) {
										if (tab.hint) say(tab.hint);

										return;
									}
									onGo(tab.id);
								},
							},
							[
								m('span.place-bar__icon', [
									m(Icon, { name: door.icon, size: 22 }),
									tab.locked ? m('span.place-bar__lock', { 'aria-hidden': 'true' }) : null,
								]),
								m('span.place-bar__label', label),
								// On the door I am standing in, the screen itself is the news
								!tab.active && !tab.locked && alert
									? [
											m('span.place-bar__dot', { 'aria-hidden': 'true' }),
											m('span.sr-only', t(alert)),
										]
									: !tab.active && !tab.locked && badge > 0
										? m('span.place-bar__badge', String(badge))
										: null,
							],
						);
					}),
				),
			]);
		},
	};
}
