import m from 'mithril';
import {
	TABLE_ASSIGNMENT_TABLE_SIZE_MAX,
	TABLE_ASSIGNMENT_TABLE_SIZE_MIN,
} from '@freedi/shared-types';
import { t, tPlural } from '@/lib/i18n';
import { freeTableCount, openProblem, parseExpected, parseSeats } from '@/logic/setupDraft';
import type { SetupDraft } from '@/logic/setupDraft';
import { setupSummary } from '@/logic/setupSummary';
import type { SetupSummary as Summary } from '@/logic/setupSummary';

export interface SetupSummaryAttrs {
	draft: SetupDraft;
	opening: boolean;
	errorKey: string | null;
	onChange: (patch: Partial<SetupDraft>) => void;
	onOpen: () => void;
}

const DEFAULT_SEATS_FOR_SUMMARY = 1;

function lines(summary: Summary): { headline: string; subline: string } {
	switch (summary.kind) {
		case 'mix':
			return {
				headline: tPlural('tableAssignment.setup.summary.tablesAbout', summary.tables),
				subline: tPlural('tableAssignment.setup.summary.people', summary.people, {
					seats: summary.seats,
				}),
			};
		case 'mixUnknown':
			return {
				headline: t('tableAssignment.setup.summary.unknown'),
				subline: t('tableAssignment.setup.summary.unknownHint'),
			};
		case 'free':
			return {
				headline: tPlural('tableAssignment.setup.summary.tables', summary.tables),
				subline: tPlural('tableAssignment.setup.summary.capacity', summary.capacity, {
					people: summary.people,
				}),
			};
		case 'freeUnknown':
		default:
			return {
				headline: tPlural('tableAssignment.setup.summary.tables', summary.tables),
				subline: tPlural('tableAssignment.setup.summary.seatsOnly', summary.capacity),
			};
	}
}

function numberField(
	id: string,
	labelKey: string,
	value: string,
	onInput: (text: string) => void,
	limits: { min: number; max?: number },
): m.Vnode {
	return m('.setup__summary-field', [
		m('label.setup__summary-label', { for: id }, t(labelKey)),
		m('input.setup__summary-input', {
			id,
			type: 'number',
			value,
			...limits,
			oninput: (event: Event) => onInput((event.target as HTMLInputElement).value),
		}),
	]);
}

/** The live summary and the one button that opens registration. */
export const SetupSummary: m.Component<SetupSummaryAttrs> = {
	view({ attrs }) {
		const { draft } = attrs;
		const expected = parseExpected(draft.expected);
		const problem = openProblem(draft);
		const summary = setupSummary({
			mode: draft.mode,
			expected: expected === null || Number.isNaN(expected) ? null : expected,
			seats: parseSeats(draft.seats, draft.legacySeats) ?? DEFAULT_SEATS_FOR_SUMMARY,
			freeTables: freeTableCount(draft),
		});
		const { headline, subline } = lines(summary);

		return m('aside.setup__summary', [
			m('h2.setup__summary-title', t('tableAssignment.setup.summary.title')),
			m('.setup__headline', [
				m('span.setup__headline-big', headline),
				m('span.setup__headline-sub', subline),
			]),
			m('.setup__summary-fields', [
				numberField(
					'setup-expected',
					'tableAssignment.setup.expected',
					draft.expected,
					(text) => attrs.onChange({ expected: text }),
					{ min: 1 },
				),
				numberField(
					'setup-seats',
					'tableAssignment.setup.seats',
					draft.seats,
					(text) => attrs.onChange({ seats: text }),
					{ min: TABLE_ASSIGNMENT_TABLE_SIZE_MIN, max: TABLE_ASSIGNMENT_TABLE_SIZE_MAX },
				),
			]),
			summary.kind === 'free' && summary.missing > 0
				? m('p.setup__shortage', tPlural('tableAssignment.setup.summary.missing', summary.missing))
				: null,
			m(
				'button.setup__open',
				{ type: 'button', disabled: attrs.opening || problem !== null, onclick: attrs.onOpen },
				t(attrs.opening ? 'tableAssignment.saving' : 'tableAssignment.setup.open'),
			),
			problem ? m('p.setup__reason', t(`tableAssignment.setup.problem.${problem}`)) : null,
			attrs.errorKey ? m('p.setup__reason', { role: 'alert' }, t(attrs.errorKey)) : null,
			m('p.setup__fix-later', t('tableAssignment.setup.fixLater')),
		]);
	},
};
