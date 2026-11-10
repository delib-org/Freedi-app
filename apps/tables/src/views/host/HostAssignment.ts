import m from 'mithril';
import { getLang, t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { LiveValue } from '@/lib/live';
import { tablesApi } from '@/lib/tableAssignment/client';
import { subscribeRun } from '@/lib/tableAssignment/data';
import { deriveDirectTables, seatCountsFromParticipants } from '@/logic/directTables';
import { formatMoment } from '@/logic/format';
import { nameByUid } from '@/logic/participants';
import { HostFrame } from '@/components/HostFrame';
import type { HostContext } from '@/components/HostFrame';
import { StateBox } from '@/components/StateBox';
import { TableCards, tableViewsFromDirect, tableViewsFromRun } from '@/components/TableCards';
import { FixDetailsDialog } from '@/views/host/FixDetailsDialog';
import { backTargetFor } from '@/logic/hostBack';
import type { BackTarget } from '@/logic/hostBack';
import { hostScreenPath } from '@/paths';

interface AssignmentBodyAttrs {
	context: HostContext;
}

const AssignmentBody: m.ClosureComponent<AssignmentBodyAttrs> = () => {
	const end = new Action('tables.host.endSession', 'tableAssignment.error.statusRefused');
	let runId: string | undefined;
	let run = new LiveValue('publishedRun', subscribeRun(''));
	let fixing = false;

	/** Follow the session's published run: a newly published version swaps the listener. */
	function follow(next: string | undefined): void {
		if (next === runId) return;
		run.stop();
		runId = next;
		run = new LiveValue('publishedRun', subscribeRun(next ?? ''));
		if (next) run.start();
	}

	function actions(context: HostContext): m.Vnode {
		const { session } = context;
		const id = session.tableAssignmentId;
		const canFix = session.status !== 'ended';

		return m('.assignment__actions.no-print', [
			m(
				'a.btn.btn--soft',
				{ href: hostScreenPath(id, 'screen'), target: '_blank', rel: 'noopener' },
				t('tableAssignment.roomScreen.show'),
			),
			m(
				'button.btn.btn--outline',
				{ type: 'button', onclick: () => window.print() },
				t('tableAssignment.assignment.print'),
			),
			canFix && session.mode === 'ranked'
				? m(
						m.route.Link,
						{ href: hostScreenPath(id, 'preview'), class: 'btn btn--outline' },
						t('tableAssignment.preview.recompute'),
					)
				: null,
			canFix
				? m(
						'button.btn.btn--outline',
						{
							type: 'button',
							onclick: () => {
								fixing = true;
							},
						},
						t('tableAssignment.fixDetails'),
					)
				: null,
			canFix
				? m(
						'button.btn.btn--danger',
						{
							type: 'button',
							disabled: end.busy,
							onclick: () =>
								void end.run(() => tablesApi.setStatus({ sessionId: id, status: 'ended' }), {
									sessionId: id,
								}),
						},
						t('tableAssignment.control.ended'),
					)
				: null,
			end.errorKey ? m('p.notice.notice--error', { role: 'alert' }, t(end.errorKey)) : null,
		]);
	}

	function backProps(target: BackTarget): { backHref: string; backLabel: string } {
		return {
			backHref: target.href,
			backLabel: t(target.toList ? 'tableAssignment.back.toList' : 'tableAssignment.back'),
		};
	}

	function emptyState(home: BackTarget): m.Children {
		return m(StateBox, {
			kind: 'empty',
			messageKey: 'tableAssignment.assignment.empty',
			...backProps(home),
		});
	}

	function body(context: HostContext): m.Children {
		const { session, topics, participants } = context;
		const home = backTargetFor(session, 'assignment');

		if (session.mode === 'direct') {
			const tables = deriveDirectTables(
				topics,
				seatCountsFromParticipants(participants),
				session.settings.tableSize ?? 0,
			);

			return tables.length === 0
				? emptyState(home)
				: [
						m('p.card__hint', t('tableAssignment.assignment.directLive')),
						actions(context),
						m(TableCards, { tables: tableViewsFromDirect(tables, participants) }),
					];
		}

		if (!runId) return emptyState(home);
		if (run.state === 'loading') return m(StateBox, { kind: 'loading' });
		if (run.state === 'denied' || run.state === 'error') {
			return m(StateBox, { kind: run.state, onRetry: () => run.retry(), ...backProps(home) });
		}
		if (!run.data) return emptyState(home);

		const published = run.data;

		return [
			m('p.card__hint', [
				t('tableAssignment.assignment.version', {
					date:
						published.publishedAt === undefined
							? '-'
							: formatMoment(published.publishedAt, getLang()),
				}),
			]),
			actions(context),
			m(TableCards, { tables: tableViewsFromRun(published, topics, nameByUid(participants)) }),
		];
	}

	return {
		onremove() {
			run.stop();
		},
		view({ attrs }) {
			const { context } = attrs;

			follow(context.session.publishedRunId);

			return [
				body(context),
				fixing
					? m(FixDetailsDialog, {
							session: context.session,
							topics: context.topics,
							onClose: () => {
								fixing = false;
							},
						})
					: null,
			];
		},
	};
};

/** `/host/sessions/:id/assignment`: Published assignment: names, tables and print. */
export const HostAssignment: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(HostFrame, {
			sessionId: attrs.id,
			titleKey: 'tableAssignment.screen.assignment',
			stage: 'assignment',
			topics: true,
			participants: true,
			wide: true,
			render: (context: HostContext) => m(AssignmentBody, { context }),
		});
	},
};
