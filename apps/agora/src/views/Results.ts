import m from 'mithril';
import { t } from '../lib/i18n';
import { EraMap } from '../components/EraMap';
import { VideoScene } from '../components/VideoScene';
import {
	AgoraSceneKind,
	AgoraSession,
	AgoraSessionOutcome,
	AgoraTopicPackage,
} from '@freedi/shared-types';

export interface ResultsAttrs {
	session: AgoraSession;
	topic: AgoraTopicPackage;
}

function metricBar(
	label: string,
	min: number,
	max: number,
	baseline: number,
	value: number,
	narrative: string,
	higherIsBetter: boolean,
): m.Children {
	const span = Math.max(1, max - min);
	const baseFraction = (baseline - min) / span;
	const valueFraction = (value - min) / span;
	const improved = higherIsBetter ? value >= baseline : value <= baseline;

	return m('.metric', [
		m('.metric__head', [
			m('span.metric__label', label),
			m(
				'span.metric__delta',
				{ class: improved ? 'metric__delta--up' : 'metric__delta--down' },
				`${baseline} → ${value}`,
			),
		]),
		m('.metric__track', [
			m('.metric__baseline', { style: { insetInlineStart: `${baseFraction * 100}%` } }),
			m('.metric__fill', {
				class: improved ? undefined : 'metric__fill--down',
				style: { width: `${valueFraction * 100}%` },
			}),
		]),
		narrative ? m('p.metric__narrative', narrative) : null,
	]);
}

/**
 * The results + ending stage: the map transforms with the simulated fate
 * of the realm, the class score breaks down, and the success/failure
 * ending scene plays.
 */
export const Results: m.Component<ResultsAttrs> = {
	view(vnode) {
		const { session, topic } = vnode.attrs;
		const score = session.classScore;

		if (!score) {
			return m('.shell.shell--wide', [
				m('.shell__content', { style: { justifyContent: 'center', gap: 'var(--space-lg)' } }, [
					m(EraMap, { participants: [] }),
					m('.spinner'),
					m('p.lobby__status.lobby__waiting-dots.text-center', t('results.computing')),
				]),
			]);
		}

		// Sessions computed before the three-way outcome existed fall back on
		// the boolean
		const outcome =
			score.outcome ?? (score.success ? AgoraSessionOutcome.success : AgoraSessionOutcome.collapse);

		const endingKind =
			outcome === AgoraSessionOutcome.success
				? AgoraSceneKind.successEnding
				: outcome === AgoraSessionOutcome.honestDisagreement
					? AgoraSceneKind.honestDisagreementEnding
					: AgoraSceneKind.failureEnding;
		// Old topic packages lack the honest-disagreement scene — fall back to
		// the failure scene text while keeping the dignified framing around it
		const endingScene =
			topic.scenes.find((scene) => scene.kind === endingKind) ??
			topic.scenes.find((scene) => scene.kind === AgoraSceneKind.failureEnding);

		const mood =
			outcome === AgoraSessionOutcome.success
				? ('prosperous' as const)
				: outcome === AgoraSessionOutcome.honestDisagreement
					? ('dusk' as const)
					: ('ruined' as const);
		const totalClass =
			outcome === AgoraSessionOutcome.success
				? 'results__total--success'
				: outcome === AgoraSessionOutcome.honestDisagreement
					? 'results__total--honest'
					: 'results__total--failure';
		const outcomeLabel =
			outcome === AgoraSessionOutcome.success
				? t('results.outcome_success')
				: outcome === AgoraSessionOutcome.honestDisagreement
					? t('results.outcome_honest')
					: t('results.outcome_collapse');
		const debrief = score.debrief;
		const showFullDebrief = outcome !== AgoraSessionOutcome.success;

		return m('.shell.shell--wide', [
			m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
				m(EraMap, {
					participants: [],
					mood,
				}),

				m('.card.results__score-panel', [
					m('p.teacher__section-title', t('results.class_score')),
					m('.results__total', { class: totalClass }, `${score.total}/100`),
					m('p.results__outcome-label', outcomeLabel),
					m('.results__breakdown', [
						m('.results__part', [
							m('span.results__part-value', String(score.maxConsensus)),
							m('span.results__part-label', t('results.max_consensus')),
						]),
						m('.results__part', [
							m('span.results__part-value', String(score.personalPointsSum)),
							m('span.results__part-label', t('results.personal_points')),
						]),
						m('.results__part', [
							m('span.results__part-value', String(score.avgPlausibility)),
							m('span.results__part-label', t('results.plausibility')),
						]),
					]),
				]),

				m('.card.stack', [
					m('p.teacher__section-title', t('results.health_title')),
					...topic.healthMetrics.map((metric) => {
						const outcome = score.healthMetricOutcomes.find(
							(candidate) => candidate.metricId === metric.metricId,
						);

						return metricBar(
							metric.label,
							metric.min,
							metric.max,
							metric.baseline,
							outcome?.value ?? metric.baseline,
							outcome?.narrative ?? '',
							metric.higherIsBetter ?? true,
						);
					}),
				]),

				debrief &&
				(debrief.whatWentWell.length > 0 ||
					debrief.whatToTryNextTime.length > 0 ||
					debrief.encouragement)
					? m('.card.stack.results__debrief', [
							m('p.teacher__section-title', t('results.debrief_title')),
							showFullDebrief && debrief.whatWentWell.length > 0
								? m('.stack', [
										m('p.results__debrief-heading', t('results.went_well')),
										m(
											'ul.results__debrief-list',
											debrief.whatWentWell.map((entry, index) => m('li', { key: index }, entry)),
										),
									])
								: null,
							debrief.whatToTryNextTime.length > 0
								? m('.stack', [
										m('p.results__debrief-heading', t('results.try_next')),
										m(
											'ul.results__debrief-list',
											debrief.whatToTryNextTime.map((entry, index) =>
												m('li', { key: index }, entry),
											),
										),
									])
								: null,
							showFullDebrief && debrief.encouragement
								? m('p.results__debrief-encouragement', debrief.encouragement)
								: null,
						])
					: null,

				endingScene
					? m(VideoScene, {
							scene: endingScene,
							doneLabel: t('scene.continue'),
							onDone: () => {
								/* final scene — nothing further */
							},
						})
					: null,
			]),
		]);
	},
};
