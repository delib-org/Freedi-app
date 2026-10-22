import m from 'mithril';
import { SPEAK_SECONDS } from '@freedi/shared-types';
import type { ClassTable } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { getServerOffset, remainingMs } from '@/lib/classroom/serverClock';
import { formatSpeakerTime, tableStepKey, timerLine } from '@/lib/classroom/consoleHelpers';
import type { RosterStudent } from '@/lib/classroom/consoleHelpers';
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

function timerRows(attrs: TableCardAttrs): m.Children {
	const { table, students } = attrs;
	const remaining =
		table.speakerEndsAt === undefined
			? null
			: remainingMs(table.speakerEndsAt, Date.now(), getServerOffset(), {
					totalMs: SPEAK_SECONDS * MS_PER_SECOND,
				});
	const line = timerLine(table, remaining, SPEAK_SECONDS * MS_PER_SECOND);
	if (line.kind === 'none') return m('p.table-card__timer.table-card__timer--none', '—');
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
					m('span.table-card__turn', t('console.turn_n', { n: table.turn })),
				]),
				m('p.table-card__now', t(tableStepKey(table, plenum))),
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
				m('div.table-card__actions', [
					plenum
						? null
						: m(
								'button.btn.btn--tertiary.table-card__quick',
								{
									type: 'button',
									'data-quick': 'write',
									disabled: consoleState.held || isBusy(`table:${table.tableId}:toWrite`),
									onclick: () => void tableAction(table.tableId, { action: 'toWrite' }),
								},
								t('console.quick_write'),
							),
					m(
						'button.btn.btn--tertiary.table-card__quick',
						{
							type: 'button',
							'data-quick': 'rate',
							disabled: consoleState.held || isBusy(`table:${table.tableId}:toRate`),
							onclick: () => void tableAction(table.tableId, { action: 'toRate' }),
						},
						t('console.quick_rate'),
					),
				]),
			],
		);
	},
};
