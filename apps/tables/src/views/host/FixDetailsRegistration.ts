import m from 'mithril';
import {
	TABLE_ASSIGNMENT_TABLE_SIZE_MAX,
	TABLE_ASSIGNMENT_TABLE_SIZE_MIN,
	TABLE_ASSIGNMENT_TITLE_MAX_LENGTH,
} from '@freedi/shared-types';
import type { TableAssignment } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { hasQuestion, isTableSizeFixed } from '@/logic/fixDetails';
import type { SetupDraft } from '@/logic/setupDraft';

export interface FixDetailsRegistrationAttrs {
	session: TableAssignment;
	draft: SetupDraft;
	disabled: boolean;
	onChange: (patch: Partial<SetupDraft>) => void;
}

function numberField(
	labelKey: string,
	value: string,
	onInput: (text: string) => void,
	attrs: FixDetailsRegistrationAttrs,
	limits: Record<string, number>,
): m.Vnode {
	return m('label.field', [
		m('span.field__label.field__label--small', t(labelKey)),
		m('input.field__input', {
			type: 'number',
			inputmode: 'numeric',
			value,
			disabled: attrs.disabled,
			...limits,
			oninput: (event: Event) => onInput((event.target as HTMLInputElement).value),
		}),
	]);
}

function seatsField(attrs: FixDetailsRegistrationAttrs): m.Vnode {
	if (isTableSizeFixed(attrs.session)) {
		return m('p.setup__text', t('tableAssignment.fixDetails.seats.fixed'));
	}

	return numberField(
		'tableAssignment.setup.seats',
		attrs.draft.seats,
		(seats) => attrs.onChange({ seats }),
		attrs,
		{ min: TABLE_ASSIGNMENT_TABLE_SIZE_MIN, max: TABLE_ASSIGNMENT_TABLE_SIZE_MAX },
	);
}

/** The wording only: the two ends are shown, not edited, so the answers keep their meaning. */
function questionField(attrs: FixDetailsRegistrationAttrs): m.Vnode | null {
	if (!hasQuestion(attrs.session)) return null;
	const { draft } = attrs;

	return m('.field', [
		m('label.field', [
			m('span.field__label.field__label--small', t('tableAssignment.setup.position.question')),
			m('input.field__input', {
				type: 'text',
				dir: 'auto',
				value: draft.question,
				maxlength: TABLE_ASSIGNMENT_TITLE_MAX_LENGTH,
				disabled: attrs.disabled,
				oninput: (event: Event) =>
					attrs.onChange({ question: (event.target as HTMLInputElement).value }),
			}),
		]),
		m(
			'p.field__hint',
			{ dir: 'auto' },
			t('tableAssignment.fixDetails.question.ends', { poleA: draft.poleA, poleB: draft.poleB }),
		),
	]);
}

/** What depends on who registered: shown only while registration is open. */
export const FixDetailsRegistration: m.Component<FixDetailsRegistrationAttrs> = {
	view({ attrs }) {
		return m('section.fix-details__group', [
			m('h3.fix-details__heading', t('tableAssignment.fixDetails.open.title')),
			seatsField(attrs),
			numberField(
				'tableAssignment.setup.expected',
				attrs.draft.expected,
				(expected) => attrs.onChange({ expected }),
				attrs,
				{ min: 1 },
			),
			m('label.setup__check', [
				m('input', {
					type: 'checkbox',
					checked: attrs.draft.allowReturn,
					disabled: attrs.disabled,
					onchange: (event: Event) =>
						attrs.onChange({ allowReturn: (event.target as HTMLInputElement).checked }),
				}),
				t('tableAssignment.returnByName'),
			]),
			questionField(attrs),
		]);
	},
};
