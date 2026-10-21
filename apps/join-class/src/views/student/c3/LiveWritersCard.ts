import m from 'mithril';
import { t } from '@/lib/i18n';
import { getLiveDrafts } from '@/lib/liveDrafts';

/**
 * The dashed "● n are writing now" card on top of the rate list (Join's
 * live-draft banner idea): drafts broadcast by other students, live from
 * Realtime Database. Nothing is drawn when nobody is broadcasting.
 */
export const LiveWritersCard: m.Component = {
	view() {
		const drafts = getLiveDrafts({ excludeSelf: true }).filter((d) => d.text.trim().length > 0);
		if (drafts.length === 0) return null;
		const text =
			drafts.length === 1
				? t('rate.live_one', { name: drafts[0].displayName })
				: t('rate.live_many', { count: drafts.length });

		return m('p.live-writers', { role: 'status' }, [
			m('span.live-writers__dot', { 'aria-hidden': 'true' }, '●'),
			` ${text}`,
		]);
	},
};
