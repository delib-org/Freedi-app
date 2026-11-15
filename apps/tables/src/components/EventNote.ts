import m from 'mithril';
import type { TableAssignment } from '@freedi/shared-types';
import { getLang, t } from '@/lib/i18n';
import { eventLine } from '@/logic/eventLine';

/** "See you on 19 March at 17:00, Community club": nothing at all when the host set none of it. */
export const EventNote: m.Component<{ session: Pick<TableAssignment, 'settings'> }> = {
	view({ attrs }) {
		const line = eventLine(attrs.session.settings.event, getLang(), t);

		return line ? m('p.notice.event-note', { dir: 'auto' }, line) : null;
	},
};
