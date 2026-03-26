import m from 'mithril';
import { StatementType } from '@freedi/shared-types';

export interface FilterBarAttrs {
	onTypeChange: (type: StatementType | undefined) => void;
	onSearch: (text: string) => void;
	currentType?: StatementType;
	searchText?: string;
}

export function FilterBar(): m.Component<FilterBarAttrs> {
	let localSearch = '';

	return {
		view(vnode) {
			const { onTypeChange, onSearch, currentType } = vnode.attrs;

			const typeOptions: Array<{ value: string; label: string }> = [
				{ value: '', label: 'All Types' },
				...Object.values(StatementType).map((t) => ({
					value: t,
					label: t,
				})),
			];

			return m('.filter-bar', [
				m(
					'select.filter-bar__select',
					{
						value: currentType || '',
						onchange: (e: Event) => {
							const val = (e.target as HTMLSelectElement).value;
							onTypeChange(val ? (val as StatementType) : undefined);
						},
					},
					typeOptions.map((opt) =>
						m('option', { value: opt.value }, opt.label)
					)
				),
				m('input.filter-bar__input[type=text]', {
					placeholder: 'Search statements...',
					value: localSearch,
					oninput: (e: Event) => {
						localSearch = (e.target as HTMLInputElement).value;
					},
					onkeydown: (e: KeyboardEvent) => {
						if (e.key === 'Enter') {
							onSearch(localSearch);
						}
					},
				}),
			]);
		},
	};
}
