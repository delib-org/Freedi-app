import m from 'mithril';
import { t } from '@/lib/i18n';
import { getLiveDrafts } from '@/lib/liveDrafts';

interface LiveDraftBannerAttrs {
	onOpen: () => void;
}

/** Compact "someone is writing live" strip on the Solutions view. Renders
 *  nothing when no one (other than the viewer themself) is broadcasting, so
 *  a broadcaster working alone sees a clean list. The whole strip is one
 *  button that opens the full-screen watch overlay. */
export const LiveDraftBanner: m.Component<LiveDraftBannerAttrs> = {
	view(vnode) {
		const drafts = getLiveDrafts({ excludeSelf: true });
		if (drafts.length === 0) return null;

		const text =
			drafts.length === 1
				? t('live.banner.one', { name: drafts[0].displayName })
				: t('live.banner.many', { count: String(drafts.length) });

		return m(
			'button.live-banner',
			{
				type: 'button',
				'aria-label': `${text} — ${t('live.banner.watch')}`,
				onclick: vnode.attrs.onOpen,
			},
			[
				m('span.live-banner__dot', { 'aria-hidden': 'true' }),
				m('span.live-banner__text', text),
				m('span.live-banner__cta', t('live.banner.watch')),
			],
		);
	},
};
