import m from 'mithril';
import { isAdmin } from '@/lib/admin';
import { t } from '@/lib/i18n';

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
 * The chevron is always the `‹` glyph; pointing it along the reading axis is
 * done in CSS (`.back-button__chevron` isolates it from bidi mirroring and
 * flips it under `[dir='rtl']`). Swapping the glyph here instead does NOT
 * work: `‹`/`›` are bidi-mirrored characters, so a `›` written into an RTL
 * paragraph is rendered mirrored and points left again.
 */
export const BackButton: m.Component<BackButtonAttrs> = {
	view(vnode) {
		const { to, allowParticipants } = vnode.attrs;
		if (!isAdmin() && !allowParticipants) return null;

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
			m('span.back-button__chevron', { 'aria-hidden': 'true' }, '‹'),
		);
	},
};
