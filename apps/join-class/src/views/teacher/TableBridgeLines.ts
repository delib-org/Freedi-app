import m from 'mithril';
import '@/styles/registration.scss';
import { isTableAlone, reservedSeatsOf } from '@freedi/shared-types';
import type { ClassTable } from '@freedi/shared-types';
import { t } from '@/lib/i18n';

/**
 * What a table of a connected lesson says besides its members (IA
 * tables-class-bridge 5.4): its topic, "אדם אחד בשולחן" when only one person is
 * present (a flag for the teacher, nothing merges by itself) and the registered
 * names that have not arrived under "עוד לא הגיעו". Never a position or a choice.
 */

export interface TableBridgeLinesAttrs {
	table: ClassTable;
	/** The lesson is connected to a registration: the lone-person flag is raised. */
	connected: boolean;
}

export const TableBridgeLines: m.Component<TableBridgeLinesAttrs> = {
	view({ attrs }) {
		const { table } = attrs;
		const reserved = reservedSeatsOf(table);
		const alone = attrs.connected && isTableAlone(table);
		if (!table.topic && !alone && reserved.length === 0) return null;

		return m('div.table-bridge', [
			table.topic
				? m('p.table-bridge__topic', { dir: 'auto', 'data-testid': 'table-topic' }, table.topic)
				: null,
			alone
				? m(
						'p.table-bridge__alone',
						{ role: 'status', 'data-testid': 'table-alone' },
						t('console.table_alone'),
					)
				: null,
			reserved.length > 0
				? [
						m('p.table-bridge__reserved-label', t('table.not_arrived')),
						m(
							'ul.table-bridge__reserved',
							{ 'data-testid': 'table-reserved', 'aria-label': t('table.not_arrived') },
							reserved.map((seat) =>
								m('li.table-bridge__reserved-name', { key: seat.seatId, dir: 'auto' }, seat.name),
							),
						),
					]
				: null,
		]);
	},
};
