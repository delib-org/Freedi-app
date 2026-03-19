import m from 'mithril';

export interface ColumnConfig<T> {
	key: string;
	label: string;
	render: (item: T) => m.Children;
	sortable?: boolean;
	width?: string;
}

export interface DataTableAttrs<T> {
	columns: ColumnConfig<T>[];
	data: T[];
	title?: string;
	loading?: boolean;
	emptyMessage?: string;
	onRowClick?: (item: T) => void;
}

export function DataTable<T>(): m.Component<DataTableAttrs<T>> {
	return {
		view(vnode) {
			const { columns, data, title, loading, emptyMessage, onRowClick } =
				vnode.attrs;

			return m('.data-table', [
				title && m('.data-table__header', title),
				loading
					? m('.spinner.spinner--inline', m('.spinner__circle'))
					: data.length === 0
						? m('.data-table__empty', emptyMessage || 'No data')
						: m('table', [
								m(
									'thead',
									m(
										'tr',
										columns.map((col) =>
											m(
												'th',
												{
													style: col.width ? { width: col.width } : {},
												},
												col.label
											)
										)
									)
								),
								m(
									'tbody',
									data.map((item) =>
										m(
											'tr',
											{
												onclick: onRowClick
													? () => onRowClick(item)
													: undefined,
												style: onRowClick
													? { cursor: 'pointer' }
													: {},
											},
											columns.map((col) => m('td', col.render(item)))
										)
									)
								),
							]),
			]);
		},
	};
}
