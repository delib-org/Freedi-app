import m from 'mithril';
import { ensureUser } from '@/lib/user';
import { t } from '@/lib/i18n';
import { setCustomDisplayName } from '@/lib/store';
import { exchangeSeatCode } from '@/lib/classroom/seatExchange';
import type { SeatOutcome } from '@/lib/classroom/seatExchange';
import { SplashLoader } from '@/views/Splash';
import { BrandLogo } from '@/components/BrandLogo';

/**
 * `/seat/:seatCode` - the personal link from "השולחן שלי" in Tables. No screen of
 * its own while it works (the splash); then the route is replaced with the
 * lesson. A dead link says so in plain words and offers the normal way in: the
 * class code box and the full name (IA tables-class-bridge 7).
 */

type Phase = 'loading' | 'inactive' | 'offline';

interface SeatState {
	phase: Phase;
	removed: boolean;
}

async function exchange(state: SeatState): Promise<void> {
	state.phase = 'loading';
	m.redraw();
	let outcome: SeatOutcome;
	try {
		await ensureUser();
		outcome = await exchangeSeatCode(m.route.param('seatCode'));
	} catch (error) {
		console.error('[SeatExchange] sign-in failed:', error);
		outcome = { kind: 'offline' };
	}
	if (state.removed) return;
	if (outcome.kind === 'go') {
		// The registration's name is the member's name here: the name form never asks again.
		setCustomDisplayName(outcome.fullName);
		m.route.set(outcome.href, undefined, { replace: true });

		return;
	}
	state.phase = outcome.kind;
	m.redraw();
}

function focusHeading(vnode: m.VnodeDOM): void {
	(vnode.dom as HTMLElement).focus();
}

export const SeatExchange: m.Component = {
	oninit(vnode) {
		const state = vnode.state as unknown as SeatState;
		state.removed = false;
		void exchange(state);
	},

	onremove(vnode) {
		(vnode.state as unknown as SeatState).removed = true;
	},

	view(vnode) {
		const state = vnode.state as unknown as SeatState;
		if (state.phase === 'loading') return m(SplashLoader);
		const inactive = state.phase === 'inactive';

		return m('main.door', { 'data-testid': inactive ? 'seat-inactive' : 'seat-offline' }, [
			m('header.door__header', m(BrandLogo, { size: 48, className: 'door__logo' })),
			m(
				'h1.door__title',
				{ tabindex: '-1', oncreate: focusHeading },
				t(inactive ? 'seat.invalid.title' : 'lesson.code.offline'),
			),
			inactive ? m('p.door__error-body', t('seat.invalid.body')) : null,
			inactive
				? m(
						m.route.Link,
						{ class: 'btn btn--primary door__enter', href: '/' },
						t('login.have_code'),
					)
				: m(
						'button.btn.btn--primary.door__enter',
						{ type: 'button', onclick: () => void exchange(state) },
						t('console.retry'),
					),
		]);
	},
};
