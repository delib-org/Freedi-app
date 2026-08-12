import m from 'mithril';
import { Icon } from './Icon';
import { t } from '../lib/i18n';

/** The recap's two halves — how the PROPOSALS did, and how the PEOPLE did */
export type ResultsTab = 'class' | 'helpers';

export interface ResultsSwitchAttrs {
	tab: ResultsTab;
	onTab: (tab: ResultsTab) => void;
	/** Thank-yous exchanged in the whole class, shown on the helpers half */
	thanks: number;
}

/**
 * The door between the two answers to "how did we do".
 *
 * They are the same question about different subjects — the class map ranks
 * PROPOSALS, the helpers board ranks PEOPLE — and stacking them made the
 * second one the thing you reach by scrolling past the first, which is exactly
 * the half belonging to the students who spent the lesson improving somebody
 * else's text.
 *
 * One component, both places it appears: the live Results tab and the
 * end-of-lesson recap. A student who has been switching between these halves
 * all lesson must not be handed a different control at the recap — the same
 * argument that made the recap show the live board rather than a second one.
 */
export const ResultsSwitch: m.Component<ResultsSwitchAttrs> = {
	view(vnode) {
		const { tab, onTab, thanks } = vnode.attrs;
		const button = (
			kind: ResultsTab,
			label: string,
			icon: 'chart' | 'helped',
			count?: number,
		): m.Children =>
			m(
				'button.results__switch-btn',
				{
					type: 'button',
					role: 'tab',
					'aria-selected': String(tab === kind),
					onclick: () => onTab(kind),
				},
				[
					m(Icon, { name: icon, size: 18 }),
					m('span', label),
					count !== undefined && count > 0
						? m('span.results__switch-count', { 'aria-hidden': 'true' }, String(count))
						: null,
				],
			);

		return m('.results__switch', { role: 'tablist', 'aria-label': t('results.switch_aria') }, [
			button('class', t('results.tab_class'), 'chart'),
			button('helpers', t('results.tab_helpers'), 'helped', thanks),
		]);
	},
};

/** Thank-yous exchanged across the class — the badge on the helpers half */
export function countThanks(participants: readonly { points: { helping: number } }[]): number {
	return participants.reduce((sum, participant) => sum + participant.points.helping, 0);
}
