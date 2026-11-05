import m from 'mithril';
import { getLang, t } from '@/lib/i18n';
import { LiveValue } from '@/lib/live';
import { subscribeRun } from '@/lib/tableAssignment/data';
import { deriveDirectTables, seatCountsFromParticipants } from '@/logic/directTables';
import { formatMoment } from '@/logic/format';
import { nameByUid } from '@/logic/participants';
import { HostFrame } from '@/components/HostFrame';
import type { HostContext } from '@/components/HostFrame';
import { StateBox } from '@/components/StateBox';
import { TableCards, tableViewsFromDirect, tableViewsFromRun } from '@/components/TableCards';
import { hostHomePath } from '@/paths';

interface AssignmentBodyAttrs {
	context: HostContext;
}

function printButton(): m.Vnode {
	return m(
		'button.btn.btn--secondary.no-print',
		{ type: 'button', onclick: () => window.print() },
		t('tableAssignment.assignment.print'),
	);
}

const AssignmentBody: m.ClosureComponent<AssignmentBodyAttrs> = () => {
	let runId: string | undefined;
	let run = new LiveValue('publishedRun', subscribeRun(''));

	/** Follow the session's published run: a newly published version swaps the listener. */
	function follow(next: string | undefined): void {
		if (next === runId) return;
		run.stop();
		runId = next;
		run = new LiveValue('publishedRun', subscribeRun(next ?? ''));
		if (next) run.start();
	}

	return {
		onremove() {
			run.stop();
		},
		view({ attrs }) {
			const { session, topics, participants } = attrs.context;

			follow(session.publishedRunId);
			const home = hostHomePath(session.tableAssignmentId);

			if (session.mode === 'direct') {
				const tables = deriveDirectTables(
					topics,
					seatCountsFromParticipants(participants),
					session.settings.tableSize ?? 0,
				);

				return tables.length === 0
					? m(StateBox, {
							kind: 'empty',
							messageKey: 'tableAssignment.assignment.empty',
							backHref: home,
							backLabel: t('tableAssignment.back.toHome'),
						})
					: [
							m('p.card__hint', t('tableAssignment.assignment.directLive')),
							printButton(),
							m(TableCards, { tables: tableViewsFromDirect(tables, participants) }),
						];
			}

			if (!runId) {
				return m(StateBox, {
					kind: 'empty',
					messageKey: 'tableAssignment.assignment.empty',
					backHref: home,
					backLabel: t('tableAssignment.back.toHome'),
				});
			}
			if (run.state === 'loading') return m(StateBox, { kind: 'loading' });
			if (run.state === 'denied' || run.state === 'error') {
				return m(StateBox, {
					kind: run.state,
					onRetry: () => run.retry(),
					backHref: home,
					backLabel: t('tableAssignment.back.toHome'),
				});
			}
			if (!run.data) {
				return m(StateBox, {
					kind: 'empty',
					messageKey: 'tableAssignment.assignment.empty',
					backHref: home,
					backLabel: t('tableAssignment.back.toHome'),
				});
			}

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
				printButton(),
				m(TableCards, { tables: tableViewsFromRun(published, topics, nameByUid(participants)) }),
			];
		},
	};
};

/** `/host/sessions/:id/assignment`: Published assignment. */
export const HostAssignment: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(HostFrame, {
			sessionId: attrs.id,
			titleKey: 'tableAssignment.screen.assignment',
			topics: true,
			participants: true,
			wide: true,
			render: (context: HostContext) => m(AssignmentBody, { context }),
		});
	},
};
