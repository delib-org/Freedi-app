import m from 'mithril';
import { t } from '../../lib/i18n';
import { getUserState, ensureUser } from '../../lib/user';
import { fetchSessionReport, type SessionReport } from '../../lib/teacher';
import { AgoraSessionOutcome } from '@freedi/shared-types';

const OUTCOME_KEY: Record<AgoraSessionOutcome, string> = {
	[AgoraSessionOutcome.success]: 'report.outcome_success',
	[AgoraSessionOutcome.honestDisagreement]: 'report.outcome_honest',
	[AgoraSessionOutcome.collapse]: 'report.outcome_collapse',
};

/**
 * A finished game, read once: the class score and outcome, every player's
 * points, and the vote verdict when one was held. All numbers are
 * server-written — this screen computes nothing.
 */
export function GameReport(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
	const sessionId = initialVnode.attrs.id;
	let report: SessionReport | null = null;
	let loaded = false;

	async function load(): Promise<void> {
		try {
			await ensureUser();
			report = await fetchSessionReport(sessionId);
		} catch (error) {
			console.error('[Teacher] Loading report failed:', error);
		}
		loaded = true;
		m.redraw();
	}

	void load();

	return {
		view() {
			const { loading } = getUserState();
			if (loading || !loaded) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}
			if (!report) {
				return m('.shell', [
					m('.shell__content.text-center', { style: { justifyContent: 'center' } }, [
						m('p.join__error', t('report.not_found')),
						m(
							'button.btn.btn--secondary',
							{ onclick: () => m.route.set('/teach') },
							t('common.back'),
						),
					]),
				]);
			}

			const { session, participants } = report;
			const score = session.classScore;
			const convergence = session.convergence;

			return m('.shell', [
				m('.home-header', [
					m('button.btn.btn--ghost', { onclick: () => m.route.set('/teach') }, t('common.back')),
				]),
				m('.shell__content', { style: { gap: 'var(--space-xl)' } }, [
					m('.stack', [
						m('h2', t('report.title')),
						m(
							'p.home-explanation',
							new Date(session.createdAt).toLocaleDateString(undefined, {
								day: 'numeric',
								month: 'long',
								year: 'numeric',
							}),
						),
					]),

					score
						? m('.card.report__score-card', [
								m('.report__score-main', [
									m('span.report__score-value', String(score.total)),
									m('span.roster__career-label', t('report.class_score')),
								]),
								score.outcome ? m('p.report__outcome', t(OUTCOME_KEY[score.outcome])) : null,
								m('.report__score-parts', [
									m('.roster__career-cell', [
										m('span.roster__career-value', String(score.maxConsensus)),
										m('span.roster__career-label', t('report.consensus')),
									]),
									m('.roster__career-cell', [
										m('span.roster__career-value', String(score.avgPlausibility)),
										m('span.roster__career-label', t('report.plausibility')),
									]),
									m('.roster__career-cell', [
										m('span.roster__career-value', String(score.personalPointsSum)),
										m('span.roster__career-label', t('report.points_sum')),
									]),
								]),
								score.debrief?.encouragement
									? m('p.home-explanation.report__debrief', score.debrief.encouragement)
									: null,
							])
						: convergence
							? m('.card.report__score-card', [
									m('.report__score-main', [
										m(
											'span.report__score-value',
											convergence.score !== null ? `${convergence.score}%` : '—',
										),
										m('span.roster__career-label', t('report.convergence')),
									]),
								])
							: m('p.home-explanation', t('report.not_scored')),

					m('.stack', [
						m('p.teacher__section-title', t('report.players')),
						participants.length === 0
							? m('p.home-explanation', t('report.no_players'))
							: m('.report__table', [
									m('.report__table-head', [
										m('span', t('report.col_player')),
										m('span', t('report.col_proposals')),
										m('span', t('report.col_helping')),
										m('span', t('report.col_total')),
									]),
									...participants.map((participant) =>
										// Unkeyed on purpose: the header row shares this fragment, and
										// Mithril refuses fragments that mix keyed and unkeyed vnodes.
										m('.report__table-row', [
											m('span.report__player', participant.anonName),
											m('span', String(participant.points.proposals)),
											m(
												'span',
												String(
													(participant.points.helping ?? 0) +
														(participant.points.rating ?? 0) +
														(participant.points.revising ?? 0),
												),
											),
											m('span.roster__stat--points', String(participant.points.total)),
										]),
									),
								]),
					]),
				]),
			]);
		},
	};
}
