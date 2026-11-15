import m from 'mithril';
import type { TableAssignment } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { registrationStatusKey } from '@/lib/classroom/registrationLogic';

/**
 * One registration in the chooser of "הרשמה מראש": its name, its status in words
 * (never colour alone) and the one button, "חיבור לשיעור". The row never shows a
 * person's position or topic choices.
 */

export interface RegistrationRowAttrs {
	row: TableAssignment;
	busy: boolean;
	onConnect: () => void;
}

export const RegistrationRow: m.Component<RegistrationRowAttrs> = {
	view({ attrs }) {
		const { row } = attrs;

		return m('li.registration-row', { 'data-testid': 'registration-row' }, [
			m('div.registration-row__text', [
				m('span.registration-row__title', { dir: 'auto' }, row.title),
				m('span.registration-row__status', t(registrationStatusKey(row.status))),
			]),
			m(
				'button.btn.btn--primary.registration-row__connect',
				{
					type: 'button',
					'data-testid': 'registration-connect',
					disabled: attrs.busy,
					'aria-busy': attrs.busy ? 'true' : undefined,
					'aria-label': `${t('console.register_ahead.connect')}: ${row.title}`,
					onclick: attrs.onConnect,
				},
				t('console.register_ahead.connect'),
			),
		]);
	},
};
