import m from 'mithril';
import { supportBySide } from '@freedi/shared-types';
import type { ClassBallot } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { classState } from '@/lib/classroom/classState';
import { gateOf, sideNamesOf } from '@/lib/classroom/classSettings';
import { projectorData } from '@/lib/classroom/projectorData';
import {
	consensusOf,
	countsOf,
	orderBallot,
	voteOrderOf,
	voteResults,
} from '@/lib/classroom/voteResults';
import { onlyAboveGateOn, scopedIds } from '@/lib/classroom/voteScope';
import { presentCount, summaryOf } from '@/lib/classroom/voteSummary';
import type { SummaryRow, VoteSummary } from '@/lib/classroom/voteSummary';
import { playFlip, recordPositions } from '@/lib/flipReorder';
import type { Positions } from '@/lib/flipReorder';
import { GateStage } from './GateStage';
import { ballotOptions, gateView } from './gateLogic';
import { readBallot, studentsOf, supportPercent, tallyBars, voteStatus } from './projectorLogic';

/**
 * The projector's Vote and Summary steps. The tally follows the teacher's
 * order (C_p by default, votes, or one shared random order; a closed ballot is
 * ordered by votes) with a FLIP glide, and the Summary draws the same states as
 * the phones from the same `summaryOf` (IA 20 and 21).
 */

function barStyle(percent: number): Record<string, string> {
	return { '--bar': `${percent}%` };
}

// ---- vote ---------------------------------------------------------------------

/** The order the tally was last shown in (ties keep it). Reset when the challenge changes. */
let shownFor = '';
let shownOrder: string[] = [];

const before = new WeakMap<Element, Positions>();

/** A keyed list that glides when its rows re-order (instant under reduced motion). */
const GlideList: m.Component<{ class: string }> = {
	onbeforeupdate(vnode, old) {
		if (old.dom) before.set(old.dom, recordPositions(old.dom));
	},
	onupdate(vnode: m.VnodeDOM<{ class: string }>) {
		const positions = before.get(vnode.dom);
		if (!positions) return;
		before.delete(vnode.dom);
		playFlip(vnode.dom, positions);
	},
	view(vnode) {
		return m('ul', { class: vnode.attrs.class }, vnode.children);
	},
};

/** The ballot's ids the wall shows: all, or only those above the goal (the teacher's switch). */
function shownCandidateIds(ballot: ClassBallot): string[] {
	return scopedIds(
		ballot.candidateIds,
		projectorData.proposals,
		gateOf(projectorData.challenge, projectorData.main),
		onlyAboveGateOn(projectorData.challenge),
	).ids;
}

function orderedIds(): string[] {
	const challenge = projectorData.challenge;
	const ballot = readBallot(challenge);
	if (!ballot) return [];
	const challengeId = challenge?.statementId ?? '';
	if (challengeId !== shownFor) {
		shownFor = challengeId;
		shownOrder = [];
	}
	const selections = challenge?.selections as Record<string, number> | undefined;
	const votes = countsOf(voteResults(shownCandidateIds(ballot), selections));
	shownOrder = orderBallot(
		shownCandidateIds(ballot),
		typeof ballot.closedAt === 'number' ? 'result' : voteOrderOf(challenge),
		{ consensus: consensusOf(projectorData.proposals), votes },
		shownOrder,
		challengeId,
	);

	return shownOrder;
}

export function voteStage(): m.Vnode {
	const challenge = projectorData.challenge;
	const ballot = readBallot(challenge);
	const selections = challenge?.selections as Record<string, number> | undefined;
	const bars = ballot ? tallyBars(orderedIds(), selections, projectorData.proposals) : [];
	const candidates = ballot
		? ballotOptions(shownCandidateIds(ballot), projectorData.proposals)
		: [];
	const gate = gateOf(challenge, projectorData.main);
	const status = voteStatus(ballot);

	return m('section.projector-step.projector-step--vote', [
		m('h1.projector-instruction', t('projector.voteTitle')),
		status === 'open'
			? null
			: m(
					'p.projector-vote-status',
					{ role: 'status', 'data-status': status },
					t(status === 'paused' ? 'voting.paused' : 'voting.closed'),
				),
		candidates.length > 0
			? m(GateStage, { view: gateView(candidates, gate), showWaiting: true })
			: null,
		bars.length === 0
			? m('p.projector-empty', t('projector.noBallot'))
			: m(
					GlideList,
					{ class: 'projector-tally' },
					bars.map((bar) =>
						m('li.projector-tally__row', { key: bar.id, 'data-key': bar.id }, [
							m('span.projector-tally__text', bar.text),
							m('span.projector-tally__track', { style: barStyle(bar.percent) }, [
								m('span.projector-tally__fill'),
							]),
							m('span.projector-tally__count', bar.count),
						]),
					),
				),
	]);
}

// ---- summary ------------------------------------------------------------------

function votesLine(row: SummaryRow): string {
	return row.count === 1
		? t('voting.result_one_vote', { percent: row.percent })
		: t('voting.result_votes', { percent: row.percent, n: row.count });
}

function resultsBlock(summary: VoteSummary): m.Children {
	if (summary.kind === 'none') return null;
	const title =
		summary.kind === 'open'
			? t('summary.vote_open')
			: summary.kind === 'paused'
				? t('voting.paused')
				: t('summary.vote_results');

	return m('section.projector-results', [
		m('h2.projector-results__title', title),
		m(
			'ol.projector-results__rows',
			summary.rows.map((row) =>
				m(
					`li.projector-results__row${row.winner ? '.projector-results__row--winner' : ''}`,
					{ key: row.id },
					[
						m('span.projector-results__text', row.text),
						row.winner ? m('span.projector-results__tag', t('summary.winner')) : null,
						row.leading ? m('span.projector-results__tag', t('summary.leading')) : null,
						m('span.projector-results__track', { style: barStyle(row.percent) }, [
							m('span.projector-results__fill'),
						]),
						m('span.projector-results__count', votesLine(row)),
					],
				),
			),
		),
		m(
			'p.projector-results__turnout',
			t('summary.turnout', { n: summary.voted, m: summary.present }),
		),
		summary.tie ? m('p.projector-results__note', t('summary.tie_by_ratings')) : null,
		summary.kind === 'open' || summary.kind === 'paused'
			? m('p.projector-results__note', t('summary.wait_close'))
			: null,
	]);
}

function supportBlock(): m.Vnode {
	const challenge = projectorData.challenge;
	const names = sideNamesOf(projectorData.main);
	const support = supportBySide(
		studentsOf(classState.roster, projectorData.main?.creatorId),
		gateOf(challenge, projectorData.main),
	);
	const rows = [
		{ key: 'a', label: names.a, camp: support.a },
		{ key: 'center', label: t('projector.center'), camp: support.center },
		{ key: 'b', label: names.b, camp: support.b },
	];

	return m('section.projector-support-block', [
		m('p.projector-support__explain', t('summary.by_side_explain')),
		m(
			'ul.projector-support',
			{ 'aria-label': t('projector.supportTitle') },
			rows.map((row) =>
				m(`li.projector-support__row.projector-support__row--${row.key}`, { key: row.key }, [
					m('span.projector-support__label', row.label),
					m(
						'span.projector-support__track',
						{ style: barStyle(row.camp.n === 0 ? 0 : supportPercent(row.camp.mean)) },
						[m('span.projector-support__fill')],
					),
					m('span.projector-support__n', t('projector.rated', { n: row.camp.n, m: row.camp.m })),
				]),
			),
		),
		m(
			`p.projector-verdict.projector-verdict--${support.verdict}`,
			t(`summary.verdict_${support.verdict === 'insufficient' ? 'wait' : support.verdict}`),
		),
	]);
}

export function summaryStage(): m.Vnode {
	const challenge = projectorData.challenge;
	const summary = summaryOf({
		ballot: readBallot(challenge),
		selections: challenge?.selections as Record<string, number> | undefined,
		proposals: projectorData.proposals,
		present: presentCount(classState.roster, projectorData.main?.creatorId),
	});
	const decided = summary.kind === 'none' || summary.kind === 'closed';

	return m('section.projector-step.projector-step--summary', [
		summary.kind === 'none' ? m('p.projector-results__note', t('summary.no_vote')) : null,
		decided
			? m('.projector-decision', [
					m('p.projector-eyebrow', t('summary.decision')),
					m('p.projector-decision__text', summary.decisionText ?? t('projector.noDecision')),
					summary.mostAgreed ? m('p.projector-results__note', t('summary.most_agreed')) : null,
				])
			: null,
		resultsBlock(summary),
		summary.showSupport ? supportBlock() : null,
	]);
}
