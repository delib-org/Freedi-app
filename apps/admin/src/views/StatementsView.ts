import m from 'mithril';
import { Statement, StatementType } from '@freedi/shared-types';
import { Layout } from '../components/Layout';
import { DataTable, ColumnConfig } from '../components/DataTable';
import { FilterBar } from '../components/FilterBar';
import { Pagination } from '../components/Pagination';
import { Spinner } from '../components/Spinner';
import { Breadcrumb } from '../components/Breadcrumb';
import { statementTypeBadge, sourceAppBadge } from '../components/Badge';
import { getMainAppUrl } from '../lib/links';
import { buildBreadcrumb, BreadcrumbItem } from '../lib/breadcrumb';
import {
	loadStatements,
	loadNextPage,
	setFilter,
	getStatementsState,
} from '../state/statements';

const breadcrumbCache = new Map<string, BreadcrumbItem[]>();

const columns: ColumnConfig<Statement>[] = [
	{
		key: 'statement',
		label: 'Statement',
		render: (s) =>
			s.statement.length > 70
				? s.statement.substring(0, 67) + '...'
				: s.statement,
		width: '40%',
	},
	{
		key: 'type',
		label: 'Type',
		render: (s) => statementTypeBadge(s.statementType),
		width: '90px',
	},
	{
		key: 'sourceApp',
		label: 'App',
		render: (s) =>
			sourceAppBadge((s as Statement & { sourceApp?: string }).sourceApp),
		width: '110px',
	},
	{
		key: 'creator',
		label: 'Creator',
		render: (s) => s.creator?.displayName || 'Unknown',
		width: '140px',
	},
	{
		key: 'created',
		label: 'Created',
		render: (s) => new Date(s.createdAt).toLocaleDateString(),
		width: '100px',
	},
	{
		key: 'link',
		label: '',
		render: (s) =>
			m(
				'a.app-link',
				{
					href: getMainAppUrl(s.statementId, s.topParentId),
					target: '_blank',
					rel: 'noopener',
					onclick: (e: Event) => e.stopPropagation(),
				},
				'Open'
			),
		width: '60px',
	},
];

const StatementsTable = DataTable<Statement>();
const FilterBarComponent = FilterBar();

export function StatementsView(): m.Component {
	let expandedId: string | null = null;
	let loadingBreadcrumb = false;

	async function toggleExpand(statement: Statement): Promise<void> {
		if (expandedId === statement.statementId) {
			expandedId = null;
			m.redraw();
			return;
		}

		expandedId = statement.statementId;

		if (!breadcrumbCache.has(statement.statementId)) {
			loadingBreadcrumb = true;
			m.redraw();

			try {
				const trail = await buildBreadcrumb(statement.statementId);
				breadcrumbCache.set(statement.statementId, trail);
			} catch {
				breadcrumbCache.set(statement.statementId, []);
			}
			loadingBreadcrumb = false;
		}

		m.redraw();
	}

	return {
		oninit() {
			loadStatements();
		},

		view() {
			const state = getStatementsState();

			return m(Layout, [
				m('.page-header', [
					m('h1.page-header__title', 'Statements'),
					m('p.page-header__subtitle', 'Browse all statements across apps'),
				]),

				m(FilterBarComponent, {
					currentType: state.filter.statementType,
					searchText: state.filter.searchText,
					onTypeChange: (type: StatementType | undefined) =>
						setFilter({ statementType: type }),
					onSearch: (text: string) => setFilter({ searchText: text }),
				}),

				state.loading
					? m(Spinner)
					: [
							m(StatementsTable, {
								columns,
								data: state.items,
								emptyMessage: 'No statements found',
								onRowClick: (s: Statement) => toggleExpand(s),
							}),

							// Expanded breadcrumb
							expandedId &&
								m('.data-table', { style: { marginTop: '-1px' } }, [
									m('.expand-row', [
										m('td', { colspan: columns.length }, [
											m('.expand-row__content', [
												loadingBreadcrumb
													? m(Spinner, { inline: true })
													: m(Breadcrumb, {
															items:
																breadcrumbCache.get(expandedId) || [],
															topParentId:
																state.items.find(
																	(s) =>
																		s.statementId === expandedId
																)?.topParentId,
														}),
											]),
										]),
									]),
								]),

							m(Pagination, {
								hasMore: state.hasMore,
								loading: state.loadingMore,
								onLoadMore: () => loadNextPage(),
							}),
						],

				state.error && m('.data-table__empty', state.error),
			]);
		},
	};
}
