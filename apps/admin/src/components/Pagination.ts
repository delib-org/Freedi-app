import m from 'mithril';

export interface PaginationAttrs {
	hasMore: boolean;
	loading: boolean;
	onLoadMore: () => void;
}

export const Pagination: m.Component<PaginationAttrs> = {
	view(vnode) {
		const { hasMore, loading, onLoadMore } = vnode.attrs;

		if (!hasMore) return null;

		return m(
			'.pagination',
			m(
				'button.pagination__btn',
				{
					onclick: onLoadMore,
					disabled: loading,
				},
				loading ? 'Loading...' : 'Load More'
			)
		);
	},
};
