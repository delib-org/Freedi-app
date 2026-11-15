import m from 'mithril';
import { TABLE_ASSIGNMENT_EVENT_PLACE_MAX_LENGTH } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import type { SetupDraft } from '@/logic/setupDraft';

export interface SetupEventAttrs {
	draft: SetupDraft;
	onChange: (patch: Partial<SetupDraft>) => void;
}

type EventField = 'eventDate' | 'eventTime' | 'eventPlace';

function eventField(
	attrs: SetupEventAttrs,
	field: EventField,
	labelKey: string,
	input: Record<string, string | number>,
): m.Vnode {
	return m('label.field', [
		m('span.field__label.field__label--small', t(labelKey)),
		m('input.field__input', {
			...input,
			value: attrs.draft[field],
			oninput: (event: Event) =>
				attrs.onChange({ [field]: (event.target as HTMLInputElement).value }),
		}),
	]);
}

/** "When and where": all three are optional, and shown to people once they have registered. */
export const SetupEvent: m.Component<SetupEventAttrs> = {
	view({ attrs }) {
		return m('section.setup__card', [
			m('h2.setup__heading', t('tableAssignment.setup.event.title')),
			m('p.setup__text', t('tableAssignment.setup.event.lead')),
			m('.setup__poles', [
				eventField(attrs, 'eventDate', 'tableAssignment.setup.event.date', { type: 'date' }),
				eventField(attrs, 'eventTime', 'tableAssignment.setup.event.time', { type: 'time' }),
			]),
			eventField(attrs, 'eventPlace', 'tableAssignment.setup.event.place', {
				type: 'text',
				dir: 'auto',
				maxlength: TABLE_ASSIGNMENT_EVENT_PLACE_MAX_LENGTH,
			}),
		]);
	},
};
