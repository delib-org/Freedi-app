import m from 'mithril';
import { t } from '../lib/i18n';
import { AGORA_CLASSROOM } from '@freedi/shared-types';
import type { ClassJoinEvent, ClassJoinState } from '../lib/flows/classJoin';

export interface ClassJoinPanelAttrs {
	state: ClassJoinState;
	alias: string;
	pin: string;
	onAlias: (value: string) => void;
	onPin: (value: string) => void;
	dispatch: (event: ClassJoinEvent) => void;
}

/**
 * The one-time "join your class" step: claim a nickname (new student) or pick
 * your alias and type the rejoin PIN (returning student on a new device).
 * Props in, vnodes out — the network lives in the view's dispatcher.
 */
export const ClassJoinPanel: m.Component<ClassJoinPanelAttrs> = {
	view({ attrs }) {
		const { state, alias, pin, onAlias, onPin, dispatch } = attrs;

		const error = state.errorKey ? m('p.join__error', t(state.errorKey)) : null;

		if (state.step === 'busy') {
			return m('.card.stack.class-join', [m('.spinner'), null]);
		}

		if (state.step === 'choice') {
			return m('.card.stack.class-join', [
				m('h3.text-center', t('classJoin.title')),
				m('p.text-center.home-explanation', t('classJoin.explain')),
				error,
				m(
					'button.btn.btn--primary.btn--full',
					{ onclick: () => dispatch({ kind: 'choose-new' }) },
					t('classJoin.im_new'),
				),
				m(
					'button.btn.btn--secondary.btn--full',
					{ onclick: () => dispatch({ kind: 'choose-returning' }) },
					t('classJoin.new_device'),
				),
			]);
		}

		if (state.step === 'claim') {
			return m('.card.stack.class-join', [
				m('h3.text-center', t('classJoin.pick_nickname')),
				m('p.text-center.home-explanation', t('classJoin.nickname_hint')),
				error,
				m('input.input.class-join__alias', {
					value: alias,
					maxlength: AGORA_CLASSROOM.MAX_ALIAS_LENGTH,
					placeholder: t('classJoin.nickname_placeholder'),
					oninput: (event: InputEvent) => onAlias((event.target as HTMLInputElement).value),
				}),
				m(
					'button.btn.btn--primary.btn--full',
					{
						disabled: alias.trim().length < AGORA_CLASSROOM.MIN_ALIAS_LENGTH,
						onclick: () => dispatch({ kind: 'submit' }),
					},
					t('common.continue'),
				),
				m(
					'button.btn.btn--ghost.btn--full',
					{ onclick: () => dispatch({ kind: 'back' }) },
					t('common.back'),
				),
			]);
		}

		if (state.step === 'pin-keep') {
			return m('.card.stack.class-join', [
				m('h3.text-center', t('classJoin.pin_title')),
				m('.class-join__pin-display', state.pin ?? ''),
				m('p.text-center.home-explanation', t('classJoin.pin_keep')),
				m(
					'button.btn.btn--primary.btn--full',
					{ onclick: () => dispatch({ kind: 'pin-acknowledged' }) },
					t('classJoin.pin_saved'),
				),
			]);
		}

		if (state.step === 'pick') {
			return m('.card.stack.class-join', [
				m('h3.text-center', t('classJoin.pick_yourself')),
				error,
				state.aliases.length === 0
					? m('p.text-center.home-explanation', t('classJoin.no_aliases'))
					: m(
							'.class-join__alias-list',
							state.aliases.map((row) =>
								m(
									'button.class-join__alias-option',
									{
										key: row.memberId,
										onclick: () => dispatch({ kind: 'picked', memberId: row.memberId }),
									},
									row.alias,
								),
							),
						),
				m(
					'button.btn.btn--ghost.btn--full',
					{ onclick: () => dispatch({ kind: 'back' }) },
					t('common.back'),
				),
			]);
		}

		if (state.step === 'pin-entry') {
			return m('.card.stack.class-join', [
				m('h3.text-center', t('classJoin.pin_entry')),
				m('p.text-center.home-explanation', t('classJoin.pin_entry_hint')),
				error,
				m('input.input.class-join__pin', {
					value: pin,
					inputmode: 'numeric',
					maxlength: AGORA_CLASSROOM.PIN_LENGTH,
					oninput: (event: InputEvent) =>
						onPin((event.target as HTMLInputElement).value.replace(/\D/g, '')),
				}),
				m(
					'button.btn.btn--primary.btn--full',
					{
						disabled: pin.length !== AGORA_CLASSROOM.PIN_LENGTH,
						onclick: () => dispatch({ kind: 'submit' }),
					},
					t('common.continue'),
				),
				m(
					'button.btn.btn--ghost.btn--full',
					{ onclick: () => dispatch({ kind: 'back' }) },
					t('common.back'),
				),
			]);
		}

		return null;
	},
};
