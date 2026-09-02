import m from 'mithril';
import { t } from '../lib/i18n';
import { Icon } from '../components/Icon';
import { CarriedContext } from '../components/CarriedContext';
import { celebrateOnce } from '../lib/celebration';
import { getStagePlan } from '../lib/session';
import { VOTE_AGAINST, type AgoraParticipant, type AgoraSession } from '@freedi/shared-types';

export interface AgreementResultsAttrs {
	session: AgoraSession;
	myParticipant?: AgoraParticipant | null;
}

function formatMean(mean: number): string {
	const rounded = Math.round(mean * 10) / 10;

	return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`;
}

/**
 * The recap of a room scored on agreement — no camps, no before-picture:
 * what was decided, how the vote went, and every proposal by the net
 * support it earned. Written once by the server; this screen only reads.
 * A decision earns one burst of confetti per session, on first sight.
 */
export const AgreementResults: m.Component<AgreementResultsAttrs> = {
	view(vnode) {
		const { session, myParticipant } = vnode.attrs;
		const agreement = session.agreement;

		if (!agreement) {
			return m('.shell', [
				m('.shell__content', { style: { justifyContent: 'center', gap: 'var(--space-lg)' } }, [
					m('.spinner'),
					m('p.lobby__status.lobby__waiting-dots.text-center', t('results.computing')),
				]),
			]);
		}

		const byId = new Map(agreement.ranked.map((row) => [row.statementId, row]));
		const winner = agreement.voteWinnerStatementId
			? byId.get(agreement.voteWinnerStatementId)
			: undefined;
		const lead = agreement.leadStatementId ? byId.get(agreement.leadStatementId) : undefined;
		const voteHeld = agreement.voteTotal !== undefined && agreement.voteTotal > 0;
		const rejected = agreement.voteRejected === true;
		const decision = winner && agreement.voteWinnerMetThreshold !== false ? winner : undefined;
		const counts = agreement.voteCounts ?? {};
		const total = agreement.voteTotal ?? 0;

		if (decision) {
			celebrateOnce(`agreement-${session.sessionId}`, {
				message: t('results.agreement_celebrate'),
				detail: decision.statement,
				sound: 'applause',
			});
		}

		return m('.shell', [
			m('.shell__content.agreement', { style: { gap: 'var(--space-lg)' } }, [
				m('.card.agreement__decision', [
					m(
						'span.agreement__icon',
						{ 'aria-hidden': 'true' },
						m(Icon, { name: decision ? 'trophy' : rejected ? 'scales' : 'flag', size: 40 }),
					),
					m('p.teacher__section-title', t('results.agreement_title')),
					decision
						? [
								m('h2.agreement__headline', t('results.agreement_decision')),
								m('p.agreement__winner', decision.statement),
								decision.anonName ? m('p.agreement__who', decision.anonName) : null,
							]
						: rejected
							? [
									m('h2.agreement__headline', t('results.agreement_rejected')),
									winner
										? m('p.agreement__winner.agreement__winner--muted', winner.statement)
										: null,
								]
							: lead
								? [
										m('h2.agreement__headline', t('results.agreement_no_vote_lead')),
										m('p.agreement__winner', lead.statement),
										lead.anonName ? m('p.agreement__who', lead.anonName) : null,
									]
								: m('p.home-explanation', t('results.agreement_none')),
				]),

				voteHeld
					? m('.card.stack.agreement__vote', [
							m('p.teacher__section-title', t('voting.title')),
							m(
								'.agreement__tally',
								Object.entries(counts)
									.sort(([, a], [, b]) => b - a)
									.map(([statementId, count]) => {
										const row = byId.get(statementId);
										const share = total > 0 ? Math.round((count / total) * 100) : 0;
										const label =
											statementId === VOTE_AGAINST
												? t('voting.against')
												: (row?.statement ?? statementId);

										return m('.agreement__tally-row', { key: statementId }, [
											m('span.agreement__bar', {
												style: { inlineSize: `${share}%` },
												'aria-hidden': 'true',
											}),
											m('span.agreement__tally-label', label),
											m('span.agreement__tally-count', `${count} · ${share}%`),
										]);
									}),
							),
							m('p.voting__total', t('voting.total_votes', { n: String(total) })),
						])
					: null,

				m('.card.stack', [
					m('p.teacher__section-title', t('results.agreement_ranked')),
					agreement.ranked.length === 0
						? m('p.home-explanation', t('results.agreement_none'))
						: m(
								'ol.agreement__ranked',
								agreement.ranked.map((row) =>
									m(
										'li.agreement__row',
										{
											key: row.statementId,
											class:
												row.statementId === decision?.statementId
													? 'agreement__row--winner'
													: undefined,
										},
										[
											m('.agreement__row-head', [
												row.anonName ? m('span.question__who', row.anonName) : null,
												row.raters > 0
													? m(
															'span.question__agreement',
															t('question.net_agreement', {
																value: formatMean(row.mean),
																n: row.raters,
															}),
														)
													: m('span.question__agreement', t('results.agreement_unrated')),
											]),
											m('p.agreement__row-text', row.statement),
										],
									),
								),
							),
				]),

				m(CarriedContext, { session, beforeIndex: getStagePlan().length, defaultOpen: false }),

				myParticipant ? null : null,
			]),
		]);
	},
};
