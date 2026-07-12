import m from 'mithril';
import { t } from '../lib/i18n';
import {
	getDeliberationState,
	listenToDeliberation,
	stopDeliberationListeners,
	submitProposal,
	rateProposal,
	submitSuggestion,
	resolveSuggestion,
	improveWithAI,
	askCharacterReview,
	AgoraProposal,
} from '../lib/proposals';
import { CountdownTimer } from '../components/CountdownTimer';
import { PointsPill } from '../components/PointsPill';
import { EraMap, EraMapLantern } from '../components/EraMap';
import { NeedsPeek } from '../components/NeedsBoard';
import { celebrate } from '../lib/celebration';
import {
	AgoraCharacter,
	AgoraCharacterReview,
	AgoraParticipant,
	AgoraRoundPhase,
	AgoraSession,
	AgoraSuggestionStatus,
	AgoraTopicPackage,
	AGORA_AI_REVIEW,
	AGORA_LIMITS,
	createAgoraCharacterReviewId,
} from '@freedi/shared-types';

export interface DeliberationAttrs {
	session: AgoraSession;
	myParticipant: AgoraParticipant;
	userId: string;
	topic: AgoraTopicPackage;
}

export function lanternsFromState(
	proposals: readonly AgoraProposal[],
	scores: Readonly<
		Record<
			string,
			{
				bridgingScore: number;
				perCamp: {
					left: { sum: number; n: number };
					right: { sum: number; n: number };
					center: { sum: number; n: number };
				};
			}
		>
	>,
	userId: string,
): EraMapLantern[] {
	return proposals.map((proposal) => {
		const score = scores[proposal.statementId];
		const leftN = score?.perCamp.left.n ?? 0;
		const rightN = score?.perCamp.right.n ?? 0;
		const positives = (score?.perCamp.left.sum ?? 0) + (score?.perCamp.right.sum ?? 0);
		const raters = leftN + rightN + (score?.perCamp.center.n ?? 0);

		return {
			id: proposal.statementId,
			brightness: raters > 0 ? Math.max(0, Math.min(1, positives / Math.max(3, raters))) : 0.2,
			leftShare: leftN + rightN > 0 ? leftN / (leftN + rightN) : 0.5,
			bridging: (score?.bridgingScore ?? 0) / 100,
			isMine: proposal.creatorId === userId,
		};
	});
}

/** Support bars per camp for the "my proposal" panel */
function campSupportBar(
	label: string,
	colorVar: string,
	aggregate: { sum: number; n: number } | undefined,
): m.Children {
	const n = aggregate?.n ?? 0;
	const support = n > 0 ? Math.max(0, Math.min(1, (aggregate?.sum ?? 0) / n)) : 0;

	return m('.camp-bar', [
		m('span.camp-bar__label', { style: { color: `var(${colorVar})` } }, label),
		m('.camp-bar__track', [
			m('.camp-bar__fill', {
				style: {
					width: `${support * 100}%`,
					background: `var(${colorVar})`,
				},
			}),
		]),
		m('span.camp-bar__count', String(n)),
	]);
}

export function Deliberation(
	initialVnode: m.Vnode<DeliberationAttrs>,
): m.Component<DeliberationAttrs> {
	const { session, userId } = initialVnode.attrs;
	let draft = '';
	let coachNote = '';
	let aiBusy = false;
	let submitting = false;
	let suggestionDraft = '';
	let helpIndex = 0;
	let improveTab: 'help' | 'mine' = 'help';
	/** characterId → in-flight review request */
	const reviewBusy: Record<string, boolean> = {};

	listenToDeliberation(session.sessionId, userId);

	function characterReviewCard(
		live: AgoraSession,
		character: AgoraCharacter,
		myProposalId: string,
		review: AgoraCharacterReview | undefined,
	): m.Children {
		const asksUsed = review?.asksByRound?.[String(live.roundNumber)] ?? 0;
		const asksLeft = Math.max(0, AGORA_AI_REVIEW.MAX_ASKS_PER_CHARACTER_PER_ROUND - asksUsed);
		const busy = reviewBusy[character.characterId] === true;
		const ask = () => {
			reviewBusy[character.characterId] = true;
			askCharacterReview(live.sessionId, character.characterId, myProposalId)
				.catch((error: unknown) => {
					console.error('[Delib] Character review failed:', error);
				})
				.finally(() => {
					reviewBusy[character.characterId] = false;
					m.redraw();
				});
		};

		// No key: these cards are spread among unkeyed siblings, and Mithril
		// forbids mixed keyed/unkeyed fragments (two stable cards need no key)
		return m('.card.char-review', [
			m('.char-review__header', [
				character.portraitUrl
					? m('img.char-review__portrait', { src: character.portraitUrl, alt: character.name })
					: m('.char-review__portrait.char-review__portrait--fallback', character.name.charAt(0)),
				m('.char-review__who', [
					m('strong', character.name),
					m('span.char-review__role', character.role),
				]),
			]),
			busy
				? m('p.char-review__thinking', t('delib.character_thinking', { name: character.name }))
				: review
					? m('.stack', [
							m('p.char-review__bubble', review.verdictText),
							m('.char-review__meter', [
								m('.char-review__meter-track', [
									m('.char-review__meter-fill', {
										style: { width: `${review.acceptanceScore}%` },
									}),
								]),
								m('span.values__score', `${review.acceptanceScore}/100`),
							]),
							review.advice.length > 0
								? m('.stack', [
										m('p.teacher__section-title', t('delib.character_advice')),
										m(
											'ul.char-review__advice',
											review.advice.map((entry, index) => m('li', { key: index }, entry)),
										),
									])
								: null,
							m(
								'button.btn.btn--secondary',
								{ disabled: asksLeft === 0, onclick: ask },
								asksLeft > 0
									? `${t('delib.ask_again')} (${t('delib.asks_left', { n: asksLeft })})`
									: t('delib.no_asks_left'),
							),
						])
					: m(
							'button.btn.btn--secondary',
							{ disabled: asksLeft === 0, onclick: ask },
							t('delib.ask_character', { name: character.name }),
						),
		]);
	}

	return {
		onremove() {
			stopDeliberationListeners();
		},

		view(vnode) {
			const { session: live, myParticipant, topic } = vnode.attrs;
			const { proposals, suggestions, myRatings, scores, characterReviews } =
				getDeliberationState();
			const myProposal = proposals.find((proposal) => proposal.creatorId === userId);
			const anonName = myParticipant.anonName;

			const header = [
				live.roundPhase
					? m('.delib__header', [
							m('span.delib__round', t('delib.round', { n: live.roundNumber })),
							live.roundEndsAt ? m(CountdownTimer, { endsAt: live.roundEndsAt }) : null,
							m(PointsPill, { total: myParticipant.points.total }),
						])
					: null,
			];

			if (!live.roundPhase) {
				return m('.shell.shell--wide', [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						m(EraMap, {
							participants: [],
							lanterns: lanternsFromState(proposals, scores, userId),
						}),
						m('p.lobby__status.lobby__waiting-dots.text-center', t('delib.waiting_round')),
					]),
				]);
			}

			// ---------- PROPOSE ----------
			if (live.roundPhase === AgoraRoundPhase.propose) {
				if (myProposal && !draft) draft = myProposal.statement;

				return m('.shell', [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						...header,
						m('h2.text-center', t('delib.phase_propose')),
						m('p.home-explanation', t('delib.propose_hint')),
						m('textarea.text-input.values__textarea', {
							value: draft,
							rows: 6,
							maxlength: AGORA_LIMITS.MAX_PROPOSAL_LENGTH,
							placeholder: t('delib.placeholder'),
							oninput: (event: InputEvent) => {
								draft = (event.target as HTMLTextAreaElement).value;
							},
						}),
						m(NeedsPeek, { topic }),
						coachNote
							? m('.card.delib__coach', [m('strong', t('delib.coach_note')), m('p', coachNote)])
							: null,
						m('.delib__actions', [
							m(
								'button.btn.btn--secondary',
								{
									disabled: aiBusy || draft.trim().length < AGORA_LIMITS.MIN_PROPOSAL_LENGTH,
									onclick: () => {
										aiBusy = true;
										improveWithAI(live.sessionId, draft.trim())
											.then((result) => {
												draft = result.improvedText;
												coachNote = result.coachNote;
											})
											.catch((error: unknown) => {
												console.error('[Delib] AI improve failed:', error);
											})
											.finally(() => {
												aiBusy = false;
												m.redraw();
											});
									},
								},
								aiBusy ? t('delib.ai_thinking') : t('delib.improve_ai'),
							),
							m(
								'button.btn.btn--primary',
								{
									disabled: submitting || draft.trim().length < AGORA_LIMITS.MIN_PROPOSAL_LENGTH,
									onclick: () => {
										submitting = true;
										const isImprovement = Boolean(myProposal);
										const text = draft.trim();
										submitProposal(live, anonName, text, myProposal?.statementId)
											.then(() => {
												// Improving your own proposal earns glitter — the
												// behavior the game most wants to reinforce
												if (isImprovement) {
													celebrate({
														message: t('celebrate.proposal_improved'),
														detail: text,
													});
												}
											})
											.catch((error: unknown) => {
												console.error('[Delib] Submit proposal failed:', error);
											})
											.finally(() => {
												submitting = false;
												m.redraw();
											});
									},
								},
								myProposal ? t('delib.update_proposal') : t('delib.submit_proposal'),
							),
						]),
						myProposal ? m('p.text-center.values__score', t('delib.submitted')) : null,
					]),
				]);
			}

			// ---------- RATE ----------
			if (live.roundPhase === AgoraRoundPhase.rate) {
				const toRate = proposals.filter(
					(proposal) =>
						proposal.creatorId !== userId && myRatings[proposal.statementId] === undefined,
				);
				const current = toRate[0];

				return m('.shell', [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						...header,
						m('h2.text-center', t('delib.phase_rate')),
						m('p.home-explanation', t('delib.rate_hint')),
						m(NeedsPeek, { topic }),
						current
							? m('.card.delib__rate-card', [
									m('p.scene__text', current.statement),
									m('.delib__rate-buttons', [
										m(
											'button.btn.btn--rate.btn--rate-disagree',
											{
												onclick: () => {
													void rateProposal(live, current.statementId, -1);
												},
											},
											t('delib.disagree'),
										),
										m(
											'button.btn.btn--rate.btn--rate-agree',
											{
												onclick: () => {
													void rateProposal(live, current.statementId, 1);
												},
											},
											t('delib.agree'),
										),
									]),
								])
							: m('.text-center.stack', [m('.scene__waiting-glow'), m('h3', t('delib.rate_done'))]),
					]),
				]);
			}

			// ---------- IMPROVE ----------
			const others = proposals.filter((proposal) => proposal.creatorId !== userId);
			const helpTarget = others.length > 0 ? others[helpIndex % others.length] : undefined;
			const myScore = myProposal ? scores[myProposal.statementId] : undefined;
			const mySuggestions = myProposal ? (suggestions[myProposal.statementId] ?? []) : [];

			return m('.shell', [
				m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
					...header,
					m('h2.text-center', t('delib.phase_improve')),
					m(NeedsPeek, { topic }),
					m('.teacher__mode-row', [
						m(
							'button.btn',
							{
								class: improveTab === 'help' ? 'btn--primary' : 'btn--secondary',
								onclick: () => {
									improveTab = 'help';
								},
							},
							t('delib.help_others'),
						),
						m(
							'button.btn',
							{
								class: improveTab === 'mine' ? 'btn--primary' : 'btn--secondary',
								onclick: () => {
									improveTab = 'mine';
								},
							},
							t('delib.my_proposal'),
						),
					]),

					improveTab === 'help'
						? helpTarget
							? m('.stack', [
									m('.card', m('p.scene__text', helpTarget.statement)),
									m('textarea.text-input', {
										value: suggestionDraft,
										rows: 3,
										placeholder: t('delib.suggest_placeholder'),
										oninput: (event: InputEvent) => {
											suggestionDraft = (event.target as HTMLTextAreaElement).value;
										},
									}),
									m('.delib__actions', [
										m(
											'button.btn.btn--ghost',
											{
												onclick: () => {
													helpIndex++;
													suggestionDraft = '';
												},
											},
											t('delib.next_proposal'),
										),
										m(
											'button.btn.btn--primary',
											{
												disabled: suggestionDraft.trim().length < AGORA_LIMITS.MIN_ANSWER_LENGTH,
												onclick: () => {
													const text = suggestionDraft.trim();
													suggestionDraft = '';
													helpIndex++;
													void submitSuggestion(live, helpTarget, anonName, text);
												},
											},
											t('delib.send_suggestion'),
										),
									]),
								])
							: m('p.text-center.lobby__status', t('delib.no_more'))
						: myProposal
							? m('.stack', [
									m('.card', m('p.scene__text', myProposal.statement)),
									m('.card.stack', [
										m('p.teacher__section-title', t('delib.supporters')),
										campSupportBar('◀', '--camp-left-glow', myScore?.perCamp.left),
										campSupportBar('▶', '--camp-right-glow', myScore?.perCamp.right),
										m(
											'p.values__score',
											`${t('delib.bridging_score')}: ${myScore?.bridgingScore ?? 0}/100`,
										),
									]),
									m('p.teacher__section-title', t('delib.show_to_characters')),
									m('p.home-explanation', t('delib.character_review_hint')),
									...topic.characters.map((character) =>
										characterReviewCard(
											live,
											character,
											myProposal.statementId,
											characterReviews[
												createAgoraCharacterReviewId(myProposal.statementId, character.characterId)
											],
										),
									),
									m('p.teacher__section-title', t('delib.suggestions_received')),
									mySuggestions.length === 0
										? m('p.lobby__status', t('delib.no_suggestions'))
										: mySuggestions.map((suggestion) =>
												m('.card.stack', { key: suggestion.statementId }, [
													m('p', suggestion.statement),
													suggestion.suggestionStatus === AgoraSuggestionStatus.open
														? m('.delib__actions', [
																m(
																	'button.btn.btn--secondary',
																	{
																		onclick: () => {
																			void resolveSuggestion(
																				live.sessionId,
																				suggestion.statementId,
																				AgoraSuggestionStatus.thanked,
																			);
																		},
																	},
																	t('delib.thank'),
																),
																m(
																	'button.btn.btn--primary',
																	{
																		onclick: () => {
																			void resolveSuggestion(
																				live.sessionId,
																				suggestion.statementId,
																				AgoraSuggestionStatus.accepted,
																			);
																		},
																	},
																	t('delib.accept'),
																),
															])
														: m(
																'span.values__score',
																suggestion.suggestionStatus === AgoraSuggestionStatus.accepted
																	? t('delib.accepted')
																	: t('delib.thanked'),
															),
												]),
											),
								])
							: m('p.text-center.lobby__status', t('delib.no_proposal_yet')),
				]),
			]);
		},
	};
}
