import m from 'mithril';
import '@/styles/registration.scss';
import type { ClassRegistration } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { watchedRegistration } from '@/lib/classroom/registrationData';
import { registrationStatusKey } from '@/lib/classroom/registrationLogic';

/**
 * The console's two doors to "הרשמה מראש" (IA tables-class-bridge 5):
 *  - `RegisterAheadRow`: while the room waits and no registration is connected,
 *    one line and one button under the console bar.
 *  - `RegistrationStrip`: once connected, one strip with the registration's
 *    status and "N מתוך M הגיעו"; the whole strip opens the registration page.
 */

export interface RegisterAheadRowAttrs {
	mid: string;
}

export const RegisterAheadRow: m.Component<RegisterAheadRowAttrs> = {
	view({ attrs }) {
		return m('section.console__register-ahead', { 'data-testid': 'register-ahead-row' }, [
			m('p.console__register-ahead__line', t('console.register_ahead.prompt')),
			m(
				m.route.Link,
				{ class: 'btn btn--tertiary', href: `/t/${attrs.mid}/registration` },
				t('console.register_ahead'),
			),
		]);
	},
};

export interface RegistrationStripAttrs {
	mid: string;
	registration: ClassRegistration;
}

export const RegistrationStrip: m.Component<RegistrationStripAttrs> = {
	view({ attrs }) {
		const assignment = watchedRegistration.assignment;
		const registered = watchedRegistration.registered;
		const arrived = attrs.registration.arrivedCount ?? 0;

		return m(
			m.route.Link,
			{
				class: 'console__registration',
				href: `/t/${attrs.mid}/registration`,
				'data-testid': 'registration-strip',
			},
			[
				m('span.console__registration__name', t('console.register_ahead')),
				assignment ? m('span', t(registrationStatusKey(assignment.status))) : null,
				registered === null
					? null
					: m('span', t('console.register_ahead.arrived', { arrived, registered })),
			],
		);
	},
};
