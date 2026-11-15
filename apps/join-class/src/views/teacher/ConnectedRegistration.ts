import m from 'mithril';
import type { ClassRegistration, Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { watchedRegistration } from '@/lib/classroom/registrationData';
import {
	canCloseRegistration,
	isSeatingCopied,
	registrationStatusKey,
	tablesRegistrationUrl,
} from '@/lib/classroom/registrationLogic';
import { askConfirm } from './ConfirmDialog';
import { isBusy } from './consoleState';
import { closeRegistration, disconnectRegistration } from './registrationActions';

/**
 * The connected state of "הרשמה מראש": the registration's name and status, who
 * arrived of who registered, the way to manage it in Tables, closing it from
 * Class, and removing it from the lesson (until the seating is copied).
 */

export interface ConnectedRegistrationAttrs {
	mid: string;
	main: Statement;
	registration: ClassRegistration;
}

function confirmClose(mid: string): void {
	askConfirm({
		title: t('console.register_ahead.close_title'),
		body: t('console.register_ahead.close_body'),
		yesLabel: t('console.register_ahead.close_yes'),
		destructive: false,
		run: () => void closeRegistration(mid),
	});
}

function confirmRemove(mid: string): void {
	askConfirm({
		title: t('console.register_ahead.remove_title'),
		body: t('console.register_ahead.remove_body'),
		yesLabel: t('console.register_ahead.remove_yes'),
		destructive: true,
		run: () => void disconnectRegistration(mid),
	});
}

export const ConnectedRegistration: m.Component<ConnectedRegistrationAttrs> = {
	view({ attrs }) {
		const { mid, main, registration } = attrs;
		const assignment = watchedRegistration.assignment;
		const registered = watchedRegistration.registered;
		const copied = isSeatingCopied(main);
		const title = assignment?.title ?? t('console.register_ahead');
		const arrived = registration.arrivedCount ?? 0;

		return m('section.registration-card', { 'data-testid': 'registration-connected' }, [
			m('h2.registration-card__title', { dir: 'auto' }, title),
			m(
				'p.registration-card__status',
				assignment ? t(registrationStatusKey(assignment.status)) : t('plan.loading'),
			),
			registered === null
				? null
				: m(
						'p.registration-card__arrived',
						{ 'data-testid': 'registration-arrived', role: 'status' },
						t('console.register_ahead.arrived', { arrived, registered }),
					),
			watchedRegistration.loaded && !assignment
				? m('p.registration-card__gone', { role: 'alert' }, t('console.register_ahead.gone'))
				: null,
			registration.sideStepRemoved
				? m('p.registration-card__note', t('console.register_ahead.side_removed'))
				: null,
			m('div.registration-card__actions', [
				m(
					'a.btn.btn--secondary',
					{
						href: tablesRegistrationUrl(registration.tableAssignmentId),
						target: '_blank',
						rel: 'noopener',
						'data-testid': 'registration-manage',
					},
					t('console.register_ahead.manage'),
				),
				canCloseRegistration(assignment?.status)
					? m(
							'button.btn.btn--secondary',
							{
								type: 'button',
								'data-testid': 'registration-close',
								disabled: isBusy('registration:close'),
								onclick: () => confirmClose(mid),
							},
							t('console.register_ahead.close'),
						)
					: null,
				m(
					'button.btn.btn--danger-outline',
					{
						type: 'button',
						'data-testid': 'registration-remove',
						disabled: copied || isBusy('registration:disconnect'),
						'aria-describedby': copied ? 'registration-remove-locked' : undefined,
						onclick: () => confirmRemove(mid),
					},
					t('console.register_ahead.remove'),
				),
			]),
			copied
				? m(
						'p.registration-card__note#registration-remove-locked',
						t('console.register_ahead.remove_locked'),
					)
				: null,
		]);
	},
};
