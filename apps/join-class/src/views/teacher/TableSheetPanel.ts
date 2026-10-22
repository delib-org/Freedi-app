import m from 'mithril';
import { SPEAK_SECONDS } from '@freedi/shared-types';
import type { ClassTable, Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import {
	CAMP_MARK,
	formatSpeakerTime,
	tableStepKey,
	timerLine,
} from '@/lib/classroom/consoleHelpers';
import type { RosterStudent } from '@/lib/classroom/consoleHelpers';
import { getServerOffset, remainingMs, serverNow } from '@/lib/classroom/serverClock';
import { moveStudent } from './consoleActions';
import { consoleState, isBusy } from './consoleState';
import { memberMark, type TableMode } from '@/lib/classroom/tableTurnConsole';
import { noDeviceForm, tableModeOf, turnLine } from './TableCard';
import { stepButtons, turnButtons } from './tableSheetTurn';
import { targetName } from './dragController';

/**
 * The table sheet (UX section 5): a 420 px side sheet from the end edge over a
 * dimmed board. Members with side and "move to another table" / "remove",
 * the table's current question and turn, "to writing" / "to rating",
 * "+ no device", and "close" (Escape too).
 *
 * "Message" (הודעה) is left out: Join has no messaging primitive to a single
 * student (its chat is per option, not per person).
 */

export interface TableSheetPanelAttrs {
	mainId: string;
	n: number;
	tables: readonly ClassTable[];
	students: readonly RosterStudent[];
	questions: readonly Statement[];
	plenum: boolean;
	tableTalk: boolean;
	onClose: () => void;
}

const MS_PER_SECOND = 1000;
let showNoDevice = false;

function memberRow(
	student: RosterStudent | undefined,
	uid: string,
	table: ClassTable,
	tableNumbers: readonly number[],
	mode: TableMode,
): m.Vnode {
	const name = student?.name ?? uid.slice(0, 4);
	const camp = student?.camp ?? null;
	const now = serverNow();
	const turnMark = mode === 'tableTalk' ? memberMark(table, uid, now) : '';

	return m('li.table-sheet__member', { key: uid }, [
		m('span.table-sheet__member-mark', { 'aria-hidden': 'true' }, camp ? CAMP_MARK[camp] : '○'),
		m('span.table-sheet__member-name', name),
		turnMark ? m('span.table-sheet__member-turn', { 'aria-hidden': 'true' }, turnMark) : null,
		turnButtons(table, uid, name, mode, now),
		m('span.table-sheet__member-side', t(camp ? `console.side_${camp}` : 'console.side_none')),
		m(
			'select.table-sheet__select',
			{
				'aria-label': `${t('console.move')}: ${name}`,
				onchange: (e: Event) => {
					const el = e.target as HTMLSelectElement;
					const raw = el.value;
					el.value = '';
					if (raw !== '') void moveStudent(consoleState.mainId, uid, Number(raw));
				},
			},
			[
				m('option', { value: '' }, `${t('console.move')} ▾`),
				tableNumbers
					.filter((n) => n !== table.n)
					.map((n) => m('option', { value: String(n) }, targetName(n))),
			],
		),
		m(
			'button.btn.btn--tertiary.table-sheet__remove',
			{
				type: 'button',
				'aria-label': `${t('console.remove')}: ${name}`,
				disabled: consoleState.held || isBusy(`move:${uid}`),
				onclick: () => void moveStudent(consoleState.mainId, uid, null),
			},
			t('console.remove'),
		),
	]);
}

function currentLine(attrs: TableSheetPanelAttrs, table: ClassTable): m.Children {
	const question = attrs.questions.find((q) => q.statementId === table.questionId);
	const students = new Map(attrs.students.map((s) => [s.uid, s]));
	const remaining =
		table.speakerEndsAt === undefined
			? null
			: remainingMs(table.speakerEndsAt, Date.now(), getServerOffset(), {
					totalMs: SPEAK_SECONDS * MS_PER_SECOND,
				});
	const timer = timerLine(table, remaining, SPEAK_SECONDS * MS_PER_SECOND);
	const speakerName = (uid: string): string => students.get(uid)?.name ?? uid.slice(0, 4);

	return [
		m('p.table-sheet__now', [
			m('strong', t(tableStepKey(table, attrs.plenum))),
			` · ${turnLine(table)}`,
		]),
		m('p.table-sheet__question', question ? question.statement : t('console.no_question_yet')),
		timer.kind === 'running'
			? m(
					'p.table-sheet__timer',
					t('console.speaker_line', {
						name: speakerName(timer.speakerUid),
						time: formatSpeakerTime(timer.ms),
					}),
				)
			: timer.kind === 'over'
				? m('p.table-sheet__timer.table-sheet__timer--over', t('console.time_over'))
				: null,
		table.askerUid
			? m('p.table-sheet__asker', t('console.asker_line', { name: speakerName(table.askerUid) }))
			: null,
	];
}

export const TableSheetPanel: m.Component<TableSheetPanelAttrs> = {
	oncreate(vnode) {
		const onKey = (e: KeyboardEvent): void => {
			if (e.key === 'Escape') vnode.attrs.onClose();
		};
		window.addEventListener('keydown', onKey);
		(vnode.state as { onKey?: (e: KeyboardEvent) => void }).onKey = onKey;
		(vnode.dom.querySelector('.table-sheet__close') as HTMLElement | null)?.focus();
	},

	onremove(vnode) {
		const onKey = (vnode.state as { onKey?: (e: KeyboardEvent) => void }).onKey;
		if (onKey) window.removeEventListener('keydown', onKey);
		showNoDevice = false;
	},

	view({ attrs }) {
		const table = attrs.tables.find((tb) => tb.n === attrs.n);
		const byUid = new Map(attrs.students.map((s) => [s.uid, s]));
		const tableNumbers = attrs.tables.map((tb) => tb.n);

		return m('div.table-sheet-root', [
			m('button.table-sheet__scrim', {
				type: 'button',
				tabindex: -1,
				'aria-hidden': 'true',
				onclick: attrs.onClose,
			}),
			m(
				'aside.table-sheet',
				{ role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'table-sheet-title' },
				[
					m('header.table-sheet__head', [
						m('h2.table-sheet__title#table-sheet-title', t('console.table_n', { n: attrs.n })),
						m(
							'button.btn.btn--secondary.table-sheet__close',
							{ type: 'button', onclick: attrs.onClose },
							t('console.close'),
						),
					]),
					!table
						? m('p.table-sheet__missing', t('console.table_missing'))
						: [
								currentLine(attrs, table),
								m('div.table-sheet__actions', stepButtons(table, tableModeOf(attrs), serverNow())),
								m('h3.table-sheet__section', t('console.members')),
								m('ul.table-sheet__members', [
									table.memberUids.map((uid) =>
										memberRow(byUid.get(uid), uid, table, tableNumbers, tableModeOf(attrs)),
									),
									table.noDeviceMembers.map((nd) =>
										m('li.table-sheet__member.table-sheet__member--nd', { key: `nd:${nd.id}` }, [
											m('span.table-sheet__member-name', nd.name),
											m('span.table-sheet__member-side', t('console.no_device')),
										]),
									),
								]),
								showNoDevice
									? noDeviceForm(attrs.mainId, table.n)
									: m(
											'button.btn.btn--tertiary',
											{
												type: 'button',
												disabled: consoleState.held,
												onclick: () => {
													showNoDevice = true;
												},
											},
											`+ ${t('console.no_device')}`,
										),
							],
				],
			),
		]);
	},
};
