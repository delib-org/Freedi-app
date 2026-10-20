import m from 'mithril';
import { t } from '../lib/i18n';
import { Icon } from './Icon';
import type { StationVisitState } from '@freedi/shared-types';

export interface LinkedStationAttrs {
	/** What the station is called: the teacher's title, else the linked question */
	title: string;
	/** "What to do there", in the teacher's words */
	explanation?: string;
	/** The room has reached this station */
	open: boolean;
	/** Where the way in stands: prefetched, still coming, or the server never answered */
	link: 'ready' | 'preparing' | 'failed';
	visit: StationVisitState;
	/** The student just came back to this station */
	welcomeBack: boolean;
	/** In the village the panel's header already names the station */
	showTitle?: boolean;
	onOpen: () => void;
	onRetry: () => void;
}

/**
 * A station whose task lives in another app: its title, what to do there,
 * and ONE action — "Open the task" (docs/ia/agora-linked-app-stations.md §5).
 * Props in, vnodes out: the prefetch, the tab and the stamps live in
 * `lib/stationHandoff`.
 */
export const LinkedStation: m.Component<LinkedStationAttrs> = {
	view({ attrs }) {
		const { title, explanation, open, link, visit, welcomeBack, onOpen, onRetry } = attrs;
		const showTitle = attrs.showTitle ?? true;

		const action = ((): m.Children => {
			if (!open) return m('p.linked-station__note', t('linked.closed'));
			if (link === 'failed') {
				return [
					m('p.linked-station__error', { role: 'alert' }, t('linked.err_offline')),
					m(
						'button.btn.btn--secondary.linked-station__go',
						{ type: 'button', onclick: onRetry },
						t('linked.retry'),
					),
				];
			}

			return m(
				'button.btn.btn--primary.btn--lg.linked-station__go',
				{
					type: 'button',
					disabled: link !== 'ready',
					'aria-busy': link === 'preparing' ? 'true' : undefined,
					onclick: onOpen,
				},
				[
					m(Icon, { name: 'target', size: 20 }),
					link === 'ready' ? t('linked.open') : t('linked.opening'),
				],
			);
		})();

		return m('section.linked-station', { 'aria-labelledby': 'linked-station-title' }, [
			welcomeBack
				? m('p.linked-station__welcome', { role: 'status' }, [
						m(Icon, { name: 'check', size: 18 }),
						t('linked.welcome_back'),
					])
				: null,
			m('p.linked-station__kicker', t('linked.kicker')),
			showTitle
				? m('h2.linked-station__title#linked-station-title', title)
				: m('span.sr-only#linked-station-title', title),
			explanation ? m('p.linked-station__todo', explanation) : null,
			action,
			visit === 'opened' && !welcomeBack && open
				? m('p.linked-station__note', t('linked.opened_hint'))
				: null,
		]);
	},
};
