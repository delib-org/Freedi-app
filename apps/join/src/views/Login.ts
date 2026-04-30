import m from 'mithril';
import { signInWithGoogle, signInAsGuest, waitForAuthReady, isSignedIn } from '@/lib/user';
import { t, isRTL } from '@/lib/i18n';
import { SplashLoader } from '@/views/Splash';

let busy: 'google' | 'guest' | null = null;
let error: string | null = null;
let booting = true;

function nextRoute(): string {
	const params = new URLSearchParams(window.location.search);
	const next = params.get('next');
	// Guard against open-redirect: only allow same-origin paths starting with `/`.
	if (next && next.startsWith('/') && !next.startsWith('//')) return next;

	return '/';
}

async function handleGoogle(): Promise<void> {
	if (busy) return;
	busy = 'google';
	error = null;
	m.redraw();
	try {
		await signInWithGoogle();
		m.route.set(nextRoute());
	} catch (err) {
		console.error('[Login] Google sign-in failed:', err);
		error = t('login.error.failed');
	} finally {
		busy = null;
		m.redraw();
	}
}

async function handleGuest(): Promise<void> {
	if (busy) return;
	busy = 'guest';
	error = null;
	m.redraw();
	try {
		await signInAsGuest();
		m.route.set(nextRoute());
	} catch (err) {
		console.error('[Login] Guest sign-in failed:', err);
		error = t('login.error.failed');
	} finally {
		busy = null;
		m.redraw();
	}
}

export const Login: m.Component = {
	async oninit() {
		booting = true;
		error = null;
		busy = null;
		await waitForAuthReady();
		booting = false;
		// Already signed in? Skip the login surface and bounce to the
		// intended destination (or the main page).
		if (isSignedIn()) {
			m.route.set(nextRoute());

			return;
		}
		m.redraw();
	},

	view() {
		if (booting) {
			return m(SplashLoader);
		}

		const logoSrc = isRTL() ? '/wizcol-logo-rtl.png' : '/wizcol-logo-ltr.png';

		return m('.login', [
			m('.login__card', [
				m('img.login__logo', {
					src: logoSrc,
					alt: 'WizCol',
					width: 72,
					height: 72,
					loading: 'eager',
					decoding: 'async',
				}),
				m('h1.login__title', t('login.title')),
				m('p.login__tagline', t('login.tagline')),
				error ? m('.login__error', { role: 'alert' }, error) : null,
				m('.login__actions', [
					m(
						'button.login__btn.login__btn--google',
						{
							type: 'button',
							disabled: busy !== null,
							'aria-busy': busy === 'google' ? 'true' : undefined,
							onclick: handleGoogle,
						},
						[
							m('span.login__btn-icon', { 'aria-hidden': 'true' }, 'G'),
							m(
								'span.login__btn-label',
								busy === 'google' ? t('login.signing_in') : t('login.google'),
							),
						],
					),
					m('.login__divider', m('span', t('login.or'))),
					m(
						'button.login__btn.login__btn--guest',
						{
							type: 'button',
							disabled: busy !== null,
							'aria-busy': busy === 'guest' ? 'true' : undefined,
							onclick: handleGuest,
						},
						busy === 'guest' ? t('login.signing_in') : t('login.guest'),
					),
				]),
				m('p.login__hint', t('login.hint')),
			]),
		]);
	},
};
