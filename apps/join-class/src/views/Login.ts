import m from 'mithril';
import { signInWithGoogle, waitForAuthReady, isSignedIn } from '@/lib/user';
import { t } from '@/lib/i18n';
import { SplashLoader } from '@/views/Splash';
import { BrandLogo } from '@/components/BrandLogo';

let busy = false;
let error: string | null = null;
let booting = true;

function nextRoute(): string {
	const params = new URLSearchParams(window.location.search);
	const next = params.get('next');
	// Guard against open-redirect: only allow same-origin paths starting with `/`.
	if (next && next.startsWith('/') && !next.startsWith('//')) return next;

	return '/t';
}

async function handleGoogle(): Promise<void> {
	if (busy) return;
	busy = true;
	error = null;
	m.redraw();
	try {
		await signInWithGoogle();
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

		return m('.login', [
			m('.login__card', [
				m(BrandLogo, { size: 72, className: 'login__logo' }),
				m('h1.login__title', t('login.title')),
				m('p.login__tagline', t('login.tagline')),
				error ? m('.login__error', { role: 'alert' }, error) : null,
				m('.login__actions', [
					m(
						'button.login__btn.login__btn--google',
						{
							type: 'button',
							disabled: busy,
							'aria-busy': busy ? 'true' : undefined,
							onclick: handleGoogle,
						},
						[
							m('span.login__btn-icon', { 'aria-hidden': 'true' }, 'G'),
							m('span.login__btn-label', busy ? t('login.signing_in') : t('login.google')),
						],
					),
				]),
				m('p.login__hint', t('login.hint')),
			]),
		]);
	},
};
