import m from 'mithril';
import {
	AGORA_RATING_LEVELS,
	addDist,
	calcAgoraClassConsensus,
	distMoments,
	eligiblePoolFor,
	emptyDist,
	type AgoraCamp,
	type AgoraClassConsensus,
	type AgoraProposalScore,
	type AgoraRatingDist,
} from '@freedi/shared-types';
import { t } from '../lib/i18n';
import type { AgoraProposal } from '../lib/proposals';

export interface ClassPictureAttrs {
	proposals: readonly AgoraProposal[];
	scores: Readonly<Record<string, AgoraProposalScore>>;
	/** Positioned students per camp, so a live view can size the pool itself */
	census?: { left: number; right: number; center: number };
	userId?: string;
	/** Server-computed reading for the end-of-game screen, when it exists */
	leadStatementId?: string;
}

interface Row {
	proposal: AgoraProposal;
	score: AgoraProposalScore;
	consensus: AgoraClassConsensus;
	isMine: boolean;
}

/** The five bucket labels, negative to positive */
const BUCKET_EMOJI = ['😠', '🙁', '😐', '🙂', '😍'] as const;

/**
 * The consensus a card should show. Prefers what the server wrote; falls back
 * to recomputing from the histogram so the live view moves the moment a
 * classmate rates, instead of waiting for the trigger to land.
 */
function readConsensus(
	score: AgoraProposalScore,
	census: ClassPictureAttrs['census'],
): AgoraClassConsensus | undefined {
	if (score.classConsensus) return score.classConsensus;
	if (!census) return undefined;

	// Same eligiblePoolFor the trigger uses, not a second copy of the rule —
	// otherwise the live number and the stored one could quietly disagree.
	return calcAgoraClassConsensus({
		perCamp: score.perCamp,
		eligible: eligiblePoolFor(score, census),
	});
}

function classDist(score: AgoraProposalScore): AgoraRatingDist {
	return [score.perCamp.left, score.perCamp.right, score.perCamp.center].reduce(
		(total, camp) => addDist(total, camp.studentDist ?? emptyDist()),
		emptyDist(),
	);
}

/** Percent position of a value in -1..1 on a left-to-right track */
function trackPercent(value: number): number {
	return ((Math.max(-1, Math.min(1, value)) + 1) / 2) * 100;
}

/**
 * The headline: where the class stands on this proposal, on its own -1..1
 * scale. Deliberately NOT a 0-100 bar — a class that is against a proposal has
 * to be able to show it, and a bar that bottoms out at zero cannot.
 */
function consensusMeter(consensus: AgoraClassConsensus): m.Children {
	const value = consensus.consensus;
	const positive = value >= 0;
	const zero = 50;
	const point = trackPercent(value);
	const start = Math.min(zero, point);
	const width = Math.abs(point - zero);

	return m('.class-picture__meter', [
		m('.class-picture__meter-track', [
			m('.class-picture__meter-zero'),
			m('.class-picture__meter-fill', {
				class: positive ? 'class-picture__meter-fill--for' : 'class-picture__meter-fill--against',
				style: { insetInlineStart: `${start}%`, width: `${width}%` },
			}),
		]),
		m('.class-picture__meter-ends', [
			m('span', t('picture.scale_against')),
			m('span', t('picture.scale_for')),
		]),
	]);
}

/**
 * The teaching moment of the whole screen.
 *
 * Two marks on one track: the raw average the class actually gave, and the
 * cautious score that hedges for the classmates who have not rated yet. The
 * gap between them IS the uncertainty, and it shrinks visibly as coverage
 * rises — closing to nothing at a census, where the caption changes to say the
 * whole class has spoken. No statistics vocabulary required.
 */
function confidenceBand(consensus: AgoraClassConsensus): m.Children {
	const missing = Math.max(0, consensus.eligible - consensus.n);
	const settled = missing === 0;

	return m('.class-picture__band', [
		m('.class-picture__band-track', [
			m('.class-picture__band-gap', {
				style: {
					insetInlineStart: `${Math.min(trackPercent(consensus.consensus), trackPercent(consensus.mean))}%`,
					width: `${Math.abs(trackPercent(consensus.mean) - trackPercent(consensus.consensus))}%`,
				},
			}),
			m('.class-picture__band-mark.class-picture__band-mark--mean', {
				style: { insetInlineStart: `${trackPercent(consensus.mean)}%` },
				title: t('picture.mark_mean'),
			}),
			m('.class-picture__band-mark.class-picture__band-mark--cautious', {
				style: { insetInlineStart: `${trackPercent(consensus.consensus)}%` },
				title: t('picture.mark_cautious'),
			}),
		]),
		m(
			'p.class-picture__band-caption',
			settled ? t('picture.band_settled') : t('picture.band_gap', { n: String(missing) }),
		),
	]);
}

/**
 * The shape of what the class said, not just its centre. This is the only
 * honest way to show a divided class: neither the consensus score nor
 * like-mindedness distinguishes "everyone lukewarm" from "half love it, half
 * hate it", because both are built from squares that discard sign.
 */
function opinionHistogram(dist: AgoraRatingDist): m.Children {
	const peak = Math.max(1, ...dist);

	return m(
		'.class-picture__histogram',
		AGORA_RATING_LEVELS.map((level, index) =>
			m('.class-picture__bucket', { key: level }, [
				m('.class-picture__bucket-column', [
					m('.class-picture__bucket-bar', {
						class:
							level < 0
								? 'class-picture__bucket-bar--against'
								: level > 0
									? 'class-picture__bucket-bar--for'
									: 'class-picture__bucket-bar--neutral',
						style: { height: `${(dist[index] / peak) * 100}%` },
					}),
				]),
				m('span.class-picture__bucket-count', String(dist[index])),
				m('span.class-picture__bucket-face', { 'aria-hidden': 'true' }, BUCKET_EMOJI[index]),
			]),
		),
	);
}

/** Per-camp support, so a proposal that only its own side backs reads as one */
function campSplit(score: AgoraProposalScore): m.Children {
	const camps: Array<{ key: AgoraCamp; label: string }> = [
		{ key: 'left' as AgoraCamp, label: t('picture.camp_left') },
		{ key: 'center' as AgoraCamp, label: t('picture.camp_center') },
		{ key: 'right' as AgoraCamp, label: t('picture.camp_right') },
	];

	return m(
		'.class-picture__camps',
		camps.map(({ key, label }) => {
			const moments = distMoments(score.perCamp[key].studentDist);
			const mean = moments.n > 0 ? moments.sum / moments.n : 0;

			return m(`.class-picture__camp.class-picture__camp--${key}`, { key }, [
				m('span.class-picture__camp-label', label),
				m('.class-picture__camp-track', [
					m('.class-picture__camp-fill', {
						style: { width: `${Math.max(0, mean) * 100}%` },
					}),
				]),
				m(
					'span.class-picture__camp-n',
					moments.n > 0
						? t('picture.camp_raters', { n: String(moments.n) })
						: t('picture.camp_none'),
				),
			]);
		}),
	);
}

/**
 * The class picture: where the class stands, how sure that is, what the spread
 * actually looks like, and how every proposal ranks. Shared by the live tab
 * during deliberation and the end-of-game recap, so the number a student
 * watched all lesson is the same number the results screen reports.
 */
export const ClassPicture: m.Component<ClassPictureAttrs> = {
	view(vnode) {
		const { proposals, scores, census, userId, leadStatementId } = vnode.attrs;

		const rows: Row[] = proposals
			.map((proposal) => {
				const score = scores[proposal.statementId];
				if (!score) return undefined;
				const consensus = readConsensus(score, census);
				if (!consensus) return undefined;

				return { proposal, score, consensus, isMine: proposal.creatorId === userId };
			})
			.filter((row): row is Row => row !== undefined)
			.sort((a, b) => b.consensus.consensus - a.consensus.consensus);

		if (rows.length === 0) {
			return m('.class-picture.class-picture--empty', [
				m('span.class-picture__empty-icon', { 'aria-hidden': 'true' }, '📊'),
				m('p.class-picture__empty', t('picture.empty')),
			]);
		}

		// The server names the winner once the lesson ends; while the lesson is
		// still running, the leader is simply whoever is on top right now.
		const lead = leadStatementId
			? (rows.find((row) => row.proposal.statementId === leadStatementId) ?? rows[0])
			: rows[0];

		return m('.class-picture', [
			m('.class-picture__lead', [
				m('p.class-picture__eyebrow', t('picture.lead_title')),
				m('p.class-picture__lead-text', lead.proposal.statement),
				m(
					'p.class-picture__lead-author',
					lead.isMine ? t('picture.lead_mine') : lead.proposal.anonName,
				),
				consensusMeter(lead.consensus),
				confidenceBand(lead.consensus),
				m(
					'p.class-picture__coverage',
					t('picture.coverage', {
						n: String(lead.consensus.n),
						total: String(lead.consensus.eligible),
					}),
				),
				m('p.class-picture__eyebrow', t('picture.spread_title')),
				opinionHistogram(classDist(lead.score)),
				campSplit(lead.score),
			]),

			m('.class-picture__list', [
				m('p.class-picture__eyebrow', t('picture.all_title')),
				...rows.map((row) =>
					m(
						'.class-picture__row',
						{
							key: row.proposal.statementId,
							class: row.isMine ? 'class-picture__row--mine' : undefined,
						},
						[
							m('.class-picture__row-head', [
								m(
									'span.class-picture__row-author',
									row.isMine ? t('picture.lead_mine') : row.proposal.anonName,
								),
								m(
									'span.class-picture__row-value',
									{
										class:
											row.consensus.consensus < 0 ? 'class-picture__row-value--against' : undefined,
									},
									row.consensus.consensus.toFixed(2),
								),
							]),
							m('p.class-picture__row-text', row.proposal.statement),
							consensusMeter(row.consensus),
							m(
								'span.class-picture__row-coverage',
								t('picture.coverage', {
									n: String(row.consensus.n),
									total: String(row.consensus.eligible),
								}),
							),
						],
					),
				),
			]),
		]);
	},
};
