import m from 'mithril';
import { ensureUser } from '@/lib/user';
import { normalizeClassCode, resolveClassCode } from '@/lib/lesson';
import { t } from '@/lib/i18n';
import { SplashLoader } from '@/views/Splash';
import { BrandLogo } from '@/components/BrandLogo';

type CodeState = 'resolving' | 'unknown';

let state: CodeState = 'resolving';

/** `/c/:code` - a student types the six digits (or scans the QR); we resolve
 *  the code and replace this route with the workspace hub `/m/:mid`. */
async function resolve(): Promise<void> {
	state = 'resolving';
	const raw = m.route.param('code');
	const code = typeof raw === 'string' ? normalizeClassCode(raw) : null;
	if (!code) {
		state = 'unknown';
		m.redraw();

		return;
	}
	try {
		await ensureUser();
		const mainId = await resolveClassCode(code);
		if (mainId) {
			m.route.set(`/m/${mainId}`, undefined, { replace: true });

			return;
		}
	} catch (err) {
		console.error('[ClassCode] resolve failed:', err);
	}
	state = 'unknown';
	m.redraw();
}

export const ClassCode: m.Component = {
	oninit() {
		void resolve();
	},

	view() {
		if (state === 'resolving') return m(SplashLoader);

		return m('.login', [
			m('.login__card', { role: 'alert' }, [
				m(BrandLogo, { size: 72, className: 'login__logo' }),
				m('h1.login__title', t('lesson.code.unknown.title')),
				m('p', t('lesson.code.unknown.body')),
			]),
		]);
	},
};
