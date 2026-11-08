import m from 'mithril';
import { Icon, type IconName } from './Icon';
import { t } from '../lib/i18n';

export type WinnerRevealKind = 'decision' | 'rejected' | 'lead' | 'none';

export interface WinnerRevealAttrs {
	kind: WinnerRevealKind;
	/** The text being crowned (or, when rejected, the text that fell) */
	statement?: string;
	/** The author's in-game handle, in `named` sessions */
	anonName?: string;
	/** Votes the winner took, when a vote was held */
	votes?: number;
	voteTotal?: number;
}

/** Confetti pieces around the trophy — pure CSS, nothing under reduced motion */
const CONFETTI_COUNT = 24;

const KIND_ICON: Record<WinnerRevealKind, IconName> = {
	decision: 'trophy',
	rejected: 'scales',
	lead: 'crown',
	none: 'flag',
};

function headline(kind: WinnerRevealKind): string {
	switch (kind) {
		case 'decision':
			return t('results.agreement_decision');
		case 'rejected':
			return t('results.agreement_rejected');
		case 'lead':
			return t('results.agreement_no_vote_lead');
		default:
			return t('results.agreement_none');
	}
}

function share(votes: number, total: number): number {
	return total > 0 ? Math.round((votes / total) * 100) : 0;
}

/**
 * The decision as a reveal, not a label.
 *
 * The trophy drops in, the word "החלטנו!" pops, the winning text follows, and
 * the vote share lands as the one big number on the card — a scoreboard
 * moment the whole class sees at once. The confetti is decoration drawn
 * once on first paint; it collapses to nothing under prefers-reduced-motion,
 * and the celebration overlay (lib/celebration.ts) is still the thing that
 * announces the decision to a screen reader.
 */
export const WinnerReveal: m.Component<WinnerRevealAttrs> = {
	view(vnode) {
		const { kind, statement, anonName, votes, voteTotal } = vnode.attrs;
		const won = kind === 'decision';
		const voted = won && votes !== undefined && voteTotal !== undefined && voteTotal > 0;

		return m('.card.reveal', { class: `reveal--${kind}` }, [
			won
				? m(
						'.reveal__confetti',
						{ 'aria-hidden': 'true' },
						Array.from({ length: CONFETTI_COUNT }, (_unused, index) =>
							m('span.reveal__piece', { style: { '--piece-index': String(index) } }),
						),
					)
				: null,
			m(
				'span.reveal__icon',
				{ 'aria-hidden': 'true' },
				m(Icon, { name: KIND_ICON[kind], size: 44 }),
			),
			m('p.reveal__eyebrow', t('results.agreement_title')),
			m('h2.reveal__headline', headline(kind)),
			statement
				? m(
						'p.reveal__statement',
						{ class: kind === 'rejected' ? 'reveal__statement--muted' : undefined },
						statement,
					)
				: null,
			anonName ? m('p.reveal__who', anonName) : null,
			voted
				? m('.reveal__support', [
						m('span.reveal__support-value.scoreboard__num', `${share(votes, voteTotal)}%`),
						m(
							'span.reveal__support-label',
							t('scoreboard.winner_votes', { n: votes, total: voteTotal }),
						),
					])
				: null,
		]);
	},
};
