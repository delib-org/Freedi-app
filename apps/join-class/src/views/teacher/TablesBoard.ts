import m from 'mithril';
import '@/styles/console-opening.scss';
import type { ClassTable, Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { unplacedStudents } from '@/lib/classroom/consoleHelpers';
import type { RosterStudent } from '@/lib/classroom/consoleHelpers';
import { moveStudent } from './consoleActions';
import { consoleState } from './consoleState';
import { dropAttrs } from './dragController';
import { MemberChip } from './MemberChip';
import { TableCard } from './TableCard';
import { noteStudentMoved } from './moveHook';

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
	/** The lesson is at Table talk: cards show the turn, who asked and the next-turn button. */
	tableTalk: boolean;
	/** Vote or summary: the cards show members only. */
	done?: boolean;
	/** Dividing into tables / Choosing a side: the cards show names only. */
	namesOnly?: boolean;
	/** The lesson's sub-questions: a card at Table talk shows the question being answered. */
	questions?: readonly Statement[];
	/** After the Side step the board counts who chose a side (never which side). */
	showSides: boolean;
	/** The lesson uses a registration: its tables show topic, reserved names and the lone-person flag. */
	connected?: boolean;
	/** The long "drag a name" hint was seen already by this teacher: it does not show again. */
	dragHintSeen?: boolean;
	onDragHintDone?: () => void;
	/** Students are joining: the code and QR card that opens the board, above the roster. */
	joining?: m.Children;
	/** The Opening panel (UX 15.L): while the class is unseated it takes the main column and the roster the side one. */
	opening?: m.Children;
	// >>> allProposals BEGIN
	/** "כל ההצעות": each card's "n/m rated everything" line. */
	ratedLineOf?: (table: ClassTable) => string;
	// >>> allProposals END
}

/** The long hint, once per teacher: it retires on "Got it" or the first move of a student. */
function dragHint(attrs: TablesBoardAttrs): m.Children {
	if (attrs.tables.length === 0 || consoleState.ended || attrs.dragHintSeen === true) return null;

	return m('div.tables-board__hint', { 'data-testid': 'console-drag-hint' }, [
		m('p.tables-board__hint-text', t('console.drag_hint')),
		m(
			'button.btn.btn--tertiary.btn--small',
			{
				type: 'button',
				'data-testid': 'console-drag-hint-close',
				onclick: () => attrs.onDragHintDone?.(),
			},
			t('console.drag_hint_close'),
		),
	]);
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
							uid: s.uid,
							name: s.name,
							chosen: attrs.showSides ? s.camp !== null : undefined,
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
	showSides: boolean,
): m.Vnode {
	return m('section.unplaced', { ...dropAttrs(null), 'aria-label': t('console.unplaced_name') }, [
		m('span.unplaced__label', `${t('console.unplaced_name')}:`),
		unplaced.map((s) =>
			m('span.unplaced__item', { key: s.uid }, [
				m(MemberChip, {
					uid: s.uid,
					name: s.name,
					chosen: showSides ? s.camp !== null : undefined,
					from: null,
					tableNumbers,
				}),
				m(
					'select.unplaced__select',
					{
						'aria-label': `${t('console.to_table')}: ${s.name}`,
						disabled: consoleState.ended,
						onchange: (e: Event) => {
							const el = e.target as HTMLSelectElement;
							const n = Number(el.value);
							el.value = '';
							if (!Number.isFinite(n) || n <= 0) return;
							noteStudentMoved();
							void moveStudent(mainId, s.uid, n);
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
			dragHint(attrs),
			attrs.tables.length === 0
				? attrs.opening
					? m('div.console-opening', [attrs.opening, rosterCard(attrs)])
					: [attrs.joining ?? null, rosterCard(attrs)]
				: [
						unplaced.length > 0
							? unplacedStrip(unplaced, tableNumbers, attrs.mainId, attrs.showSides)
							: null,
						m(
							'div.tables-board__grid',
							attrs.tables.map((table) =>
								m(TableCard, {
									key: table.tableId,
									table,
									students: byUid,
									plenum: attrs.plenum,
									tableTalk: attrs.tableTalk,
									done: attrs.done,
									namesOnly: attrs.namesOnly,
									questionText: attrs.questions?.find((q) => q.statementId === table.questionId)
										?.statement,
									mainId: attrs.mainId,
									tableNumbers,
									showSides: attrs.showSides,
									connected: attrs.connected,
									ratedLine: attrs.ratedLineOf?.(table), // >>> allProposals
								}),
							),
						),
					],
		]);
	},
};
