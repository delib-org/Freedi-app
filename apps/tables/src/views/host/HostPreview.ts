import m from 'mithril';
import type { TableAssignmentRun } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { LiveValue } from '@/lib/live';
import { tablesApi } from '@/lib/tableAssignment/client';
import { subscribeRuns } from '@/lib/tableAssignment/data';
import { deriveDirectTables, seatCountsFromParticipants } from '@/logic/directTables';
import { latestRun } from '@/logic/runs';
import { canPublish, isDraftStale } from '@/logic/stale';
import { nameByUid } from '@/logic/participants';
import { HostFrame } from '@/components/HostFrame';
import type { HostContext } from '@/components/HostFrame';
import { MetricsPanel } from '@/components/MetricsPanel';
import { StateBox } from '@/components/StateBox';
import { TableCards, tableViewsFromDirect, tableViewsFromRun } from '@/components/TableCards';
import { hostScreenPath } from '@/paths';

interface PreviewBodyAttrs {
	context: HostContext;
}

const PreviewBody: m.ClosureComponent<PreviewBodyAttrs> = (initial) => {
	const sessionId = initial.attrs.context.session.tableAssignmentId;
	const runs = new LiveValue('runs', subscribeRuns(sessionId));
	const compute = new Action('tables.host.computePreview', 'tableAssignment.error.computeRefused');
	const publish = new Action('tables.host.publishRun', 'tableAssignment.error.publishStale');

	async function computeNow(): Promise<void> {
		await compute.run(() => tablesApi.computePreview({ sessionId }), { sessionId });
	}

	async function publishNow(run: TableAssignmentRun): Promise<void> {
		const result = await publish.run(() => tablesApi.publishRun({ sessionId, runId: run.runId }), {
			sessionId,
			runId: run.runId,
		});

		if (result) m.route.set(hostScreenPath(sessionId, 'assignment'));
	}

	function directLive(context: HostContext): m.Children {
		const { session, topics, participants } = context;
		const tables = deriveDirectTables(
			topics,
			seatCountsFromParticipants(participants),
			session.settings.tableSize ?? 0,
		);

		return [
			m('p.notice', { role: 'status' }, t('tableAssignment.preview.directLive')),
			tables.length === 0
				? m(StateBox, { kind: 'empty', messageKey: 'tableAssignment.topics.empty' })
				: m(TableCards, {
						tables: tableViewsFromDirect(tables, participants),
						capacity: session.settings.tableSize,
					}),
		];
	}

	function draft(context: HostContext, run: TableAssignmentRun): m.Children {
		const { session, topics, participants } = context;
		const staleInput = {
			run,
			settings: session.settings,
			registeredCount: participants.length,
			topicIds: topics.map((topic) => topic.topicId),
		};
		const stale = isDraftStale(staleInput);
		const publishable = canPublish(staleInput);
		const isPublished = run.status === 'published';

		return [
			run.status === 'computing'
				? m(StateBox, { kind: 'loading', messageKey: 'tableAssignment.preview.computing' })
				: [
						stale && !isPublished
							? m('p.notice.notice--warn', { role: 'alert' }, t('tableAssignment.preview.stale'))
							: null,
						isPublished
							? m('p.notice.notice--ok', { role: 'status' }, [
									t('tableAssignment.preview.alreadyPublished'),
									' ',
									m(
										m.route.Link,
										{ href: hostScreenPath(sessionId, 'assignment') },
										t('tableAssignment.screen.assignment'),
									),
								])
							: null,
						m(TableCards, {
							tables: tableViewsFromRun(run, topics, nameByUid(participants)),
							capacity: session.settings.tableSize,
						}),
						m(MetricsPanel, { metrics: run.metrics }),
						!isPublished
							? m('section.card.card--sticky', [
									publish.errorKey
										? m('p.notice.notice--error', { role: 'alert' }, t(publish.errorKey))
										: null,
									m(
										'button.btn.btn--primary',
										{
											type: 'button',
											disabled: !publishable || publish.busy,
											onclick: () => void publishNow(run),
										},
										t(publish.busy ? 'tableAssignment.saving' : 'tableAssignment.preview.publish'),
									),
								])
							: null,
					],
		];
	}

	return {
		oninit() {
			runs.start();
		},
		onremove() {
			runs.stop();
		},
		view({ attrs }) {
			const context = attrs.context;
			const { session } = context;

			if (session.mode === 'direct') return directLive(context);

			const closed = session.status === 'registrationClosed' || session.status === 'published';

			if (runs.state === 'loading') return m(StateBox, { kind: 'loading' });
			if (runs.state === 'denied' || runs.state === 'error') {
				return m(StateBox, { kind: runs.state, onRetry: () => runs.retry() });
			}

			const run = latestRun(runs.data ?? []);

			return [
				!closed ? m('p.notice', { role: 'status' }, t('tableAssignment.preview.closeFirst')) : null,
				m('section.card', [
					run === null ? m('p', t('tableAssignment.preview.empty')) : null,
					compute.errorKey
						? m('p.notice.notice--error', { role: 'alert' }, t(compute.errorKey))
						: null,
					m(
						'button',
						{
							class: run === null ? 'btn btn--primary' : 'btn btn--secondary',
							type: 'button',
							disabled: !closed || compute.busy,
							onclick: () => void computeNow(),
						},
						t(
							compute.busy
								? 'tableAssignment.preview.computing'
								: run === null
									? 'tableAssignment.preview.compute'
									: 'tableAssignment.preview.recompute',
						),
					),
				]),
				run ? draft(context, run) : null,
			];
		},
	};
};

/** `/host/sessions/:id/preview`: Assignment preview. */
export const HostPreview: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(HostFrame, {
			sessionId: attrs.id,
			titleKey: 'tableAssignment.screen.preview',
			topics: true,
			participants: true,
			wide: true,
			render: (context: HostContext) => m(PreviewBody, { context }),
		});
	},
};
