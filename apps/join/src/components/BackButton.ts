import m from 'mithril';
import { isAdmin } from '@/lib/admin';
import { t, isRTL } from '@/lib/i18n';

export interface BackButtonAttrs {
	/** Mithril route to navigate to when pressed (e.g. `/m/abc` for the hub). */
	to: string;
	/** Also render for non-admins. Callers pass this when the facilitator has
	 *  switched on `allowParticipantNavigation` on the hub, which lets
	 *  participants walk back to the question list themselves. */
	allowParticipants?: boolean;
}

/**
 * iOS-style back button pinned to the top inline-start corner (LTR →
 * top-left, RTL → top-right). Renders for admins always; for participants
 * only when the caller passes `allowParticipants` — otherwise non-admins in
 * facilitated mode are driven by `powerFollowMe` and shouldn't be steering
 * themselves away from the facilitator.
 *
 * The chevron glyph is direction-aware (`‹` in LTR, `›` in RTL) so it
 * always points "back" along the reading axis without per-language
 * overrides on the SVG side.
 */
export const BackButton: m.Component<BackButtonAttrs> = {
	view(vnode) {
		const { to, allowParticipants } = vnode.attrs;
		if (!isAdmin() && !allowParticipants) return null;
		const glyph = isRTL() ? '›' : '‹';

		return m(
			'button.back-button',
			{
				type: 'button',
				title: t('nav.back'),
				'aria-label': t('nav.back'),
				onclick: (e: Event) => {
					e.preventDefault();
					m.route.set(to);
				},
			},
			m('span.back-button__chevron', { 'aria-hidden': 'true' }, glyph),
		);
	},
};
