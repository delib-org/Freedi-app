import m from 'mithril';
import { Layout } from '../components/Layout';
import { KpiCard } from '../components/KpiCard';
import { Spinner } from '../components/Spinner';
import { Badge } from '../components/Badge';
import { getMainAppUrl } from '../lib/links';
import { subscribeAdmins, unsubscribeAdmins, getAdminState } from '../state/admins';

export function AdminsView(): m.Component {
	let expandedUserId: string | null = null;

	return {
		oninit() {
			subscribeAdmins();
		},

		onremove() {
			unsubscribeAdmins();
		},

		view() {
			const state = getAdminState();

			return m(Layout, [
				m('.page-header', [
					m('h1.page-header__title', 'Admins'),
					m('p.page-header__subtitle', 'Admin distribution across statements'),
				]),

				m('.kpi-row', [
					m(KpiCard, {
						title: 'Unique Admins',
						value: state.totalUniqueAdmins,
						icon: '\u{1F6E1}',
						gradient: 'violet',
					}),
					m(KpiCard, {
						title: 'Admin Assignments',
						value: state.totalAssignments,
						icon: '\u{1F4CB}',
						gradient: 'blue',
					}),
				]),

				state.loading
					? m(Spinner)
					: state.entries.length === 0
						? m('.data-table__empty', 'No admins found')
						: m('.data-table', [
								m('.data-table__header', 'Admins by User'),
								m('table', [
									m(
										'thead',
										m('tr', [
											m('th', 'Admin'),
											m('th', 'User ID'),
											m('th', { style: { width: '100px' } }, 'Statements'),
											m('th', { style: { width: '80px' } }, ''),
										])
									),
									m(
										'tbody',
										state.entries.flatMap((entry) => {
											const isExpanded =
												expandedUserId === entry.userId;

											const rows: m.Vnode[] = [
												m(
													'tr',
													{
														key: entry.userId,
														onclick: () => {
															expandedUserId = isExpanded
																? null
																: entry.userId;
														},
														style: { cursor: 'pointer' },
													},
													[
														m('td', [
															m('strong', entry.displayName),
														]),
														m(
															'td',
															entry.userId.substring(0, 16) +
																'...'
														),
														m('td', [
															m(Badge, {
																text: String(
																	entry.statements.length
																),
																variant: 'blue',
															}),
														]),
														m(
															'td',
															isExpanded
																? '\u25B2'
																: '\u25BC'
														),
													]
												),
											];

											if (isExpanded) {
												rows.push(
													m(
														'tr.expand-row',
														{ key: entry.userId + '-detail' },
														m(
															'td',
															{ colspan: 4 },
															m(
																'.expand-row__content',
																entry.statements.map(
																	(stmt) =>
																		m(
																			'.breadcrumb',
																			{
																				key: stmt.statementId,
																				style: {
																					marginBottom:
																						'4px',
																				},
																			},
																			[
																				m(
																					Badge,
																					{
																						text: stmt.role,
																						variant:
																							'emerald',
																					}
																				),
																				m(
																					'a.app-link',
																					{
																						href: getMainAppUrl(
																							stmt.statementId
																						),
																						target: '_blank',
																						rel: 'noopener',
																						style: {
																							marginLeft:
																								'8px',
																						},
																					},
																					stmt.title
																				),
																			]
																		)
																)
															)
														)
													)
												);
											}

											return rows;
										})
									),
								]),
							]),

				state.error ? m('.data-table__empty', state.error) : null,
			]);
		},
	};
}
