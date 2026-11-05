import m from 'mithril';
import { t } from '@/lib/i18n';
import type { RouteDef } from '@/routes';

/**
 * A placeholder screen: the app name, the screen's translated title and a
 * "under construction" line. Real screens replace this per route.
 */
export function placeholderView(route: RouteDef): m.Component {
	return {
		view(): m.Vnode {
			return m('main.placeholder', { 'data-route': route.path }, [
				m('p.placeholder__app', t('tableAssignment.app')),
				m('h1.placeholder__title', t(route.titleKey)),
				m('p.placeholder__note', t('tableAssignment.placeholder.soon')),
			]);
		},
	};
}
