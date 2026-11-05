import m from 'mithril';
import type { ClassProposalLimit, ClassTable, Statement } from '@freedi/shared-types';
import '@/styles/console-act-for.scss';
import { t } from '@/lib/i18n';
import {
	actForStudents,
	isStudentDone,
	nextStudentOf,
	type ActForStudent,
} from '@/lib/classroom/actFor';
import { actForAddForm } from './actForAdd';
import { actForProposal } from './actForProposal';
import { actForMode, actForView, closeActFor, openActFor, slotOf } from './actForState';
import { actForVote } from './actForVote';

/**
 * Acting for a student without a device: a side sheet over the console, like the table
 * sheet; no route of its own, and closing it returns to the console, which stays live
 * underneath. A vote must never land on the wrong student, so: the header always says
 * who and which table, the action and the confirmation repeat the name, the part for
 * the student is keyed on their id so nothing on screen carries over, and moving on
 * is always a tap on "Next".
 */

export interface ActForSheetAttrs {
	mainId: string;
	tables: readonly ClassTable[];
	challenge: Statement | null;
	proposals: readonly Statement[];
	held: boolean;
	limit: ClassProposalLimit;
}

const FOCUSABLE =
	'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])';

interface SheetState {
	onKey?: (e: KeyboardEvent) => void;
	returnTo?: Element | null;
}

function rosterRow(
	attrs: ActForSheetAttrs,
	student: ActForStudent,
	current: string | null,
): m.Vnode {
	const done = isStudentDone(
		actForMode(),
		student.id,
		attrs.proposals,
		slotOf(attrs.mainId, student.id).votedId,
	);
	const here = student.id === current;

	return m(
		'li.act-for__person',
		{ key: student.id },
		m(
			'button.act-for__person-btn',
			{
				type: 'button',
				class: here ? 'act-for__person-btn--on' : '',
				'aria-current': here ? 'true' : undefined,
				'data-testid': 'act-for-person',
				'data-student': student.id,
				'aria-label': `${student.name}, ${t(done ? 'console.act_for_done' : 'console.act_for_not_done')}`,
				onclick: () => openActFor(student.id),
			},
			[
				m('span.act-for__mark', { 'aria-hidden': 'true' }, done ? '✓' : '○'),
				m('span.act-for__person-name', student.name),
			],
		),
	);
}

/** Every student by table with a done mark: at most five a table, so everybody is one look away. */
function roster(
	attrs: ActForSheetAttrs,
	students: readonly ActForStudent[],
	current: string | null,
): m.Vnode {
	const numbers = [...new Set(students.map((student) => student.n))];

	return m(
		'nav.act-for__roster',
		{ 'aria-label': t('console.no_device') },
		numbers.map((n) =>
			m('div.act-for__table', { key: n }, [
				m('h3.act-for__table-title', t('console.table_n', { n })),
				m(
					'ul.act-for__people',
					students
						.filter((student) => student.n === n)
						.map((student) => rosterRow(attrs, student, current)),
				),
			]),
		),
	);
}

function studentPart(attrs: ActForSheetAttrs, student: ActForStudent): m.Children {
	const slot = slotOf(attrs.mainId, student.id);
	const ballot = attrs.challenge?.statementSettings?.ballot;

	return actForMode() === 'vote'
		? actForVote({ student, slot, ballot, proposals: attrs.proposals, held: attrs.held })
		: actForProposal({
				mainId: attrs.mainId,
				student,
				slot,
				proposals: attrs.proposals,
				ballot,
				held: attrs.held,
				limit: attrs.limit,
			});
}

function addPart(attrs: ActForSheetAttrs, empty: boolean): m.Children {
	if (empty || actForView.addOpen) return actForAddForm(attrs.mainId, attrs.tables, attrs.held);

	return m(
		'button.btn.btn--tertiary.act-for__add-open',
		{
			type: 'button',
			disabled: attrs.held,
			'data-testid': 'act-for-add-open',
			onclick: () => {
				actForView.addOpen = true;
			},
		},
		`+ ${t('console.no_device')}`,
	);
}

/** Traps Tab in the dialog and closes on Escape. */
function keydownOf(dom: Element): (e: KeyboardEvent) => void {
	return (e) => {
		if (e.key === 'Escape') {
			closeActFor();
			m.redraw();

			return;
		}
		if (e.key !== 'Tab') return;
		const items = dom.querySelectorAll<HTMLElement>(FOCUSABLE);
		if (items.length === 0) return;
		const first = items[0];
		const last = items[items.length - 1];
		if (e.shiftKey && document.activeElement === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && document.activeElement === last) {
			e.preventDefault();
			first.focus();
		}
	};
}

const SheetPanel: m.Component<ActForSheetAttrs> = {
	oncreate(vnode) {
		const state = vnode.state as SheetState;
		state.onKey = keydownOf(vnode.dom);
		window.addEventListener('keydown', state.onKey);
		if (!vnode.dom.contains(document.activeElement)) {
			vnode.dom.querySelector<HTMLElement>('.act-for__close')?.focus();
		}
	},

	onremove(vnode) {
		const state = vnode.state as SheetState;
		if (state.onKey) window.removeEventListener('keydown', state.onKey);
		const back = state.returnTo;
		if (back instanceof HTMLElement && back.isConnected) back.focus();
	},

	oninit(vnode) {
		(vnode.state as SheetState).returnTo = document.activeElement;
	},

	view({ attrs }) {
		const students = actForStudents(attrs.tables);
		const student = students.find((person) => person.id === actForView.studentId) ?? null;
		const next = student ? nextStudentOf(students, student.id) : null;

		return m('div.table-sheet-root.act-for-root', [
			m('button.table-sheet__scrim', {
				type: 'button',
				tabindex: -1,
				'aria-hidden': 'true',
				onclick: closeActFor,
			}),
			m(
				'aside.table-sheet.act-for',
				{
					role: 'dialog',
					'aria-modal': 'true',
					'aria-labelledby': 'act-for-title',
					'data-testid': 'act-for-sheet',
				},
				[
					m('header.act-for__head', [
						// Keyed on the student: a new student is a new heading, and focus goes to it.
						m('div.act-for__heading', [
							m(
								'h2.act-for__title#act-for-title',
								{
									key: student?.id ?? 'none',
									tabindex: -1,
									'data-testid': 'act-for-title',
									oncreate: (v: m.VnodeDOM) => {
										if (student) (v.dom as HTMLElement).focus();
									},
								},
								student
									? [
											m('span.act-for__name', { dir: 'auto' }, student.name),
											m('span.act-for__where', t('console.table_n', { n: student.n })),
										]
									: t('console.no_device'),
							),
						]),
						m(
							'button.btn.btn--secondary.act-for__close',
							{ type: 'button', 'data-testid': 'act-for-close', onclick: closeActFor },
							t('console.close'),
						),
					]),
					// Keyed on the student: nothing on screen carries over to the next one.
					m('div.act-for__part', [
						student
							? m(
									'section.act-for__body',
									{ key: student.id, 'data-student': student.id },
									studentPart(attrs, student),
								)
							: m(
									'p.act-for__note',
									{ key: 'none' },
									t(students.length === 0 ? 'console.act_for_empty' : 'console.act_for_pick'),
								),
					]),
					student && next
						? m(
								'button.btn.btn--secondary.act-for__next',
								{
									type: 'button',
									'data-testid': 'act-for-next',
									onclick: () => openActFor(next.id),
								},
								t('console.act_for_next', { name: next.name }),
							)
						: null,
					students.length > 0 ? roster(attrs, students, student?.id ?? null) : null,
					addPart(attrs, students.length === 0),
				],
			),
		]);
	},
};

export const ActForSheet: m.Component<ActForSheetAttrs> = {
	view({ attrs }) {
		if (!actForView.open || actForMode() === 'none') return null;

		return m(SheetPanel, attrs);
	},
};
