import m from 'mithril';
import type {
	TableAssignmentParticipant,
	TableAssignmentRun,
	TableAssignmentTopic,
} from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import type { DirectTable } from '@/logic/directTables';
import { tableNumber } from '@/logic/format';

/** One table as the host reads it: number, topic, size and member names. */
export interface TableView {
	number: number;
	topicTitle: string;
	names: string[];
}

export interface TableCardsAttrs {
	tables: TableView[];
	/** Capacity, to print "4 of 7". Omitted on the published printout. */
	capacity?: number;
}

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

/** Direct mode: tables are derived from the topics, members are whoever joined that index. */
export function tableViewsFromDirect(
	tables: readonly DirectTable[],
	participants: readonly TableAssignmentParticipant[],
): TableView[] {
	return tables.map((table) => ({
		number: table.number,
		topicTitle: table.topicTitle,
		names: participants.filter((p) => p.chosenTableIndex === table.index).map((p) => p.fullName),
	}));
}

export const TableCards: m.Component<TableCardsAttrs> = {
	view({ attrs }) {
		return m(
			'ul.tables',
			attrs.tables.map((table) =>
				m('li.table-card', { key: table.number }, [
					m('.table-card__head', [
						m('h3.table-card__number', t('tableAssignment.table.number', { number: table.number })),
						m(
							'span.table-card__size',
							attrs.capacity
								? t('tableAssignment.table.sizeOf', {
										count: table.names.length,
										capacity: attrs.capacity,
									})
								: t('tableAssignment.table.size', { count: table.names.length }),
						),
					]),
					m('p.table-card__topic', table.topicTitle),
					table.names.length === 0
						? m('p.table-card__empty', t('tableAssignment.table.empty'))
						: m(
								'ul.names',
								table.names.map((name, index) =>
									m('li.names__item', { key: `${index}-${name}` }, name),
								),
							),
				]),
			),
		);
	},
};
