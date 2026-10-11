import m from 'mithril';
import { t } from '../../lib/i18n';
import { Icon } from '../../components/Icon';
import type { DeviceRole } from '../../lib/flows/deviceRole';

/**
 * "Where is this screen?" — asked once per device before the console draws
 * anything with a name on it, and again (as a confirm) when a screen that
 * declared itself a wall asks to show names after all.
 *
 * No button is focused by default: a stray Enter on a projected laptop
 * must not choose "show names". Both answers are the same size and
 * neither is styled as the primary one, because neither is wrong — the
 * sheet is a question, not a nudge.
 */
export interface DeviceRoleSheetAttrs {
	/** `ask`: the first question. `confirm`: a wall wants to show names. */
	mode: 'ask' | 'confirm';
	onChoose: (role: DeviceRole) => void;
	/** The confirm's way out without changing anything */
	onKeep?: () => void;
}

export function DeviceRoleSheet(): m.Component<DeviceRoleSheetAttrs> {
	return {
		view({ attrs }) {
			const { mode, onChoose, onKeep } = attrs;
			const confirm = mode === 'confirm';

			return m('.device-role__scrim', [
				m(
					'.device-role',
					{
						role: 'dialog',
						'aria-modal': 'true',
						'aria-labelledby': 'device-role-title',
						'data-mode': mode,
						onkeydown: (event: KeyboardEvent) => {
							if (event.key === 'Escape' && confirm) onKeep?.();
						},
					},
					[
						m(
							'h2#device-role-title',
							confirm ? t('teacher.device.to_private_title') : t('teacher.device.title'),
						),
						m(
							'p.device-role__lead',
							confirm ? t('teacher.device.to_private_body') : t('teacher.device.lead'),
						),
						confirm
							? m('.device-role__choices', [
									m(
										'button.btn.btn--secondary.btn--lg.device-role__choice',
										{ type: 'button', 'data-role': 'private', onclick: () => onChoose('private') },
										[
											m(Icon, { name: 'people', size: 22 }),
											m('span', t('teacher.device.to_private_ok')),
										],
									),
									m(
										'button.btn.btn--primary.btn--lg.device-role__choice',
										{ type: 'button', 'data-role': 'wall', onclick: () => onKeep?.() },
										[
											m(Icon, { name: 'era', size: 22 }),
											m('span', t('teacher.device.keep_hidden')),
										],
									),
								])
							: m('.device-role__choices', [
									m(
										'button.btn.btn--secondary.btn--lg.device-role__choice',
										{ type: 'button', 'data-role': 'private', onclick: () => onChoose('private') },
										[
											m(Icon, { name: 'people', size: 22 }),
											m('span.device-role__label', t('teacher.device.private')),
											m('small.device-role__hint', t('teacher.device.private_hint')),
										],
									),
									m(
										'button.btn.btn--secondary.btn--lg.device-role__choice',
										{ type: 'button', 'data-role': 'wall', onclick: () => onChoose('wall') },
										[
											m(Icon, { name: 'era', size: 22 }),
											m('span.device-role__label', t('teacher.device.wall')),
											m('small.device-role__hint', t('teacher.device.wall_hint')),
										],
									),
								]),
					],
				),
			]);
		},
	};
}
