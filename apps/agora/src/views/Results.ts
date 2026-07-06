import m from 'mithril';
import { t } from '../lib/i18n';
import { EraMap } from '../components/EraMap';
import { VideoScene } from '../components/VideoScene';
import { AgoraSceneKind, AgoraSession, AgoraTopicPackage } from '@freedi/shared-types';

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

		const endingScene = topic.scenes.find(
			(scene) =>
				scene.kind ===
				(score.success ? AgoraSceneKind.successEnding : AgoraSceneKind.failureEnding),
		);

		return m('.shell.shell--wide', [
			m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
				m(EraMap, {
					participants: [],
					mood: score.success ? 'prosperous' : 'ruined',
				}),

				m('.card.results__score-panel', [
					m('p.teacher__section-title', t('results.class_score')),
					m(
						'.results__total',
						{ class: score.success ? 'results__total--success' : 'results__total--failure' },
						`${score.total}/100`,
					),
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
