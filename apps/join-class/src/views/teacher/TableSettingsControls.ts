import m from 'mithril';
import { SPEAK_SECONDS_CHOICES } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import '@/styles/table-settings.scss';

/**
 * The lesson's table-talk controls (IA 25), drawn the same way on the plan
 * screen and in the console's settings popover: a switch for "students may add
 * their own question" and (IA 25.5, 25.6) native selects for the speaking time
 * and the number of turns at Proposals. Presentational only: the caller owns
 * the value, the save and the error line. `scope` picks the i18n family
 * (`plan.*` or `console.*`).
 */

export type SettingsScope = 'plan' | 'console';

export interface OwnQuestionsAttrs {
	scope: SettingsScope;
	on: boolean;
	disabled?: boolean;
	/** The plan has no question and students cannot add one: a warning under the switch. */
	showNoneWarning?: boolean;
	onChange: (on: boolean) => void;
}

/** "Students may add their own question": a labelled switch with its help line. */
export const OwnQuestionsSwitch: m.Component<OwnQuestionsAttrs> = {
	view({ attrs }) {
		const id = `table-settings-own-${attrs.scope}`;

		return m('.table-settings__row', [
			m('input.table-settings__switch', {
				id,
				type: 'checkbox',
				role: 'switch',
				checked: attrs.on,
				disabled: attrs.disabled,
				'aria-checked': attrs.on ? 'true' : 'false',
				'aria-describedby': `${id}-help`,
				'data-testid': id,
				onchange: (e: Event) => attrs.onChange((e.target as HTMLInputElement).checked),
			}),
			m('label.table-settings__label', { for: id }, t(`${attrs.scope}.own_questions`)),
			m('p.table-settings__help', { id: `${id}-help` }, t(`${attrs.scope}.own_questions_help`)),
			attrs.showNoneWarning && !attrs.on
				? m(
						'p.table-settings__warning',
						{ role: 'status', 'data-testid': 'own-questions-none' },
						t('plan.own_questions_none'),
					)
				: null,
		]);
	},
};

export interface SpeakTimeAttrs {
	scope: SettingsScope;
	seconds: number;
	disabled?: boolean;
	onChange: (seconds: number) => void;
}

/** "Time to talk": a native select over SPEAK_SECONDS_CHOICES (half a minute to 5 minutes), with its help line. */
export const SpeakTimeSelect: m.Component<SpeakTimeAttrs> = {
	view({ attrs }) {
		const id = `table-settings-speak-${attrs.scope}`;

		return m('.table-settings__select-row', [
			m('label.table-settings__select-label', { for: id }, t(`${attrs.scope}.speak_time`)),
			m(
				'select.table-settings__select',
				{
					id,
					value: String(attrs.seconds),
					disabled: attrs.disabled,
					'aria-describedby': `${id}-help`,
					'data-testid': id,
					onchange: (e: Event) => attrs.onChange(Number((e.target as HTMLSelectElement).value)),
				},
				SPEAK_SECONDS_CHOICES.map((seconds) =>
					m(
						'option',
						{ key: seconds, value: String(seconds), selected: seconds === attrs.seconds },
						t(`plan.speak_time_${seconds}`),
					),
				),
			),
			m('p.table-settings__help', { id: `${id}-help` }, t(`${attrs.scope}.speak_time_help`)),
		]);
	},
};
