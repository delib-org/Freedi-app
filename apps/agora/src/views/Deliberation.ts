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
	AgoraRating,
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
	AgoraProposalScore,
	AgoraSession,
	AgoraSuggestionStatus,
	AgoraTopicPackage,
	AGORA_AI_REVIEW,
	AGORA_CYCLE,
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

/** Support bar per camp — named after the CHARACTERS' camps, counts as sentences */
function campSupportBar(
	label: string,
	colorVar: string,
	aggregate: { sum: number; n: number } | undefined,
): m.Children {
	const n = aggregate?.n ?? 0;
	const support = n > 0 ? Math.max(0, Math.min(1, (aggregate?.sum ?? 0) / n)) : 0;

	return m('.camp-bar', [
		m('span.camp-bar__dot', { style: { background: `var(${colorVar})` } }),
		m('span.camp-bar__label', { style: { color: `var(${colorVar})` } }, label),
		m('.camp-bar__track', [
			m('.camp-bar__fill', {
				style: {
					width: `${support * 100}%`,
					background: `var(${colorVar})`,
				},
			}),
		]),
		m('span.camp-bar__count', t('delib.raters_count', { n })),
	]);
}

function totalRaters(score: AgoraProposalScore | undefined): number {
	if (!score) return 0;

	return score.perCamp.left.n + score.perCamp.right.n + score.perCamp.center.n;
}

/** The five-level rating scale, MC-style, ordered strongest-against → strongest-for */
const RATE_OPTIONS: ReadonlyArray<{
	value: AgoraRating;
	variant: string;
	emoji: string;
	labelKey: string;
}> = [
	{ value: -1, variant: 'strong-against', emoji: '😠', labelKey: 'rate.strong_against' },
	{ value: -0.5, variant: 'against', emoji: '🙁', labelKey: 'rate.against' },
	{ value: 0, variant: 'abstain', emoji: '😐', labelKey: 'rate.abstain' },
	{ value: 0.5, variant: 'for', emoji: '🙂', labelKey: 'rate.for' },
	{ value: 1, variant: 'strong-for', emoji: '😍', labelKey: 'rate.strong_for' },
];

type CycleStep = 'mine' | 'rate' | 'help' | 'done';

interface CycleState {
	round: number;
	step: CycleStep;
	/** Ratings given so far in this cycle round */
	rated: number;
}

/**
 * The deliberation square as a PERSONAL cycle (the book's protocol, self-
 * paced): my proposal (write, then improve on later laps) → evaluate a few
 * classmates' proposals → help someone with a suggestion — repeated for
 * AGORA_CYCLE.ROUNDS laps. No teacher-synchronized phases; the teacher only
 * decides when the square closes (advance to results).
 */
export function Deliberation(
	initialVnode: m.Vnode<DeliberationAttrs>,
): m.Component<DeliberationAttrs> {
	const { session, userId } = initialVnode.attrs;
	let draft = '';
	let coachNote = '';
	let aiBusy = false;
	let submitting = false;
	let suggestionDraft = '';
	let helpSkips = 0;
	/** Edit panel open (feedback mode) — opened by ✏️ or by accepting a suggestion */
	let isEditing = false;
	/** Which character's verdict accordion is expanded */
	let openCharacterId = '';
	/** characterId → in-flight review request */
	const reviewBusy: Record<string, boolean> = {};

	const cycleKey = `agora_${session.sessionId}_cycle`;
	let cycle: CycleState = { round: 1, step: 'mine', rated: 0 };
	try {
		const stored = sessionStorage.getItem(cycleKey);
		if (stored) cycle = { ...cycle, ...(JSON.parse(stored) as Partial<CycleState>) };
	} catch {
		// Corrupt storage — start the cycle over
	}

	function setCycle(patch: Partial<CycleState>): void {
		cycle = { ...cycle, ...patch };
		sessionStorage.setItem(cycleKey, JSON.stringify(cycle));
		m.redraw();
	}

	function advanceRound(): void {
		if (cycle.round >= AGORA_CYCLE.ROUNDS) {
			setCycle({ step: 'done' });
		} else {
			setCycle({ round: cycle.round + 1, step: 'mine', rated: 0 });
			draft = '';
			coachNote = '';
		}
	}

	/** Deterministic per-student ordering so classmates fan out over different proposals */
	function studentOrder(id: string): number {
		const seed = `${userId}--${id}`;
		let hash = 0;
		for (let index = 0; index < seed.length; index++) {
			hash = (hash * 31 + seed.charCodeAt(index)) | 0;
		}

		return hash;
	}

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

	/** The hero: the student's own lantern — their proposal, read-only and glowing */
	function heroCard(myProposal: AgoraProposal, editable: boolean): m.Children {
		return m('.card.my-lantern', [
			m('.my-lantern__header', [
				m('span.my-lantern__icon', '🏮'),
				m('span.my-lantern__title', t('delib.my_proposal')),
				editable && !isEditing
					? m(
							'button.btn.btn--ghost.my-lantern__edit',
							{
								onclick: () => {
									draft = myProposal.statement;
									isEditing = true;
								},
							},
							`✏️ ${t('delib.update_proposal')}`,
						)
					: null,
			]),
			m('p.my-lantern__text', myProposal.statement),
		]);
	}

	/** "What does the square say?" — camp support, bridge power, received suggestions */
	function squareSays(
		live: AgoraSession,
		myProposal: AgoraProposal,
		topic: AgoraTopicPackage,
	): m.Children {
		const { suggestions, scores } = getDeliberationState();
		const myScore = scores[myProposal.statementId];
		const mySuggestions = suggestions[myProposal.statementId] ?? [];
		const raters = totalRaters(myScore);

		return m('.stack', [
			m('p.teacher__section-title', t('delib.square_says')),
			raters === 0
				? m('p.lobby__status.text-center', t('delib.no_raters_yet'))
				: m('.card.stack', [
						campSupportBar(
							topic.positioningScale.leftLabel,
							'--camp-left-glow',
							myScore?.perCamp.left,
						),
						campSupportBar(
							topic.positioningScale.rightLabel,
							'--camp-right-glow',
							myScore?.perCamp.right,
						),
						m('.char-review__meter', [
							m('span.values__score', t('delib.bridge_power')),
							m('.char-review__meter-track', [
								m('.char-review__meter-fill', {
									style: { width: `${myScore?.bridgingScore ?? 0}%` },
								}),
							]),
							m('span.values__score', `${myScore?.bridgingScore ?? 0}/100`),
						]),
						m('p.square-says__meaning', t('delib.bridge_meaning')),
					]),
			mySuggestions.length === 0
				? null
				: m('.stack', [
						m(
							'p.teacher__section-title',
							`${t('delib.suggestions_received')} (${mySuggestions.length})`,
						),
						// Nested array (own fragment) — keyed cards must not be spread
						// among unkeyed siblings (Mithril mixed-keys crash)
						mySuggestions.map((suggestion) =>
							m('.card.stack', { key: suggestion.statementId }, [
								suggestion.anonName
									? m(
											'p.char-review__role',
											t('delib.suggestion_from', { name: suggestion.anonName }),
										)
									: null,
								m('p', suggestion.statement),
								suggestion.suggestionStatus === AgoraSuggestionStatus.open
									? [
											m('.delib__actions', [
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
															// Accepting flows straight into weaving the
															// idea into your own text
															draft = myProposal.statement;
															isEditing = true;
														},
													},
													t('delib.accept'),
												),
											]),
											m('p.square-says__meaning', t('delib.accept_hint')),
										]
									: m(
											'span.values__score',
											suggestion.suggestionStatus === AgoraSuggestionStatus.accepted
												? t('delib.accepted')
												: t('delib.thanked'),
										),
							]),
						),
					]),
		]);
	}

	/** The characters as a compact tappable chip row; verdict expands beneath */
	function charChips(
		live: AgoraSession,
		myProposal: AgoraProposal,
		topic: AgoraTopicPackage,
	): m.Children {
		const { characterReviews } = getDeliberationState();
		const openCharacter = topic.characters.find(
			(character) => character.characterId === openCharacterId,
		);

		return m('.stack', [
			m('p.teacher__section-title', t('delib.ask_elders')),
			m(
				'.char-chips',
				topic.characters.map((character) => {
					const review =
						characterReviews[
							createAgoraCharacterReviewId(myProposal.statementId, character.characterId)
						];
					const open = openCharacterId === character.characterId;

					return m(
						'button.char-chips__chip',
						{
							class: open ? 'char-chips__chip--open' : undefined,
							'aria-expanded': String(open),
							onclick: () => {
								openCharacterId = open ? '' : character.characterId;
							},
						},
						[
							character.portraitUrl
								? m('img.char-review__portrait', {
										src: character.portraitUrl,
										alt: character.name,
									})
								: m(
										'.char-review__portrait.char-review__portrait--fallback',
										character.name.charAt(0),
									),
							m('span.char-chips__name', character.name),
							review
								? m('span.char-chips__score', `${review.acceptanceScore}/100`)
								: m('span.char-chips__cta', t('delib.ask_me')),
						],
					);
				}),
			),
			openCharacter
				? characterReviewCard(
						live,
						openCharacter,
						myProposal.statementId,
						getDeliberationState().characterReviews[
							createAgoraCharacterReviewId(myProposal.statementId, openCharacter.characterId)
						],
					)
				: null,
		]);
	}

	return {
		onremove() {
			stopDeliberationListeners();
		},

		view(vnode) {
			const { session: live, myParticipant, topic } = vnode.attrs;
			const { proposals, suggestions, myRatings, scores } = getDeliberationState();
			const myProposal = proposals.find((proposal) => proposal.creatorId === userId);
			const anonName = myParticipant.anonName;

			// Orientation strip: lap chip + the three steps of the loop, current
			// one lit. A dead countdown reads as "broken" — only show a live one.
			const STEPS: Array<{ id: CycleStep; labelKey: string }> = [
				{ id: 'mine', labelKey: 'delib.step_mine' },
				{ id: 'rate', labelKey: 'delib.step_rate' },
				{ id: 'help', labelKey: 'delib.step_help' },
			];
			const activeIndex = STEPS.findIndex((entry) => entry.id === cycle.step);
			const header = m('.cycle-strip', [
				m(
					'.cycle-strip__laps',
					{ 'aria-label': t('delib.cycle_round', { n: cycle.round, total: AGORA_CYCLE.ROUNDS }) },
					[
						Array.from({ length: AGORA_CYCLE.ROUNDS }, (_, index) =>
							m('span.cycle-strip__pip', {
								class:
									index + 1 < cycle.round
										? 'cycle-strip__pip--done'
										: index + 1 === cycle.round
											? 'cycle-strip__pip--current'
											: undefined,
							}),
						),
					],
				),
				m(
					'.cycle-strip__steps',
					STEPS.map((entry, index) =>
						m(
							'span.cycle-strip__step',
							{
								class:
									entry.id === cycle.step
										? 'cycle-strip__step--active'
										: activeIndex !== -1 && index < activeIndex
											? 'cycle-strip__step--done'
											: undefined,
							},
							`${index + 1} · ${t(entry.labelKey)}`,
						),
					),
				),
				live.roundEndsAt && live.roundEndsAt > Date.now()
					? m(CountdownTimer, { endsAt: live.roundEndsAt })
					: null,
				m(PointsPill, { total: myParticipant.points.total }),
			]);

			// ---------- STEP: MY PROPOSAL (write, later improve) ----------
			if (cycle.step === 'mine') {
				const writeMode = !myProposal;
				if (writeMode) isEditing = true;

				// The edit panel: textarea + needs board + AI coach + actions
				const editPanel = [
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
									const unchanged = myProposal?.statement === draft.trim();
									const text = draft.trim();
									submitProposal(live, anonName, text, myProposal?.statementId)
										.then(() => {
											// Improving your own proposal earns glitter — the
											// behavior the game most wants to reinforce
											if (isImprovement && !unchanged) {
												celebrate({
													message: t('celebrate.proposal_improved'),
													detail: text,
												});
											}
											isEditing = false;
											setCycle({ step: 'rate', rated: 0 });
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
					writeMode
						? null
						: m(
								'button.btn.btn--ghost.btn--full',
								{
									onclick: () => {
										isEditing = false;
										draft = '';
										coachNote = '';
									},
								},
								t('delib.cancel_edit'),
							),
				];

				// Lap 1: nothing exists yet — plain write screen
				if (writeMode) {
					return m('.shell', [
						m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
							header,
							m('h2.text-center', t('delib.phase_propose')),
							m('p.home-explanation', t('delib.propose_hint')),
							...editPanel,
						]),
					]);
				}

				// Lap 2+: hero (my lantern) → what the square says → improve → onward
				return m('.shell', [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						header,
						heroCard(myProposal, true),
						m('p.home-explanation', t('delib.improve_hint')),
						...(isEditing ? editPanel : []),
						squareSays(live, myProposal, topic),
						charChips(live, myProposal, topic),
						isEditing
							? null
							: m(
									'button.btn.btn--primary.btn--full.btn--lg',
									{
										onclick: () => {
											setCycle({ step: 'rate', rated: 0 });
										},
									},
									t('delib.to_rating'),
								),
					]),
				]);
			}

			// ---------- STEP: RATE OTHERS ----------
			if (cycle.step === 'rate') {
				// Fair attention: least-rated proposals first; deterministic
				// per-student tiebreak fans classmates out over different lanterns
				const candidates = proposals
					.filter(
						(proposal) =>
							proposal.creatorId !== userId && myRatings[proposal.statementId] === undefined,
					)
					.sort(
						(a, b) =>
							totalRaters(scores[a.statementId]) - totalRaters(scores[b.statementId]) ||
							studentOrder(a.statementId) - studentOrder(b.statementId),
					);
				const current = candidates[0];
				const quotaDone = cycle.rated >= AGORA_CYCLE.RATINGS_PER_ROUND;

				return m('.shell', [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						header,
						m('h2.text-center', t('delib.phase_rate')),
						m(
							'p.home-explanation',
							`${t('delib.rate_hint')} (${Math.min(cycle.rated + 1, AGORA_CYCLE.RATINGS_PER_ROUND)}/${AGORA_CYCLE.RATINGS_PER_ROUND})`,
						),
						m(NeedsPeek, { topic }),
						current && !quotaDone
							? m('.card.delib__rate-card', [
									m('p.scene__text', current.statement),
									m(
										'.rate-scale',
										RATE_OPTIONS.map((option) =>
											m(
												`button.rate-scale__option.rate-scale__option--${option.variant}`,
												{
													onclick: () => {
														void rateProposal(live, current.statementId, option.value);
														setCycle({ rated: cycle.rated + 1 });
													},
												},
												[
													m('span.rate-scale__emoji', option.emoji),
													m('span.rate-scale__label', t(option.labelKey)),
												],
											),
										),
									),
								])
							: m('.text-center.stack', [
									m('.scene__waiting-glow'),
									m('h3', quotaDone ? t('delib.rate_done') : t('delib.nothing_to_rate')),
								]),
						current && !quotaDone
							? null
							: m(
									'button.btn.btn--primary.btn--full',
									{
										onclick: () => {
											setCycle({ step: 'help' });
										},
									},
									t('delib.to_helping'),
								),
					]),
				]);
			}

			// ---------- STEP: HELP SOMEONE ----------
			if (cycle.step === 'help') {
				// Spread the help: proposals with the fewest open suggestions first
				const openSuggestions = (proposal: AgoraProposal) =>
					(suggestions[proposal.statementId] ?? []).filter(
						(entry) => entry.suggestionStatus === AgoraSuggestionStatus.open,
					).length;
				const targets = proposals
					.filter((proposal) => proposal.creatorId !== userId)
					.sort(
						(a, b) =>
							openSuggestions(a) - openSuggestions(b) ||
							studentOrder(a.statementId) - studentOrder(b.statementId),
					);
				const helpTarget = targets.length > 0 ? targets[helpSkips % targets.length] : undefined;

				return m('.shell', [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						header,
						m('h2.text-center', t('delib.help_others')),
						m('p.home-explanation', t('delib.help_hint')),
						m(NeedsPeek, { topic }),
						helpTarget
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
													helpSkips++;
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
													void submitSuggestion(live, helpTarget, anonName, text);
													advanceRound();
												},
											},
											t('delib.send_suggestion'),
										),
									]),
								])
							: m('p.text-center.lobby__status', t('delib.no_more')),
						m(
							'button.btn.btn--ghost.btn--full',
							{ onclick: advanceRound },
							cycle.round >= AGORA_CYCLE.ROUNDS ? t('delib.finish_cycles') : t('delib.skip_help'),
						),
					]),
				]);
			}

			// ---------- DONE: all cycles complete ----------
			return m('.shell.shell--wide', [
				m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
					header,
					m(EraMap, {
						participants: [],
						lanterns: lanternsFromState(proposals, scores, userId),
					}),
					m('h3.text-center', t('delib.cycle_done_title')),
					m('p.home-explanation', t('delib.cycle_done_hint')),
					myProposal
						? [
								heroCard(myProposal, false),
								squareSays(live, myProposal, topic),
								charChips(live, myProposal, topic),
							]
						: null,
					m(
						'button.btn.btn--secondary.btn--full',
						{
							onclick: () => {
								setCycle({ round: AGORA_CYCLE.ROUNDS, step: 'help' });
							},
						},
						t('delib.keep_helping'),
					),
				]),
			]);
		},
	};
}
