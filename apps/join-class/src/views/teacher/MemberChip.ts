import m from 'mithril';
import type { Camp } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { CAMP_MARK } from '@/lib/classroom/consoleHelpers';
import type { DropTarget } from '@/lib/classroom/dragReducer';
import { moveStudent } from './consoleActions';
import { blurChip, keyChip, pressChip, targetName } from './dragController';
import { consoleState } from './consoleState';

/**
 * One student (or a "no device" member) as a chip: side mark (shape, colour and
 * words never alone), name, and a menu "move to another table" that is the
 * pointer-free equivalent of dragging. Draggable by pointer and by keyboard.
 */

export interface MemberChipAttrs {
	uid?: string;
	name: string;
	camp: Camp | null;
	noDevice?: boolean;
	/** Where the chip sits now: table number, or null = unplaced. */
	from: DropTarget;
	tableNumbers: readonly number[];
}

function sideLabel(camp: Camp | null): string {
	return t(camp ? `console.side_${camp}` : 'console.side_none');
}

function moveMenu(attrs: MemberChipAttrs, uid: string): m.Vnode {
	return m(
		'select.member-chip__select',
		{
			'aria-label': t('console.move'),
			'data-move-select': uid,
			onchange: (e: Event) => {
				const raw = (e.target as HTMLSelectElement).value;
				consoleState.menuUid = null;
				if (raw === '') return;
				void moveStudent(consoleState.mainId, uid, raw === 'none' ? null : Number(raw));
			},
			onblur: () => {
				consoleState.menuUid = null;
			},
			oncreate: (vnode: m.VnodeDOM) => (vnode.dom as HTMLSelectElement).focus(),
		},
		[
			m('option', { value: '' }, t('console.move')),
			attrs.from !== null ? m('option', { value: 'none' }, targetName(null)) : null,
			attrs.tableNumbers
				.filter((n) => n !== attrs.from)
				.map((n) => m('option', { value: String(n) }, targetName(n))),
		],
	);
}

export const MemberChip: m.Component<MemberChipAttrs> = {
	view({ attrs }) {
		const { uid, name, camp, noDevice } = attrs;
		const drag = consoleState.drag;
		const active = uid !== undefined && drag.mode !== 'idle' && 'uid' in drag && drag.uid === uid;
		const label = noDevice ? `${name}, ${t('console.no_device')}` : `${name}, ${sideLabel(camp)}`;
		// While the lesson is held nobody moves: no drag, no move menu.
		const ref = uid !== undefined && !consoleState.held ? { uid, name, from: attrs.from } : null;
		const mod = camp ? `member-chip--${camp}` : '';

		return m('span.member-chip-wrap', { key: uid ?? `nd:${name}` }, [
			m(
				'button.member-chip',
				{
					type: 'button',
					class: [
						mod,
						noDevice ? 'member-chip--no-device' : '',
						active ? 'member-chip--active' : '',
					].join(' '),
					title: label,
					'aria-label': label,
					'data-uid': uid,
					disabled: false,
					'aria-pressed': active && drag.mode === 'keyboard' ? 'true' : undefined,
					onpointerdown: ref ? (e: PointerEvent) => pressChip(e, ref) : undefined,
					onkeydown: ref ? (e: KeyboardEvent) => keyChip(e, ref, attrs.tableNumbers) : undefined,
					onblur: ref ? () => blurChip(ref) : undefined,
					oncreate: (vnode: m.VnodeDOM) => {
						if (uid !== undefined && consoleState.focusUid === uid) {
							consoleState.focusUid = null;
							(vnode.dom as HTMLElement).focus();
						}
					},
				},
				[
					m('span.member-chip__mark', { 'aria-hidden': 'true' }, camp ? CAMP_MARK[camp] : '○'),
					m('span.member-chip__name', name),
					noDevice ? m('span.member-chip__tag', t('console.no_device')) : null,
				],
			),
			uid !== undefined && !consoleState.held
				? m(
						'button.member-chip__menu',
						{
							type: 'button',
							'aria-label': `${t('console.move')}: ${name}`,
							'aria-expanded': consoleState.menuUid === uid ? 'true' : 'false',
							onclick: () => {
								consoleState.menuUid = consoleState.menuUid === uid ? null : uid;
							},
						},
						'▾',
					)
				: null,
			uid !== undefined && !consoleState.held && consoleState.menuUid === uid
				? moveMenu(attrs, uid)
				: null,
		]);
	},
};
