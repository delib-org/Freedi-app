import m from 'mithril';
import { Layout } from '../components/Layout';
import { KpiCard } from '../components/KpiCard';
import { DataTable, ColumnConfig } from '../components/DataTable';
import { Pagination } from '../components/Pagination';
import { Spinner } from '../components/Spinner';
import { Badge } from '../components/Badge';
import { loadUsers, loadNextPage, getUsersState } from '../state/users';
import type { UserDoc } from '../lib/queries';

const columns: ColumnConfig<UserDoc>[] = [
	{
		key: 'name',
		label: 'Display Name',
		render: (u) => u.displayName || '(no name)',
		width: '200px',
	},
	{
		key: 'email',
		label: 'Email',
		render: (u) => u.email || '-',
		width: '250px',
	},
	{
		key: 'uid',
		label: 'UID',
		render: (u) => u.uid.substring(0, 12) + '...',
		width: '140px',
	},
	{
		key: 'anonymous',
		label: 'Type',
		render: (u) =>
			u.isAnonymous
				? m(Badge, { text: 'Anonymous', variant: 'gray' })
				: m(Badge, { text: 'Google', variant: 'blue' }),
		width: '100px',
	},
	{
		key: 'admin',
		label: 'System Admin',
		render: (u) =>
			u.systemAdmin
				? m(Badge, { text: 'Admin', variant: 'violet' })
				: '-',
		width: '110px',
	},
];

const UsersTable = DataTable<UserDoc>();

export function UsersView(): m.Component {
	return {
		oninit() {
			loadUsers();
		},

		view() {
			const state = getUsersState();

			const googleUsers = state.items.filter((u) => !u.isAnonymous).length;
			const anonymousUsers = state.items.filter((u) => u.isAnonymous).length;

			return m(Layout, [
				m('.page-header', [
					m('h1.page-header__title', 'Users'),
					m('p.page-header__subtitle', 'All registered users'),
				]),

				m('.kpi-row', [
					m(KpiCard, {
						title: 'Total Users',
						value: state.totalUsers,
						icon: '\u{1F465}',
						gradient: 'blue',
					}),
					m(KpiCard, {
						title: 'Google Users',
						value: googleUsers,
						icon: '\u{1F4E7}',
						gradient: 'teal',
					}),
					m(KpiCard, {
						title: 'Anonymous Users',
						value: anonymousUsers,
						icon: '\u{1F47B}',
						gradient: 'violet',
					}),
				]),

				state.loading
					? m(Spinner)
					: [
							m(UsersTable, {
								columns,
								data: state.items,
								emptyMessage: 'No users found',
							}),
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
