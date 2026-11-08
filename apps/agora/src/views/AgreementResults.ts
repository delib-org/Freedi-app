import m from 'mithril';
import { t } from '../lib/i18n';
import { CarriedContext } from '../components/CarriedContext';
import { celebrateOnce } from '../lib/celebration';
import { getSessionState, getStagePlan } from '../lib/session';
import { VOTE_AGAINST, type AgoraParticipant, type AgoraSession } from '@freedi/shared-types';
import { InstallOffer } from '../components/InstallOffer';
import { standingBar } from '../components/StandingBar';
import { WinnerReveal, type WinnerRevealKind } from '../components/WinnerReveal';
import { VoteTally } from '../components/VoteTally';
import { RankedProposals } from '../components/RankedProposals';
import { PointsLeaderboard } from '../components/PointsLeaderboard';

export interface AgreementResultsAttrs {
	session: AgoraSession;
	myParticipant?: AgoraParticipant | null;
}

/**
 * The recap of a room scored on agreement — no camps, no before-picture —
 * staged as a game reveal: the decision, then how the class voted, then
 * every proposal by agreement, then the class points board. Written once by
 * the server; this screen only reads. A decision earns one burst of
 * confetti per session, on first sight.
 *
 * Each section is a `.reveal-seq` child: the stylesheet staggers them in,
 * and prefers-reduced-motion turns the stagger off.
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
		// A one-candidate ballot was a motion — for or against — and its
		// tally stands as the same two pillars the class voted on
		const motion = session.voting?.candidates.length === 1 ? session.voting.candidates[0] : null;
		const shareOf = (count: number): number => (total > 0 ? Math.round((count / total) * 100) : 0);

		if (decision) {
			celebrateOnce(`agreement-${session.sessionId}`, {
				message: t('results.agreement_celebrate'),
				detail: decision.statement,
				sound: 'applause',
			});
		}

		const kind: WinnerRevealKind = decision
			? 'decision'
			: rejected
				? 'rejected'
				: lead
					? 'lead'
					: 'none';
		const crowned = decision ?? (rejected ? winner : lead);

		return m('.shell', [
			m('.shell__content.agreement.reveal-seq', { style: { gap: 'var(--space-lg)' } }, [
				m(WinnerReveal, {
					kind,
					statement: crowned?.statement,
					anonName: kind === 'rejected' ? undefined : crowned?.anonName,
					votes: decision ? (counts[decision.statementId] ?? 0) : undefined,
					voteTotal: decision ? total : undefined,
				}),

				voteHeld
					? m('.card.stack.agreement__vote', [
							motion
								? [
										m('p.teacher__section-title', t('voting.title')),
										m(
											'.voting__list.voting__list--binary',
											[
												{ id: motion.statementId, label: t('voting.for'), tone: 'for' },
												{ id: VOTE_AGAINST, label: t('voting.against'), tone: 'against' },
											].map(({ id, label, tone }) =>
												m(
													'.voting__option.voting__option--static.voting__option--standing',
													{ key: id, class: `voting__option--${tone}` },
													standingBar({
														label,
														count: counts[id] ?? 0,
														share: shareOf(counts[id] ?? 0),
														showCount: true,
													}),
												),
											),
										),
										m('p.voting__total', t('voting.total_votes', { n: String(total) })),
									]
								: m(VoteTally, { counts, total, byId, winnerId: decision?.statementId }),
						])
					: null,

				m(
					'.card.stack',
					m(RankedProposals, { ranked: agreement.ranked, winnerId: decision?.statementId }),
				),

				m(
					'.card.stack',
					m(PointsLeaderboard, {
						participants: getSessionState().participants,
						userId: myParticipant?.userId,
					}),
				),

				m(CarriedContext, { session, beforeIndex: getStagePlan().length, defaultOpen: false }),

				m(InstallOffer),
			]),
		]);
	},
};
