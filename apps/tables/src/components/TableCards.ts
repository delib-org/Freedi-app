import m from 'mithril';
import type {
	TableAssignmentCloseness,
	TableAssignmentRosterEntry,
	TableAssignmentRun,
	TableAssignmentTopic,
} from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import type { DirectTable } from '@/logic/directTables';
import { tableNumber } from '@/logic/format';

/** One table as the host reads it: number, topic and names. Never a person's answer. */
export interface TableView {
	number: number;
	topicTitle: string;
	names: string[];
	/** Preview only: how the table compares with the room, as the server stored it. */
	closeness?: TableAssignmentCloseness;
}

export interface TableCardsAttrs {
	tables: TableView[];
	/** Capacity, to print "4 of 7" in free mode. */
	capacity?: number;
}

const CLOSENESS_TONE: Readonly<Record<TableAssignmentCloseness, string>> = {
	veryClose: 'pill--success',
	close: 'pill--success',
	far: 'pill--warning',
	notEnough: 'pill--neutral',
};

/** Tables of a run, with names looked up by uid. A missing name shows as an unknown member. */
export function tableViewsFromRun(
	run: Pick<TableAssignmentRun, 'tables'>,
	topics: readonly TableAssignmentTopic[],
	names: ReadonlyMap<string, string>,
): TableView[] {
	const topicTitles = new Map(topics.map((topic) => [topic.topicId, topic.title]));

	return [...run.tables]
		.sort((a, b) => a.index - b.index)
		.map((table) => ({
			number: tableNumber(table.index),
			topicTitle: topicTitles.get(table.topicId) ?? t('tableAssignment.topic.unknown'),
			names: table.memberUids.map((uid) => names.get(uid) ?? t('tableAssignment.member.unknown')),
		}));
}

/** The same tables with the closeness the server stored. A run without it shows "not enough". */
export function previewTableViews(
	run: Pick<TableAssignmentRun, 'tables'>,
	topics: readonly TableAssignmentTopic[],
	names: ReadonlyMap<string, string>,
): TableView[] {
	const closenessByNumber = new Map(
		run.tables.map((table) => [tableNumber(table.index), table.closeness]),
	);

	return tableViewsFromRun(run, topics, names).map((view) => ({
		...view,
		closeness: closenessByNumber.get(view.number) ?? 'notEnough',
	}));
}

/** Free mode: tables are derived from the topics, members are whoever joined that index. */
export function tableViewsFromDirect(
	tables: readonly DirectTable[],
	participants: readonly TableAssignmentRosterEntry[],
): TableView[] {
	return tables.map((table) => ({
		number: table.number,
		topicTitle: table.topicTitle,
		names: participants.filter((p) => p.chosenTableIndex === table.index).map((p) => p.fullName),
	}));
}

function card(table: TableView, capacity: number | undefined): m.Vnode {
	return m('li.table-card', { key: table.number }, [
		m('.table-card__head', [
			m('h2.table-card__number', t('tableAssignment.table.number', { number: table.number })),
			table.closeness
				? m(
						'span.pill',
						{ class: CLOSENESS_TONE[table.closeness] },
						t(`tableAssignment.closeness.${table.closeness}`),
					)
				: null,
			capacity
				? m(
						'span.table-card__size',
						t('tableAssignment.table.sizeOf', { count: table.names.length, capacity }),
					)
				: null,
		]),
		m('p.table-card__topic', { dir: 'auto' }, table.topicTitle),
		table.names.length === 0
			? m('p.table-card__empty', t('tableAssignment.table.empty'))
			: m(
					'ul.table-card__names',
					table.names.map((name, index) => m('li', { key: `${index}-${name}`, dir: 'auto' }, name)),
				),
	]);
}

export const TableCards: m.Component<TableCardsAttrs> = {
	view({ attrs }) {
		return m(
			'ul.tables',
			attrs.tables.map((table) => card(table, attrs.capacity)),
		);
	},
};
