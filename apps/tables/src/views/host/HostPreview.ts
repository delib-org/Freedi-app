import m from 'mithril';
import type { TableAssignmentRun } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { Action } from '@/lib/action';
import { LiveValue } from '@/lib/live';
import { goTo } from '@/lib/navigate';
import { computeAction } from '@/lib/tableAssignment/closeAndSplit';
import { tablesApi } from '@/lib/tableAssignment/client';
import { subscribeRuns } from '@/lib/tableAssignment/data';
import { deriveDirectTables, seatCountsFromParticipants } from '@/logic/directTables';
import { describeMetrics } from '@/logic/metrics';
import { nameByUid } from '@/logic/participants';
import { previewVerdict } from '@/logic/previewVerdict';
import type { PreviewVerdict } from '@/logic/previewVerdict';
import { latestRun } from '@/logic/runs';
import { canPublish, isDraftStale } from '@/logic/stale';
import { ChoiceSummary } from '@/components/ChoiceSummary';
import { HostFrame } from '@/components/HostFrame';
import type { HostContext } from '@/components/HostFrame';
import { MetricsPanel } from '@/components/MetricsPanel';
import { StateBox } from '@/components/StateBox';
import { TableCards, previewTableViews, tableViewsFromDirect } from '@/components/TableCards';
import { checkIcon } from '@/components/icons';
import { FixDetailsDialog } from '@/views/host/FixDetailsDialog';
import { hostScreenPath } from '@/paths';

interface PreviewBodyAttrs {
	context: HostContext;
}

const VERDICT_ICON_PX = 32;

const PreviewBody: m.ClosureComponent<PreviewBodyAttrs> = (initial) => {
	const sessionId = initial.attrs.context.session.tableAssignmentId;
	const runs = new LiveValue('runs', subscribeRuns(sessionId));
	const publish = new Action('tables.host.publishRun', 'tableAssignment.error.publishStale');
	let fixing = false;

	function computeNow(): void {
		void computeAction.run(() => tablesApi.computePreview({ sessionId }), { sessionId });
	}

	async function publishNow(run: TableAssignmentRun): Promise<void> {
		const result = await publish.run(() => tablesApi.publishRun({ sessionId, runId: run.runId }), {
			sessionId,
			runId: run.runId,
		});

		if (result) goTo(hostScreenPath(sessionId, 'assignment'));
	}

	function computeButton(primary: boolean, canCompute: boolean, firstTime: boolean): m.Vnode {
		return m(
			'button.btn',
			{
				type: 'button',
				class: primary ? 'btn--primary btn--cta' : 'btn--outline',
				disabled: !canCompute || computeAction.busy,
				onclick: computeNow,
			},
			t(
				computeAction.busy
					? 'tableAssignment.preview.computing'
					: firstTime
						? 'tableAssignment.preview.compute'
						: 'tableAssignment.preview.recompute',
			),
		);
	}

	function verdictSection(
		run: TableAssignmentRun,
		verdict: PreviewVerdict,
		publishable: boolean,
	): m.Vnode {
		const metrics = describeMetrics(run.metrics);
		const computeFirst = verdict !== 'good' && verdict !== 'choicesOnly';

		return m('section.verdict', [
			m('.verdict__main', [
				m('.verdict__head', [
					verdict === 'good' ? m('span.verdict__tick', checkIcon(VERDICT_ICON_PX)) : null,
					m('h1.verdict__title', t(`tableAssignment.preview.${verdict}.title`)),
				]),
				m(
					'p.verdict__lead',
					t(`tableAssignment.preview.${verdict}.lead`, {
						got: metrics.gotChosenTopic,
						total: metrics.rankedSeated,
					}),
				),
				m(ChoiceSummary, { view: metrics }),
			]),
			m('.verdict__actions', [
				computeFirst ? computeButton(true, true, false) : null,
				m(
					'button.btn',
					{
						type: 'button',
						class: computeFirst ? 'btn--outline' : 'btn--primary btn--cta',
						disabled: !publishable || publish.busy,
						onclick: () => void publishNow(run),
					},
					t(publish.busy ? 'tableAssignment.saving' : 'tableAssignment.preview.publish'),
				),
				computeFirst ? null : computeButton(false, true, false),
				publish.errorKey
					? m('p.notice.notice--error', { role: 'alert' }, t(publish.errorKey))
					: null,
				computeAction.errorKey
					? m('p.notice.notice--error', { role: 'alert' }, t(computeAction.errorKey))
					: null,
			]),
		]);
	}

	function readyRun(context: HostContext, run: TableAssignmentRun): m.Children {
		const { session, topics, participants } = context;
		const staleInput = {
			run,
			settings: session.settings,
			registeredUids: participants.map((person) => person.uid),
			topicIds: topics.map((topic) => topic.topicId),
		};
		const seatedTopics = new Set(run.tables.map((table) => table.topicId));

		return [
			verdictSection(
				run,
				previewVerdict(run.metrics, isDraftStale(staleInput)),
				canPublish(staleInput),
			),
			m(TableCards, { tables: previewTableViews(run, topics, nameByUid(participants)) }),
			m(MetricsPanel, {
				metrics: run.metrics,
				unusedTopics: topics.filter((topic) => !seatedTopics.has(topic.topicId)),
			}),
		];
	}

	function alreadyPublished(canCompute: boolean): m.Children {
		return m('section.card', [
			m('p.notice.notice--ok', { role: 'status' }, [
				t('tableAssignment.preview.alreadyPublished'),
				' ',
				m(
					m.route.Link,
					{ href: hostScreenPath(sessionId, 'assignment') },
					t('tableAssignment.screen.assignment'),
				),
			]),
			computeButton(false, canCompute, false),
		]);
	}

	function notComputed(canCompute: boolean): m.Vnode {
		return m('section.card', [
			m('p', t('tableAssignment.preview.empty')),
			computeAction.errorKey
				? m('p.notice.notice--error', { role: 'alert' }, t(computeAction.errorKey))
				: null,
			computeButton(true, canCompute, true),
		]);
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

	function head(context: HostContext): m.Vnode {
		return m('.preview__head', [
			m('span.preview__not-public', t('tableAssignment.preview.notPublic')),
			m(
				'button.btn.btn--text',
				{
					type: 'button',
					onclick: () => {
						fixing = true;
					},
				},
				t('tableAssignment.fixDetails'),
			),
			fixing
				? m(FixDetailsDialog, {
						session: context.session,
						topics: context.topics,
						onClose: () => {
							fixing = false;
						},
					})
				: null,
		]);
	}

	return {
		oninit() {
			runs.start();
		},
		onremove() {
			runs.stop();
		},
		view({ attrs }) {
			const { context } = attrs;
			const { session } = context;

			if (session.mode === 'direct') return directLive(context);
			if (runs.state === 'loading') return m(StateBox, { kind: 'loading' });
			if (runs.state === 'denied' || runs.state === 'error') {
				return m(StateBox, { kind: runs.state, onRetry: () => runs.retry() });
			}

			const canCompute = session.status === 'registrationClosed' || session.status === 'published';
			const run = latestRun(runs.data ?? []);

			return [
				head(context),
				canCompute
					? null
					: m('p.notice', { role: 'status' }, t('tableAssignment.preview.closeFirst')),
				run === null ? notComputed(canCompute) : null,
				run?.status === 'published' ? alreadyPublished(canCompute) : null,
				run?.status === 'computing'
					? m(StateBox, { kind: 'loading', messageKey: 'tableAssignment.preview.computing' })
					: null,
				run?.status === 'ready' ? readyRun(context, run) : null,
			];
		},
	};
};

/** `/host/sessions/:id/preview`: is this seating good, and do we publish it. */
export const HostPreview: m.Component<{ id: string }> = {
	view({ attrs }) {
		return m(HostFrame, {
			sessionId: attrs.id,
			titleKey: 'tableAssignment.screen.preview',
			topics: true,
			participants: true,
			wide: true,
			shellFor: () => ({ title: undefined }),
			render: (context: HostContext) => m(PreviewBody, { context }),
		});
	},
};
