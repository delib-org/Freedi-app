import m from 'mithril';
import { t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { tablesApi } from '@/lib/tableAssignment/client';
import { deriveDirectTables, isTableFull } from '@/logic/directTables';
import { canEditPreferences } from '@/logic/nextAction';
import { StateBox } from '@/components/StateBox';
import type { ParticipantContext } from '@/components/ParticipantFrame';
import { participantHomePath, participantScreenPath } from '@/paths';

/**
 * Direct mode ("choose a table"): one card per table with its topic and free
 * seats, and a "sit here" button. The server checks capacity atomically; a
 * full table answers failed-precondition and the list stays as it was.
 */
export const DirectPicker: m.ClosureComponent<{ context: ParticipantContext }> = (initial) => {
	const sessionId = initial.attrs.context.session.tableAssignmentId;
	const join = new Action('tables.participant.joinTable', 'tableAssignment.error.tableFull');
	let pendingIndex: number | null = null;

	async function sit(tableIndex: number): Promise<void> {
		pendingIndex = tableIndex;
		await join.run(() => tablesApi.joinTable({ sessionId, tableIndex }), { sessionId, tableIndex });
		pendingIndex = null;
	}

	return {
		view({ attrs }) {
			const { session, topics, me, everyone } = attrs.context;
			const home = participantHomePath(sessionId);

			if (!me) {
				return m(StateBox, {
					kind: 'denied',
					messageKey: 'tableAssignment.preferences.notRegistered',
					backHref: home,
					backLabel: t('tableAssignment.back.toHome'),
				});
			}
			if (attrs.context.topicsState === 'loading') return m(StateBox, { kind: 'loading' });
			if (attrs.context.topicsState !== 'ready') {
				return m(StateBox, {
					kind: attrs.context.topicsState,
					onRetry: attrs.context.retryTopics,
					backHref: home,
					backLabel: t('tableAssignment.back.toHome'),
				});
			}

			const tables = deriveDirectTables(topics, everyone, session.settings.tableSize ?? 0);

			if (tables.length === 0) {
				return m(StateBox, {
					kind: 'empty',
					messageKey: 'tableAssignment.topics.notOpen',
					backHref: home,
					backLabel: t('tableAssignment.back.toHome'),
				});
			}

			const editable = canEditPreferences(session.status);

			return [
				!editable
					? m('p.notice.notice--warn', { role: 'status' }, t('tableAssignment.preferences.closed'))
					: null,
				join.errorKey ? m('p.notice.notice--error', { role: 'alert' }, t(join.errorKey)) : null,
				everyone === null ? m('p.card__hint', t('tableAssignment.direct.seatsUnknown')) : null,
				m(
					'ul.stack',
					tables.map((table) => {
						const mine = me.chosenTableIndex === table.index;
						const full = isTableFull(table) && !mine;

						return m(
							'li.card.table-pick',
							{ key: table.index, class: mine ? 'table-pick--mine' : '' },
							[
								m(
									'h3.table-pick__number',
									t('tableAssignment.table.number', { number: table.number }),
								),
								m('p.table-pick__topic', table.topicTitle),
								table.free !== null
									? m(
											'p.card__hint',
											full
												? t('tableAssignment.direct.full')
												: t('tableAssignment.direct.free', { count: table.free }),
										)
									: null,
								mine
									? m('p.badge', t('tableAssignment.direct.yours'))
									: m(
											'button.btn.btn--primary',
											{
												type: 'button',
												disabled: !editable || full || join.busy,
												onclick: () => void sit(table.index),
											},
											t(
												pendingIndex === table.index && join.busy
													? 'tableAssignment.saving'
													: 'tableAssignment.direct.sit',
											),
										),
							],
						);
					}),
				),
				me.chosenTableIndex !== undefined
					? m(
							m.route.Link,
							{ href: participantScreenPath(sessionId, 'my-table'), class: 'btn btn--ghost' },
							t('tableAssignment.stage.seeMyTable'),
						)
					: null,
			];
		},
	};
};
