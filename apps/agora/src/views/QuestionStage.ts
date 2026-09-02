import m from 'mithril';
import { t } from '../lib/i18n';
import { Icon } from '../components/Icon';
import { RateScale } from '../components/RateScale';
import { CarriedContext } from '../components/CarriedContext';
import { stalledBanner } from '../components/StalledBanner';
import {
	getDeliberationState,
	listenToDeliberation,
	saveAnswer,
	type AgoraProposal,
} from '../lib/proposals';
import { reportStageProgress } from '../lib/session';
import {
	AGORA_LIMITS,
	rankCarriedAnswers,
	type AgoraCarriedAnswer,
	type AgoraParticipant,
	type AgoraSession,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';

export interface QuestionStageAttrs {
	session: AgoraSession;
	item: AgoraStagePlanItem;
	planIndex: number;
	myParticipant: AgoraParticipant;
	userId: string;
	/** The room is ON this stage. False when a player stepped back to re-read it. */
	live: boolean;
}

/** Net agreement as the card prints it: a signed one-decimal figure */
function formatMean(mean: number): string {
	const rounded = Math.round(mean * 10) / 10;

	return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)}`;
}

function toRow(answer: AgoraProposal, named: boolean): AgoraCarriedAnswer {
	const raters = answer.evaluation?.numberOfEvaluators ?? 0;

	return {
		statementId: answer.statementId,
		statement: answer.statement,
		mean: raters > 0 ? (answer.evaluation?.averageEvaluation ?? 0) : 0,
		raters,
		...(named && answer.anonName ? { anonName: answer.anonName } : {}),
	};
}

/**
 * A question stage: the admin's question at the top, my answer, then
 * everyone else's answers arriving live to be weighed. Every answer is an
 * ordinary option Statement and every weighing an ordinary evaluation, so
 * the numbers on the cards are the shared pipeline's, not this screen's.
 *
 * Closed (the room moved on), the stage becomes its record: the outcome card
 * — what was carried forward and the summary — over the answers as they
 * stood, with the pen and the faces put away.
 */
export function QuestionStage(): m.Component<QuestionStageAttrs> {
	let draft = '';
	let draftFor = '';
	let saving = false;
	let saveFailed = false;

	return {
		view(vnode) {
			const { session, item, planIndex, myParticipant, userId, live } = vnode.attrs;
			listenToDeliberation(session.sessionId, userId);

			const named = session.identity === 'named';
			const state = getDeliberationState();
			const answers = item.statementId ? (state.answersByQuestion[item.statementId] ?? []) : [];
			const mine = answers.find((answer) => answer.creatorId === userId);
			const others = answers.filter((answer) => answer.creatorId !== userId);
			const outcome = session.stageState?.[item.itemId]?.outcome;
			const closed = !live || outcome !== undefined;

			// Pre-fill the pen with what I already wrote, once per answer text
			if (mine && draftFor !== `${mine.statementId}:${mine.statement}`) {
				draftFor = `${mine.statementId}:${mine.statement}`;
				draft = mine.statement;
			}

			// Least-rated first, mine excluded, the ones I rated after the ones I did not
			const ordered = [...others].sort((a, b) => {
				const aMine = state.myRatings[a.statementId] ? 1 : 0;
				const bMine = state.myRatings[b.statementId] ? 1 : 0;
				if (aMine !== bMine) return aMine - bMine;
				const aN = a.evaluation?.numberOfEvaluators ?? 0;
				const bN = b.evaluation?.numberOfEvaluators ?? 0;
				if (aN !== bN) return aN - bN;

				return a.createdAt - b.createdAt;
			});

			async function submit(): Promise<void> {
				const text = draft.trim();
				if (!text || saving || closed) return;
				saving = true;
				saveFailed = false;
				m.redraw();
				try {
					await saveAnswer(session, item, myParticipant.anonName, text);
					reportStageProgress(session.sessionId, userId, item.stage, 1, 1);
				} catch (error) {
					console.error('[Question] Saving the answer failed:', error);
					saveFailed = true;
				} finally {
					saving = false;
					m.redraw();
				}
			}

			const changed = draft.trim() !== (mine?.statement ?? '').trim();

			return m('.shell', [
				m('.shell__content.question', { style: { gap: 'var(--space-lg)' } }, [
					m('.card.question__ask', [
						m(
							'span.question__icon',
							{ 'aria-hidden': 'true' },
							m(Icon, { name: 'talk', size: 28 }),
						),
						m('h2.question__title', item.title ?? ''),
						item.explanation ? m('p.question__explanation', item.explanation) : null,
						closed && !outcome ? m('p.question__closed', t('question.closed')) : null,
					]),

					m(CarriedContext, { session, beforeIndex: planIndex, defaultOpen: false }),

					outcome
						? m('.card.stack.question__outcome', [
								m('p.teacher__section-title', t('question.outcome_title')),
								outcome.summary ? m('p.question__summary', outcome.summary) : null,
								outcome.selected.length > 0
									? m(
											'ol.question__selected',
											outcome.selected.map((answer) =>
												m('li.question__selected-item', { key: answer.statementId }, [
													answer.anonName ? m('span.question__who', answer.anonName) : null,
													m('span.question__selected-text', answer.statement),
													m(
														'span.question__agreement',
														t('question.net_agreement', {
															value: formatMean(answer.mean),
															n: answer.raters,
														}),
													),
												]),
											),
										)
									: m('p.home-explanation', t('question.no_answers')),
							])
						: null,

					// My answer — the pen, or my words as they stand
					m('.card.stack.question__mine', [
						m('p.teacher__section-title', t('question.your_answer')),
						closed
							? m('p.question__mine-text', mine ? mine.statement : t('question.no_answer_given'))
							: [
									m('textarea.question__textarea', {
										value: draft,
										rows: 3,
										maxlength: AGORA_LIMITS.MAX_PROPOSAL_LENGTH,
										placeholder: t('question.placeholder'),
										disabled: saving,
										oninput: (event: InputEvent) => {
											draft = (event.target as HTMLTextAreaElement).value;
										},
									}),
									stalledBanner(),
									saveFailed ? m('p.join__error', t('common.error')) : null,
									m(
										'button.btn.btn--primary.btn--full',
										{
											disabled: saving || !draft.trim() || (mine !== undefined && !changed),
											onclick: () => void submit(),
										},
										saving
											? t('question.saving_answer')
											: mine
												? changed
													? t('question.update')
													: t('question.saved')
												: t('question.save'),
									),
								],
					]),

					// Everyone else's, live
					m('.stack.question__others', [
						m('.question__others-head', [
							m('p.teacher__section-title', t('question.others_title')),
							m('span.question__count', String(others.length)),
						]),
						!closed && !mine
							? m('p.home-explanation', t('question.answer_first'))
							: ordered.length === 0
								? m('p.home-explanation', t('question.waiting_for_answers'))
								: m(
										'.question__list',
										ordered.map((answer, index) => {
											const myRating = state.myRatings[answer.statementId];
											const row = toRow(answer, named);
											const showNumbers = closed || myRating !== undefined;

											return m('.card.question__answer', { key: answer.statementId }, [
												m('.question__answer-head', [
													named && answer.anonName
														? m('span.question__who', answer.anonName)
														: m(
																'span.question__number',
																t('question.answer_number', { n: index + 1 }),
															),
													showNumbers && row.raters > 0
														? m(
																'span.question__agreement',
																t('question.net_agreement', {
																	value: formatMean(row.mean),
																	n: row.raters,
																}),
															)
														: null,
												]),
												m('p.question__answer-text', answer.statement),
												closed || !mine
													? null
													: m(RateScale, {
															session,
															proposalId: answer.statementId,
															parentId: item.statementId,
														}),
											]);
										}),
									),
					]),
				]),
			]);
		},
	};
}

/** The ranked answers of a question, for a panel that wants them without the pen */
export function rankedAnswers(
	answers: readonly AgoraProposal[],
	named: boolean,
): AgoraCarriedAnswer[] {
	return rankCarriedAnswers(answers.map((answer) => toRow(answer, named)));
}
