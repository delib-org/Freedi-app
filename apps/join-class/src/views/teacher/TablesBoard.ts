import m from 'mithril';
import type { ClassTable } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { unplacedStudents } from '@/lib/classroom/consoleHelpers';
import type { RosterStudent } from '@/lib/classroom/consoleHelpers';
import { moveStudent } from './consoleActions';
import { consoleState } from './consoleState';
import { dropAttrs } from './dragController';
import { MemberChip } from './MemberChip';
import { TableCard } from './TableCard';

/**
 * The tables board (UX section 5). Before the class is seated: one roster card
 * with every joined student. After: the "no table" strip (only when someone is
 * unplaced) above the grid of table cards. An aria-live region announces moves
 * and the strip appearing.
 */

export interface TablesBoardAttrs {
	mainId: string;
	tables: readonly ClassTable[];
	students: readonly RosterStudent[];
	plenum: boolean;
	/** Side marks appear after the Side step. */
	showSides: boolean;
}

function rosterCard(attrs: TablesBoardAttrs): m.Vnode {
	return m('section.roster-card', { 'aria-label': t('console.roster_title') }, [
		m('h3.roster-card__title', [
			t('console.roster_title'),
			m('span.roster-card__count', ` · ${attrs.students.length}`),
		]),
		attrs.students.length === 0
			? m('p.roster-card__empty', t('console.roster_empty'))
			: m(
					'div.roster-card__chips',
					attrs.students.map((s) =>
						m(MemberChip, {
							key: s.uid,
							name: s.name,
							camp: attrs.showSides ? s.camp : null,
							from: null,
							tableNumbers: [],
						}),
					),
				),
	]);
}

function unplacedStrip(
	unplaced: readonly RosterStudent[],
	tableNumbers: readonly number[],
	mainId: string,
): m.Vnode {
	return m('section.unplaced', { ...dropAttrs(null), 'aria-label': t('console.unplaced_name') }, [
		m('span.unplaced__label', `${t('console.unplaced_name')}:`),
		unplaced.map((s) =>
			m('span.unplaced__item', { key: s.uid }, [
				m(MemberChip, {
					uid: s.uid,
					name: s.name,
					camp: s.camp,
					from: null,
					tableNumbers,
				}),
				m(
					'select.unplaced__select',
					{
						'aria-label': `${t('console.to_table')}: ${s.name}`,
						onchange: (e: Event) => {
							const el = e.target as HTMLSelectElement;
							const n = Number(el.value);
							el.value = '';
							if (Number.isFinite(n) && n > 0) void moveStudent(mainId, s.uid, n);
						},
					},
					[
						m('option', { value: '' }, `${t('console.to_table')} ▾`),
						tableNumbers.map((n) => m('option', { value: String(n) }, t('console.table_n', { n }))),
					],
				),
			]),
		),
	]);
}

export const TablesBoard: m.Component<TablesBoardAttrs> = {
	view({ attrs }) {
		const byUid = new Map(attrs.students.map((s) => [s.uid, s]));
		const tableNumbers = attrs.tables.map((tb) => tb.n);
		const unplaced = unplacedStudents(attrs.students, attrs.tables);

		return m('div.tables-board', [
			m('div.tables-board__live', { role: 'status', 'aria-live': 'polite' }, [
				consoleState.announce,
				attrs.tables.length > 0 && unplaced.length > 0
					? ` ${t('console.unplaced_live', { count: unplaced.length })}`
					: '',
			]),
			attrs.tables.length === 0
				? rosterCard(attrs)
				: [
						unplaced.length > 0 ? unplacedStrip(unplaced, tableNumbers, attrs.mainId) : null,
						m(
							'div.tables-board__grid',
							attrs.tables.map((table) =>
								m(TableCard, {
									key: table.tableId,
									table,
									students: byUid,
									plenum: attrs.plenum,
									mainId: attrs.mainId,
									tableNumbers,
								}),
							),
						),
					],
		]);
	},
};
