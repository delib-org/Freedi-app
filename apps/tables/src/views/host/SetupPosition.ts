import m from 'mithril';
import { TABLE_ASSIGNMENT_TITLE_MAX_LENGTH } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import type { SetupDraft } from '@/logic/setupDraft';
import {
	STRICTNESS_CHIPS,
	chipOfTolerance,
	formatTolerance,
	toleranceOfChip,
} from '@/logic/strictness';

export interface SetupPositionAttrs {
	draft: SetupDraft;
	onChange: (patch: Partial<SetupDraft>) => void;
}

type TextField = 'question' | 'poleA' | 'poleB';

function textField(attrs: SetupPositionAttrs, field: TextField, labelKey: string): m.Vnode {
	return m('label.field', [
		m('span.field__label.field__label--small', t(labelKey)),
		m('input.field__input', {
			type: 'text',
			dir: 'auto',
			value: attrs.draft[field],
			maxlength: TABLE_ASSIGNMENT_TITLE_MAX_LENGTH,
			oninput: (event: Event) =>
				attrs.onChange({ [field]: (event.target as HTMLInputElement).value }),
		}),
	]);
}

function strictness(attrs: SetupPositionAttrs): m.Vnode {
	const current = chipOfTolerance(attrs.draft.tolerance);

	return m('.setup__strictness', [
		m('h3.setup__subheading', t('tableAssignment.strictness')),
		m(
			'.setup__chips',
			STRICTNESS_CHIPS.map((chip) =>
				m(
					'button.setup__chip',
					{
						key: chip,
						type: 'button',
						'aria-pressed': String(chip === current),
						onclick: () => attrs.onChange({ tolerance: toleranceOfChip(chip) }),
					},
					t(`tableAssignment.strictness.${chip}`),
				),
			),
		),
		m('p.setup__text', { 'aria-live': 'polite' }, t(`tableAssignment.strictness.${current}.text`)),
		m(
			'span.setup__expert',
			t('tableAssignment.strictness.expert', { value: formatTolerance(attrs.draft.tolerance) }),
		),
	]);
}

/** "What do people disagree about": the position question and how strict the mixing is. */
export const SetupPosition: m.Component<SetupPositionAttrs> = {
	view({ attrs }) {
		const { draft } = attrs;

		return m('section.setup__card', [
			m('h2.setup__heading', t('tableAssignment.setup.position.title')),
			m('p.setup__text', t('tableAssignment.setup.position.lead')),
			m('label.setup__check', [
				m('input', {
					type: 'checkbox',
					checked: draft.askPosition,
					onchange: (event: Event) =>
						attrs.onChange({ askPosition: (event.target as HTMLInputElement).checked }),
				}),
				t('tableAssignment.setup.position.ask'),
			]),
			draft.askPosition
				? [
						textField(attrs, 'question', 'tableAssignment.setup.position.question'),
						m('.setup__poles', [
							textField(attrs, 'poleA', 'tableAssignment.setup.position.poleA'),
							textField(attrs, 'poleB', 'tableAssignment.setup.position.poleB'),
						]),
						strictness(attrs),
					]
				: null,
		]);
	},
};
