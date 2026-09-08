import m from 'mithril';
import { t } from '../lib/i18n';
import { Icon } from '../components/Icon';
import { LikeButton } from '../components/LikeButton';
import { UnitScale } from '../components/UnitScale';
import { CarriedContext } from '../components/CarriedContext';
import { stalledBanner } from '../components/StalledBanner';
import { proposalHue } from '../lib/looks';
import {
	getDeliberationState,
	likeStatement,
	listenToDeliberation,
	rateStatement,
	saveAnswer,
	type AgoraProposal,
} from '../lib/proposals';
import { reportStageProgress } from '../lib/session';
import { blankPen, penFor, typedInto, type Pen } from '../lib/flows/penState';
import { requestTeacherFocus } from '../lib/helpedFocus';
import {
	dealRound,
	extendDeal,
	rankedRest,
	readStoredDeal,
	roundRatedCount,
	storeDeal,
} from '../lib/flows/roundFlow';
import {
	AGORA_LIMITS,
	AGORA_ROUND,
	AGORA_ROUNDS,
	isUnitRating,
	rankRoundAnswers,
	roundLikes,
	roundProgress,
	roundSpecOf,
	type AgoraCarriedAnswer,
	type AgoraParticipant,
	type AgoraRoundKind,
	type AgoraSession,
	type AgoraStagePlanItem,
	type AgoraUnitRating,
} from '@freedi/shared-types';

export interface RoundStageAttrs {
	session: AgoraSession;
	item: AgoraStagePlanItem;
	planIndex: number;
	myParticipant: AgoraParticipant;
	userId: string;
	/** The room is ON this stage. False when a player stepped back to re-read it. */
	live: boolean;
}

/** A unit mean as the cards print it: a whole percent */
export function formatUnit(mean: number): string {
	return `${Math.round(Math.max(0, Math.min(1, mean)) * 100)}%`;
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

/** The one figure a round prints beside a text: hearts, or the percent */
function appreciationLine(kind: AgoraRoundKind, row: AgoraCarriedAnswer): string {
	if (AGORA_ROUNDS[kind].scale === 'like') return t('round.likes_n', { n: roundLikes(row) });

	return t('round.mean_n', { value: formatUnit(row.mean), n: row.raters });
}

/** My text, taken down by the teacher: a notice and the door to the thread */
function removedNotice(): m.Children {
	return m('.question__removed', { role: 'status' }, [
		m('p.round__mine-text', t('moderation.removed_title')),
		m(
			'button.btn.btn--secondary.btn--sm',
			{ type: 'button', onclick: () => requestTeacherFocus() },
			t('moderation.talk_to_teacher'),
		),
	]);
}

/**
 * One WizCol round — a question item whose kind is `story`, `needs` or
 * `vision`: the prompt at the top, my text, then a dealt handful of
 * classmates' texts to weigh on the round's own scale — a heart on a story,
 * five steps on a need or a vision. Every text is an ordinary option
 * Statement and every weighing an ordinary evaluation, so the hearts and
 * the percents on the cards are the shared pipeline's numbers.
 *
 * Closed (the room moved on), the round becomes its record: the AI's
 * summary over every text as it stood, with the pen and the widgets put
 * away. Never C_p bands — those are a −1…+1 reading and this scale is not.
 */
export function RoundStage(): m.Component<RoundStageAttrs> {
	let pen: Pen = blankPen;
	let saving = false;
	let saveFailed = false;
	/** The dealt ids, held for the life of the screen (and in sessionStorage) */
	let deal: string[] | null = null;
	let dealFor = '';
	/**
	 * The texts whose rating is in flight, one entry per text.
	 *
	 * It used to be a single `ratingBusy` slot for the whole screen, and while
	 * it held one text, every press on EVERY OTHER card was dropped on the
	 * floor — no write, no message, nothing. A student rating a column of
	 * classmates at the speed a 13-year-old actually taps lost most of their
	 * answers, and the round's own counter then told them they had not read
	 * them. Ratings of different texts are different documents and have no
	 * reason to queue behind each other; only a second press on the SAME text
	 * has to wait. See scripts/e2e-unit-scale.mjs.
	 */
	const rating = new Set<string>();
	/**
	 * A press that arrived while this text's own write was still going, held
	 * until it can be sent. Changing your mind is the one thing a rating scale
	 * exists for, and a student who taps 'quite' and then 'very' half a second
	 * later must end up on 'very' — not back where the slower press left them.
	 * Last press wins; only the last one is ever sent.
	 */
	const queued = new Map<string, AgoraUnitRating | 'like' | 'unlike'>();
	/** Texts whose last rating never landed — the card says so rather than swallowing it */
	const rateFailed = new Set<string>();
	let reported = '';

	return {
		view(vnode) {
			const { session, item, planIndex, myParticipant, userId, live } = vnode.attrs;
			const spec = roundSpecOf(item);
			if (!spec) return null;
			const kind: AgoraRoundKind = spec.kind;
			listenToDeliberation(session.sessionId, userId);

			const named = session.identity === 'named';
			const state = getDeliberationState();
			const answers = item.statementId ? (state.answersByQuestion[item.statementId] ?? []) : [];
			const mine = answers.find((answer) => answer.creatorId === userId);
			const others = answers.filter(
				(answer) => answer.creatorId !== userId && answer.hidden !== true,
			);
			const outcome = session.stageState?.[item.itemId]?.outcome;
			const closed = !live || outcome !== undefined;
			const isNeeds = kind === 'needs';

			// Empty for a new question, pre-filled with my own saved answer, and
			// otherwise left exactly as the student is typing it (lib/flows/penState)
			const nextPen = penFor(pen, item.itemId, mine);
			if (nextPen.itemId !== pen.itemId) {
				// A different question: a save error from the last one is not this one's
				saving = false;
				saveFailed = false;
				rating.clear();
				queued.clear();
				rateFailed.clear();
			}
			pen = nextPen;

			const rated = new Set(
				Object.keys(state.myRatings).filter(
					(statementId) => state.myRatings[statementId] !== undefined,
				),
			);
			const ratersOf = (statementId: string): number =>
				others.find((row) => row.statementId === statementId)?.evaluation?.numberOfEvaluators ?? 0;

			// The deal: once per item, held steady, filled only while short
			if (dealFor !== item.itemId) {
				dealFor = item.itemId;
				deal = readStoredDeal(session.sessionId, item.itemId);
			}
			if (!closed && mine) {
				const next = dealRound({
					others,
					userId,
					rated,
					ratersOf,
					sample: spec.sample,
					stored: deal,
				});
				if (
					deal === null ||
					next.length !== deal.length ||
					next.some((id, i) => id !== deal?.[i])
				) {
					deal = next;
					storeDeal(session.sessionId, item.itemId, next);
				}
			}
			const dealt = (deal ?? [])
				.map((statementId) => others.find((row) => row.statementId === statementId))
				.filter((row): row is AgoraProposal => row !== undefined);
			const ratedCount = roundRatedCount(deal ?? [], rated);
			const goal = Math.min(spec.sample, others.length);
			const goalMet = mine !== undefined && ratedCount >= goal;
			const moreLeft = others.length > (deal?.length ?? 0);

			const progress = roundProgress(mine !== undefined, ratedCount, goal);
			const progressKey = `${item.itemId}:${progress.done}/${progress.total}`;
			if (live && reported !== progressKey) {
				reported = progressKey;
				reportStageProgress(session.sessionId, userId, item.stage, progress.done, progress.total);
			}

			async function submit(): Promise<void> {
				const text = pen.text.trim();
				if (!text || saving || closed) return;
				saving = true;
				saveFailed = false;
				m.redraw();
				try {
					await saveAnswer(session, item, myParticipant.anonName, text);
				} catch (error) {
					console.error('[Round] Saving the text failed:', error);
					saveFailed = true;
				} finally {
					saving = false;
					m.redraw();
				}
			}

			async function weigh(
				statementId: string,
				value: AgoraUnitRating | 'like' | 'unlike',
			): Promise<void> {
				if (!item.statementId || closed) return;
				if (rating.has(statementId)) {
					queued.set(statementId, value);

					return;
				}
				rating.add(statementId);
				rateFailed.delete(statementId);
				m.redraw();
				try {
					if (value === 'like' || value === 'unlike') {
						await likeStatement(session, item.statementId, statementId, value === 'like');
					} else {
						await rateStatement(session, item.statementId, statementId, value);
					}
				} catch (error) {
					console.error('[Round] Weighing failed:', error);
					rateFailed.add(statementId);
				} finally {
					rating.delete(statementId);
					m.redraw();
				}

				const next = queued.get(statementId);
				if (next !== undefined) {
					queued.delete(statementId);
					await weigh(statementId, next);
				}
			}

			const changed = pen.text.trim() !== (mine?.statement ?? '').trim();
			const myRow = mine ? toRow(mine, named) : null;

			const widget = (answer: AgoraProposal): m.Children => {
				const myRating = state.myRatings[answer.statementId]?.value;
				if (spec.scale === 'like') {
					return m(LikeButton, {
						liked: myRating === AGORA_ROUND.LIKE,
						disabled: rating.has(answer.statementId),
						onToggle: (liked) => void weigh(answer.statementId, liked ? 'like' : 'unlike'),
					});
				}

				return m(UnitScale, {
					ask: t(`round.${kind}.unit_ask`),
					value: myRating !== undefined && isUnitRating(myRating) ? myRating : undefined,
					busy: rating.has(answer.statementId),
					failed: rateFailed.has(answer.statementId),
					onPick: (value) => void weigh(answer.statementId, value),
				});
			};

			const textCard = (answer: AgoraProposal, index: number, showFigure: boolean): m.Children => {
				const row = toRow(answer, named);

				return m(
					'.card.round__text',
					{ key: answer.statementId, 'data-hue': String(proposalHue(index + 1)) },
					[
						m('.round__text-head', [
							named && answer.anonName
								? m('span.round__who', answer.anonName)
								: m('span.round__number', t('round.text_number', { n: index + 1 })),
							showFigure && row.raters > 0
								? m('span.round__figure', appreciationLine(kind, row))
								: null,
						]),
						m('p.round__text-body', answer.statement),
						closed ? null : widget(answer),
					],
				);
			};

			const closedRows = outcome
				? outcome.selected
				: rankRoundAnswers(
						kind,
						others.map((row) => toRow(row, named)),
					);

			return m('.shell', [
				m('.shell__content.round', { class: `round--${kind}`, style: { gap: 'var(--space-lg)' } }, [
					m('.card.round__ask', [
						m(
							'span.round__icon',
							{ 'aria-hidden': 'true' },
							m(Icon, {
								name: kind === 'story' ? 'edit' : isNeeds ? 'target' : 'trend',
								size: 28,
							}),
						),
						m('h2.round__title', item.title?.trim() || t(`round.${kind}.prompt`)),
						m('p.round__explanation', item.explanation?.trim() || t(`round.${kind}.hint`)),
						closed && !outcome ? m('p.round__closed', t('round.closed')) : null,
					]),

					m(CarriedContext, {
						session,
						beforeIndex: planIndex,
						defaultOpen: kind !== 'story',
					}),

					outcome
						? m('.card.stack.round__outcome', [
								m('p.teacher__section-title', t(`round.${kind}.summary_title`)),
								outcome.summary
									? m('p.round__summary', outcome.summary)
									: m('p.home-explanation', t('round.no_texts')),
							])
						: null,

					// My text — the pen, or my words as they stand
					m('.card.stack.round__mine', [
						m('.round__text-head', [
							m('p.teacher__section-title', t('round.your_text')),
							myRow && myRow.raters > 0
								? m(
										'span.round__figure',
										t('round.appreciated_n', {
											n: spec.scale === 'like' ? roundLikes(myRow) : myRow.raters,
										}),
									)
								: null,
						]),
						mine?.hidden
							? removedNotice()
							: closed
								? m('p.round__mine-text', mine ? mine.statement : t('round.no_text_given'))
								: [
										isNeeds
											? m('p.round__lead', { 'aria-hidden': 'true' }, t('round.needs.lead'))
											: null,
										m('textarea.round__textarea', {
											value: pen.text,
											rows: kind === 'story' ? 5 : 3,
											maxlength: AGORA_LIMITS.MAX_PROPOSAL_LENGTH,
											placeholder: t(`round.${kind}.placeholder`),
											'aria-label': isNeeds ? t('round.needs.lead') : t('round.your_text'),
											disabled: saving,
											oninput: (event: InputEvent) => {
												pen = typedInto(pen, (event.target as HTMLTextAreaElement).value);
											},
										}),
										stalledBanner(),
										saveFailed ? m('p.join__error', t('common.error')) : null,
										m(
											'button.btn.btn--primary.btn--full',
											{
												class: mine !== undefined && !changed && !saving ? 'btn--done' : undefined,
												disabled: saving || !pen.text.trim() || (mine !== undefined && !changed),
												onclick: () => void submit(),
											},
											saving
												? t('round.saving')
												: mine
													? changed
														? t('round.update')
														: t('round.saved')
													: t('round.save'),
										),
									],
					]),

					// Classmates' texts: the dealt handful while open, every text once closed
					m('.stack.round__others', [
						m('.round__others-head', [
							m('p.teacher__section-title', t(`round.${kind}.read_title`)),
							closed
								? m('span.round__count', String(closedRows.length))
								: mine && goal > 0
									? m(
											'span.round__count',
											{ class: goalMet ? 'round__count--met' : undefined },
											t('round.read_n_of', { n: ratedCount, total: goal }),
										)
									: null,
						]),
						closed
							? closedRows.length === 0
								? m('p.home-explanation', t('round.no_texts'))
								: m(
										'.round__list',
										closedRows.map((row, index) =>
											m(
												'.card.round__text',
												{ key: row.statementId, 'data-hue': String(proposalHue(index + 1)) },
												[
													m('.round__text-head', [
														named && row.anonName
															? m('span.round__who', row.anonName)
															: m('span.round__number', t('round.text_number', { n: index + 1 })),
														row.raters > 0
															? m('span.round__figure', appreciationLine(kind, row))
															: null,
													]),
													m('p.round__text-body', row.statement),
												],
											),
										),
									)
							: !mine
								? m('p.home-explanation', t('round.answer_first'))
								: dealt.length === 0
									? m('p.home-explanation', t('round.waiting'))
									: [
											m(
												'.round__list',
												dealt.map((answer, index) => textCard(answer, index, false)),
											),
											goalMet && goal > 0
												? m('.round__goal', [
														m('p.round__goal-line', t('round.goal_met')),
														moreLeft
															? m(
																	'button.btn.btn--secondary.btn--sm',
																	{
																		type: 'button',
																		onclick: () => {
																			const rest = rankedRest({ others, userId, rated, ratersOf });
																			deal = extendDeal(deal ?? [], rest, spec.sample);
																			storeDeal(session.sessionId, item.itemId, deal);
																		},
																	},
																	t('round.rate_more'),
																)
															: null,
													])
												: null,
										],
					]),
				]),
			]);
		},
	};
}

/** The ranked texts of a round, for a panel that wants them without the pen */
export function rankedRoundAnswers(
	kind: AgoraRoundKind,
	answers: readonly AgoraProposal[],
	named: boolean,
): AgoraCarriedAnswer[] {
	return rankRoundAnswers(
		kind,
		answers.filter((answer) => answer.hidden !== true).map((answer) => toRow(answer, named)),
	);
}
