import m from 'mithril';
import { t, tCount } from '../../lib/i18n';
import { rankedAnswers } from '../QuestionStage';
import { formatUnit, rankedRoundAnswers } from '../RoundStage';
import { CpBands, bandClassOf, bandLabelOf } from '../../components/CpBands';
import { getDeliberationState } from '../../lib/proposals';
import { tallyRow, type RowTally } from '../../lib/flows/liveTally';
import type { AgoraProposal } from '../../lib/proposals';
import {
	AGORA_ROUNDS,
	AgoraSession,
	AgoraStagePlanItem,
	evaluateVotingTrigger,
	resolveQuestionSelection,
	roundLikes,
	roundSpecOf,
	selectCarriedAnswers,
} from '@freedi/shared-types';

/**
 * The teacher's deliberation-side cards: a question stage's ranked answers
 * and the auto-open-voting rule as it stands. Moved out of TeacherSession
 * with the voting cards — see VotingCards.ts.
 */

/** Net agreement as printed on the teacher's lists */
export function formatMean(mean: number): string {
	const rounded = Math.round(mean * 10) / 10;

	return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`;
}

/**
 * The figure under a text, and — while the trigger is still counting — what
 * the teacher can already be told.
 *
 * The aggregate is server-written and stays that way; a class that has just
 * spent a minute rating should not read "not rated yet" for the seconds it
 * takes to land. `lib/flows/liveTally` decides which of the two is true.
 */
function agreementCell(figure: string | null, tally: RowTally): m.Children {
	if (figure !== null) {
		return [
			m('span.question__agreement', figure),
			tally.state === 'behind'
				? m(
						'span.teacher-answers__catchup',
						{ title: t('teacher.catchup_title') },
						tCount('teacher.catchup_n', tally.pending),
					)
				: null,
		];
	}

	return tally.state === 'counting'
		? m(
				'span.question__agreement.teacher-answers__catchup',
				{ title: t('teacher.catchup_title') },
				tCount('teacher.counting_n', tally.weighed),
			)
		: m('span.question__agreement', t('results.agreement_unrated'));
}

/**
 * The live answers of the question the room is on, ranked by net agreement,
 * with the ones that would travel forward marked — the same arithmetic the
 * server closes the stage with — over the C_p banding of those same carried
 * answers, so the teacher can see what the room is actually behind before
 * deciding to move on.
 */
export function questionPanel(
	session: AgoraSession,
	item: AgoraStagePlanItem,
	answers: readonly AgoraProposal[],
	/** statementId → weighings already on the live timeline (see liveTally) */
	weighed: ReadonlyMap<string, number>,
): m.Children {
	const named = session.identity === 'named';
	const ranked = rankedAnswers(answers, named);
	const carried = new Set(
		selectCarriedAnswers(ranked, resolveQuestionSelection(item)).map((row) => row.statementId),
	);
	const outcome = session.stageState?.[item.itemId]?.outcome;

	const carriedRows = ranked.filter((row) => carried.has(row.statementId));

	return m('.card.stack.teacher-answers', [
		m('.class-progress__head', [
			m('p.teacher__section-title', t('teacher.answers_title')),
			m('span.class-progress__count', String(ranked.length)),
		]),
		outcome?.summary ? m('p.question__summary', outcome.summary) : null,
		// What the room is behind, banded by C_p — live while the question is
		// open (the bands, no prose), and the AI's record once it closes.
		carriedRows.length > 0
			? m(CpBands, { answers: outcome?.selected ?? carriedRows, bands: outcome?.bands })
			: null,
		ranked.length === 0
			? m('p.home-explanation', t('question.waiting_for_answers'))
			: m(
					'ol.teacher-answers__list',
					ranked.map((row) =>
						m(
							'li.teacher-answers__row',
							{
								key: row.statementId,
								class: carried.has(row.statementId) ? 'teacher-answers__row--carried' : undefined,
							},
							[
								m('.teacher-answers__head', [
									row.anonName ? m('span.question__who', row.anonName) : null,
									row.raters > 0
										? m(`span.${bandClassOf(row).split(' ').join('.')}`, bandLabelOf(row))
										: null,
									agreementCell(
										row.raters > 0
											? t('question.net_agreement', { value: formatMean(row.mean), n: row.raters })
											: null,
										tallyRow(row.raters, weighed.get(row.statementId) ?? 0),
									),
									carried.has(row.statementId)
										? m('span.teacher-answers__carried', t('teacher.will_carry'))
										: null,
								]),
								m('p.teacher-answers__text', row.statement),
							],
						),
					),
				),
		m('p.voting-settings__hint', t('teacher.answers_hint')),
	]);
}

/**
 * A WizCol round on the teacher's board: every text, most appreciated
 * first, with its hearts or its percent, and the AI's record once the
 * round has closed. Nothing "travels forward" selectively — every text is
 * carried, and no bands: the scale is not C_p's.
 */
export function roundPanel(
	session: AgoraSession,
	item: AgoraStagePlanItem,
	answers: readonly AgoraProposal[],
	/** statementId → weighings already on the live timeline (see liveTally) */
	weighed: ReadonlyMap<string, number>,
): m.Children {
	const spec = roundSpecOf(item);
	if (!spec) return null;
	const kind = spec.kind;
	const named = session.identity === 'named';
	const ranked = rankedRoundAnswers(kind, answers, named);
	const outcome = session.stageState?.[item.itemId]?.outcome;
	const like = AGORA_ROUNDS[kind].scale === 'like';

	return m('.card.stack.teacher-answers', [
		m('.class-progress__head', [
			m('p.teacher__section-title', t(`round.${kind}.read_title`)),
			m('span.class-progress__count', String(ranked.length)),
		]),
		outcome?.summary ? m('p.round__summary', outcome.summary) : null,
		ranked.length === 0
			? m('p.home-explanation', t('round.waiting'))
			: m(
					'ol.teacher-answers__list',
					ranked.map((row) =>
						m('li.teacher-answers__row', { key: row.statementId }, [
							m('.teacher-answers__head', [
								row.anonName ? m('span.question__who', row.anonName) : null,
								agreementCell(
									row.raters > 0
										? like
											? t('round.likes_n', { n: roundLikes(row) })
											: t('round.mean_n', { value: formatUnit(row.mean), n: row.raters })
										: null,
									tallyRow(row.raters, weighed.get(row.statementId) ?? 0),
								),
							]),
							m('p.teacher-answers__text', row.statement),
						]),
					),
				),
		m('p.voting-settings__hint', t(`round.${kind}.teacher_line`)),
	]);
}

/** The auto-open-voting rule as it stands right now, from the live scores */
export function triggerLine(item: AgoraStagePlanItem, hasVotingNext: boolean): m.Children {
	const rule = item.votingTrigger;
	if (!rule?.enabled || !hasVotingNext)
		return m('p.voting-settings__hint', t('teacher.trigger_off'));
	const rows = Object.values(getDeliberationState().scores)
		// A text the teacher took down is out of the running
		.filter((score) => score.hidden !== true)
		.map((score) => ({
			statementId: score.statementId,
			mean: score.classConsensus?.mean ?? 0,
			n: score.classConsensus?.n ?? 0,
		}));
	const verdict = evaluateVotingTrigger(rows, rule);
	if (verdict.fired) {
		return m('p.teacher-trigger.teacher-trigger--ready', t('teacher.trigger_ready'));
	}

	return m(
		'p.teacher-trigger',
		t('teacher.trigger_waiting', {
			single: rule.singleMin.toFixed(2),
			pair: rule.pairMin.toFixed(2),
			best: verdict.best === null ? '—' : formatMean(verdict.best),
			min: rule.minRaters,
		}),
	);
}
