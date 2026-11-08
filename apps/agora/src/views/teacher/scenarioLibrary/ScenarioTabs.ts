import m from 'mithril';
import { AgoraTopicPackage } from '@freedi/shared-types';
import { t } from '../../../lib/i18n';
import { ScenarioDiscussion } from './ScenarioDiscussion';
import { ScenarioFeedback } from './ScenarioFeedback';

export interface ScenarioTabsAttrs {
	scenario: AgoraTopicPackage;
	mine: boolean;
	onChanged: () => void;
}

type Tab = 'reviews' | 'discussion';

const TABS: readonly Tab[] = ['reviews', 'discussion'];

/**
 * Under the lesson preview: the reviews and the discussion, one tab each. A
 * proper tab list (arrow keys move between tabs, only the open tab is in the
 * tab order), with the counts the server keeps on the scenario.
 */
export function ScenarioTabs(): m.Component<ScenarioTabsAttrs> {
	let active: Tab = 'reviews';

	function label(tab: Tab, scenario: AgoraTopicPackage): string {
		const count =
			tab === 'reviews' ? (scenario.stats?.ratingCount ?? 0) : (scenario.stats?.postCount ?? 0);
		const name = t(tab === 'reviews' ? 'scenlib.tab_reviews' : 'scenlib.tab_discussion');

		return count > 0 ? `${name} (${count})` : name;
	}

	function onKey(event: KeyboardEvent): void {
		const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
		if (!step) return;
		event.preventDefault();
		const rtl = document.documentElement.dir === 'rtl';
		const next = TABS[(TABS.indexOf(active) + (rtl ? -step : step) + TABS.length) % TABS.length];
		active = next;
		requestAnimationFrame(() => document.getElementById(`scn-tab-${next}`)?.focus());
	}

	return {
		view({ attrs }) {
			const { scenario } = attrs;

			return m('section.scn-tabs', [
				m(
					'.scn-tabs__list',
					{ role: 'tablist', 'aria-label': t('scenlib.tabs'), onkeydown: onKey },
					TABS.map((tab) =>
						m(
							'button.scn-tabs__tab',
							{
								key: tab,
								id: `scn-tab-${tab}`,
								type: 'button',
								role: 'tab',
								'aria-selected': active === tab ? 'true' : 'false',
								'aria-controls': `scn-panel-${tab}`,
								tabindex: active === tab ? 0 : -1,
								onclick: () => {
									active = tab;
								},
							},
							label(tab, scenario),
						),
					),
				),
				m(
					'.scn-tabs__panel',
					{
						id: `scn-panel-${active}`,
						role: 'tabpanel',
						'aria-labelledby': `scn-tab-${active}`,
					},
					active === 'reviews'
						? m(ScenarioFeedback, attrs)
						: m(ScenarioDiscussion, { scenario, mine: attrs.mine, onChanged: attrs.onChanged }),
				),
			]);
		},
	};
}
