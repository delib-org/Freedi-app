import m from 'mithril';
import { SPEAK_SECONDS } from '@freedi/shared-types';
import type { ClassTable } from '@freedi/shared-types';
import { getLang, t } from '@/lib/i18n';
import { getServerOffset, remainingMs } from '@/lib/classroom/serverClock';
import { formatSpeakerTime, tableStepKey, timerLine } from '@/lib/classroom/consoleHelpers';
import type { RosterStudent } from '@/lib/classroom/consoleHelpers';
import { joinNames } from '@/lib/classroom/listNames';
import {
	QUICK_KEYS,
	everyoneAsked,
	memberMark,
	quickActionFor,
	statusLine,
	type QuickAction,
	type TableMode,
} from '@/lib/classroom/tableTurnConsole';
import { addNoDevice, tableAction } from './consoleActions';
import { consoleState, isBusy } from './consoleState';
import { MemberChip } from './MemberChip';
import { dropAttrs } from './dragController';

/**
 * One table of the board (UX section 5): title + round, "now" line, the timer
 * line in words and a bar, the asker, member chips, "+ no device" and the quick
 * actions. A drop target for chips.
 */

export interface TableCardAttrs {
	table: ClassTable;
	students: ReadonlyMap<string, RosterStudent>;
	plenum: boolean;
	tableTalk: boolean;
	mainId: string;
	tableNumbers: readonly number[];
}

const MS_PER_SECOND = 1000;
let noDeviceName = '';

function nameOf(
	uid: string | null | undefined,
	students: ReadonlyMap<string, RosterStudent>,
): string {
	return uid ? (students.get(uid)?.name ?? uid.slice(0, 4)) : '';
}

export function tableModeOf(attrs: { plenum: boolean; tableTalk: boolean }): TableMode {
	return attrs.plenum ? 'plenum' : attrs.tableTalk ? 'tableTalk' : 'proposals';
}

/** The table's max turns: one per tablemate with a device (never below the turn it is on). */
export function turnLine(table: ClassTable): string {
	return t('console.turn_n', {
		n: table.turn,
		max: Math.max(table.memberUids.length, table.turn),
	});
}

/** The engine action behind each next-step verb. */
export function quickActionName(quick: QuickAction): 'toTalk' | 'toWrite' | 'toRate' | 'nextTurn' {
	if (quick.kind === 'turn') return 'nextTurn';

	return quick.kind === 'talk' ? 'toTalk' : quick.kind === 'write' ? 'toWrite' : 'toRate';
}

/** The one next-step action of a table, as the verb the students' buttons end with. */
export function quickRun(table: ClassTable, quick: QuickAction): Promise<boolean> {
	return tableAction(table.tableId, { action: quickActionName(quick) });
}

export function quickLabel(quick: QuickAction): string {
	return t(QUICK_KEYS[quick.kind], { n: quick.n ?? 0 });
}

function waitRows(attrs: TableCardAttrs): m.Children {
	const { table, students } = attrs;
	const options = table.questionId ? (consoleState.options.get(table.questionId) ?? []) : [];
	const line = statusLine(table, tableModeOf(attrs), options);
	if (!line) return null;
	const names = (line.nameUids ?? []).map((uid) => nameOf(uid, students));
	const params: Record<string, string | number> = { ...(line.params ?? {}) };
	if (names.length > 1) params.names = joinNames(names, getLang());
	else if (names.length === 1) {
		params.name = names[0];
		params.names = names[0];
	}

	return m('p.table-card__wait', { 'data-testid': 'table-wait' }, t(line.key, params));
}

function timerRows(attrs: TableCardAttrs): m.Children {
	const { table, students } = attrs;
	const remaining =
		table.speakerEndsAt === undefined
			? null
			: remainingMs(table.speakerEndsAt, Date.now(), getServerOffset(), {
					totalMs: SPEAK_SECONDS * MS_PER_SECOND,
				});
	const line = timerLine(table, remaining, SPEAK_SECONDS * MS_PER_SECOND);
	if (line.kind === 'none')
		return waitRows(attrs) ?? m('p.table-card__timer.table-card__timer--none', '—');
	const who = nameOf(line.speakerUid, students);

	return [
		m(
			'p.table-card__timer',
			{ class: line.kind === 'over' ? 'table-card__timer--over' : '' },
			line.kind === 'over'
				? t('console.time_over')
				: t('console.speaker_line', { name: who, time: formatSpeakerTime(line.ms) }),
		),
		m('div.table-card__bar', { 'aria-hidden': 'true' }, [
			m('span.table-card__bar-fill', {
				style: { '--fill': line.kind === 'running' ? String(line.fraction) : '0' },
			}),
		]),
	];
}

export function noDeviceForm(mainId: string, n: number): m.Vnode {
	const submit = (): void => {
		const name = noDeviceName.trim();
		if (!name) return;
		void addNoDevice(mainId, n, name).then((ok) => {
			if (ok) {
				noDeviceName = '';
				consoleState.noDeviceFor = null;
			}
		});
	};

	return m(
		'form.table-card__nd-form',
		{
			onsubmit: (e: Event) => {
				e.preventDefault();
				submit();
			},
		},
		[
			m('input.table-card__nd-input', {
				type: 'text',
				'aria-label': t('console.no_device_name'),
				placeholder: t('console.no_device_name'),
				value: noDeviceName,
				oninput: (e: Event) => {
					noDeviceName = (e.target as HTMLInputElement).value;
				},
				oncreate: (vnode: m.VnodeDOM) => (vnode.dom as HTMLInputElement).focus(),
				onkeydown: (e: KeyboardEvent) => {
					if (e.key === 'Escape') consoleState.noDeviceFor = null;
				},
			}),
			m(
				'button.btn.btn--secondary.table-card__nd-add',
				{ type: 'submit', disabled: isBusy(`nodevice:${n}`) },
				t('console.add'),
			),
		],
	);
}

export const TableCard: m.Component<TableCardAttrs> = {
	view({ attrs }) {
		const { table, students, plenum, mainId } = attrs;
		const drag = consoleState.drag;
		const dragging = drag.mode === 'pointer' || drag.mode === 'keyboard';
		const isSource = dragging && drag.from === table.n;
		const isOver = dragging && drag.over === table.n && !isSource;
		const targetClass = [
			dragging && !isSource ? 'table-card--target' : '',
			isOver ? 'table-card--over' : '',
		].join(' ');

		return m(
			'article.table-card',
			{
				class: targetClass,
				'data-table': table.n,
				...dropAttrs(table.n),
				oncreate: (v: m.VnodeDOM) => {
					if (consoleState.focusTableN !== table.n) return;
					consoleState.focusTableN = null;
					(v.dom.querySelector('.table-card__title') as HTMLElement | null)?.focus();
				},
				'aria-label': t('console.table_n', { n: table.n }),
			},
			[
				m('h3.table-card__head', [
					m(
						m.route.Link,
						{
							class: 'table-card__title',
							href: `/t/${mainId}/table/${table.n}`,
						},
						t('console.table_n', { n: table.n }),
					),
					m('span.table-card__turn', turnLine(table)),
				]),
				m(
					'p.table-card__now',
					everyoneAsked(table, tableModeOf(attrs))
						? `${t(tableStepKey(table, plenum))} · ${t('console.all_asked')}`
						: t(tableStepKey(table, plenum)),
				),
				timerRows(attrs),
				m(
					'p.table-card__asker',
					table.askerUid
						? t('console.asker_line', { name: nameOf(table.askerUid, students) })
						: '—',
				),
				m('div.table-card__members', [
					table.memberUids.map((uid) =>
						m(MemberChip, {
							key: uid,
							uid,
							name: nameOf(uid, students),
							camp: students.get(uid)?.camp ?? null,
							from: table.n,
							tableNumbers: attrs.tableNumbers,
							turnMark: attrs.tableTalk ? memberMark(table, uid) : undefined,
						}),
					),
					table.noDeviceMembers.map((nd) =>
						m(MemberChip, {
							key: `nd:${nd.id}`,
							name: nd.name,
							camp: null,
							noDevice: true,
							from: table.n,
							tableNumbers: attrs.tableNumbers,
						}),
					),
				]),
				consoleState.noDeviceFor === table.n
					? noDeviceForm(mainId, table.n)
					: m(
							'button.btn.btn--tertiary.table-card__nd-open',
							{
								type: 'button',
								disabled: consoleState.held,
								onclick: () => {
									consoleState.noDeviceFor = table.n;
								},
							},
							`+ ${t('console.no_device')}`,
						),
				(() => {
					const quick = quickActionFor(table, tableModeOf(attrs));
					if (!quick) return null;
					const label = quickLabel(quick);

					return m('div.table-card__actions', [
						m(
							'button.btn.btn--tertiary.table-card__quick',
							{
								type: 'button',
								'data-quick': quick.kind,
								'aria-label': `${t('console.table_n', { n: table.n })}: ${label}`,
								disabled:
									consoleState.held || isBusy(`table:${table.tableId}:${quickActionName(quick)}`),
								onclick: () => void quickRun(table, quick),
							},
							label,
						),
					]);
				})(),
			],
		);
	},
};
