import m from 'mithril';
import { t } from '@/lib/i18n';
import type { Band } from '@/logic/band';

/** The room and one table on the same axis: never a person, only each group's middle part. */
export interface TableBandAttrs {
	room: Band;
	table: Band;
}

function row(labelKey: string, band: Band, modifier: string): m.Vnode {
	return m('.band__row', [
		m('span.band__label', t(labelKey)),
		m(
			'span.band__track',
			m(`span.band__fill.band__fill--${modifier}`, {
				style: { '--band-start': `${band.start}%`, '--band-width': `${band.width}%` },
			}),
		),
	]);
}

export const TableBand: m.Component<TableBandAttrs> = {
	view({ attrs }) {
		return m('.band', { 'aria-hidden': 'true' }, [
			row('tableAssignment.preview.room', attrs.room, 'room'),
			row('tableAssignment.preview.table', attrs.table, 'table'),
		]);
	},
};
