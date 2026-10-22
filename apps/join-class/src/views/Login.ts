import m from 'mithril';
import { getUserState, isGoogleSignedIn, signInWithGoogle, waitForAuthReady } from '@/lib/user';
import { ownsClassLessons } from '@/lib/joinSubscriptions';
import { t } from '@/lib/i18n';
import { SplashLoader } from '@/views/Splash';
import { BrandLogo } from '@/components/BrandLogo';

/**
 * `/login` - teacher sign-in. Google only (IA 13.4): a lesson belongs to the
 * account that created it, and a guest account lives in one browser. Students
 * never sign in. After sign-in the teacher goes back to `?next=`, default `/t`.
 */

const DEFAULT_NEXT = '/t';

let busy = false;
let error: string | null = null;
let booting = true;
/** Decided before the click so the popup opens inside the gesture (see user.ts). */
let linkAnonymous = false;

function nextRoute(): string {
	const params = new URLSearchParams(window.location.search);
	const next = params.get('next') ?? m.route.param('next');
	// Guard against open-redirect: only allow same-origin paths starting with `/`.
	if (typeof next === 'string' && next.startsWith('/') && !next.startsWith('//')) return next;

	return DEFAULT_NEXT;
}

async function handleGoogle(): Promise<void> {
	if (busy) return;
	busy = true;
	error = null;
	m.redraw();
	try {
		await signInWithGoogle({ linkAnonymous });
		m.route.set(nextRoute());
	} catch (err) {
		console.error('[Login] Google sign-in failed:', err);
		error = t('login.error.failed');
	} finally {
		busy = false;
		m.redraw();
	}
}

export const Login: m.Component = {
	async oninit() {
		booting = true;
		error = null;
		busy = false;
		linkAnonymous = false;
		await waitForAuthReady();
		if (isGoogleSignedIn()) {
			booting = false;
			m.route.set(nextRoute(), undefined, { replace: true });

			return;
		}
		const user = getUserState().user;
		if (user?.isAnonymous) linkAnonymous = await ownsClassLessons(user.uid);
		booting = false;
		m.redraw();
	},

	view() {
		if (booting) return m(SplashLoader);

		return m('main.door', [
			m('header.door__header', m(BrandLogo, { size: 48, className: 'door__logo' })),
			m('h1.door__title', t('login.title')),
			m('p.door__line', t('login.tagline')),
			error ? m('p.door__error-title', { role: 'alert' }, error) : null,
			m(
				'button.door__google',
				{
					type: 'button',
					disabled: busy,
					'aria-busy': busy ? 'true' : undefined,
					onclick: handleGoogle,
				},
				[
					m('span.door__google-mark', { 'aria-hidden': 'true' }, 'G'),
					m('span', busy ? t('login.signing_in') : t('login.google')),
				],
			),
			m('.door__alt', [
				m('p', t('login.hint')),
				m(m.route.Link, { class: 'btn btn--tertiary', href: '/' }, t('login.have_code')),
			]),
		]);
	},
};
