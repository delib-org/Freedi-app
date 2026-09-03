import m from 'mithril';
import { t } from '../../lib/i18n';
import { rankedAnswers } from '../QuestionStage';
import { CpBands, bandClassOf, bandLabelOf } from '../../components/CpBands';
import { getDeliberationState } from '../../lib/proposals';
import type { AgoraProposal } from '../../lib/proposals';
import {
	AgoraSession,
	AgoraStagePlanItem,
	evaluateVotingTrigger,
	resolveQuestionSelection,
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
									m(
										'span.question__agreement',
										row.raters > 0
											? t('question.net_agreement', { value: formatMean(row.mean), n: row.raters })
											: t('results.agreement_unrated'),
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
