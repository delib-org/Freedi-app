import m from 'mithril';
import { ensureUser } from '@/lib/user';
import { normalizeClassCode, resolveClassCode } from '@/lib/lesson';
import { SplashLoader } from '@/views/Splash';
import type { DoorError } from '@/views/FrontDoor';

/**
 * `/c/:code` - a student types the six digits (or scans the QR); the code is
 * resolved and this route is replaced with the lesson `/m/:mid`. It has no
 * screen of its own: an unknown code (or a lookup that failed, e.g. no network)
 * goes back to the front door with the code filled in and the reason flagged,
 * so there is never a dead end.
 */

function backToDoor(code: string | null, error: DoorError): void {
	m.route.set('/', code ? { code, error } : { error }, { replace: true });
}

async function resolve(): Promise<void> {
	const raw = m.route.param('code');
	const code = typeof raw === 'string' ? normalizeClassCode(raw) : null;
	if (!code) {
		backToDoor(null, 'unknown');

		return;
	}
	try {
		await ensureUser();
		const mainId = await resolveClassCode(code);
		if (mainId) {
			m.route.set(`/m/${mainId}`, undefined, { replace: true });

			return;
		}
		backToDoor(code, 'unknown');
	} catch (err) {
		console.error('[ClassCode] resolve failed:', err);
		backToDoor(code, 'offline');
	}
}

export const ClassCode: m.Component = {
	oninit() {
		void resolve();
	},

	view() {
		return m(SplashLoader);
	},
};
