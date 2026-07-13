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
import { NeedsBoard, NeedsPeek } from '../components/NeedsBoard';
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

/** One camp column of the scoreboard: dot + name over a support bar + "N rated" */
function campColumn(
	label: string,
	colorVar: string,
	aggregate: { sum: number; n: number } | undefined,
): m.Children {
	const n = aggregate?.n ?? 0;
	const support = n > 0 ? Math.max(0, Math.min(1, (aggregate?.sum ?? 0) / n)) : 0;

	return m('.scoreboard__camp', [
		m('.scoreboard__camp-name', [
			m('span.camp-bar__dot', { style: { background: `var(${colorVar})` } }),
			m('span', { style: { color: `var(${colorVar})` } }, label),
		]),
		m('.scoreboard__camp-track', [
			m('.scoreboard__camp-fill', {
				style: { width: `${support * 100}%`, background: `var(${colorVar})` },
			}),
		]),
		m('span.scoreboard__camp-count', t('delib.raters_count', { n })),
	]);
}

/** The scoreboard panel: both camps side by side + the bridge-power meter */
function scoreboard(
	topic: AgoraTopicPackage,
	score: AgoraProposalScore | undefined,
	own = true,
): m.Children {
	const raters = totalRaters(score);
	const bridging = score?.bridgingScore ?? 0;

	return m('.card.scoreboard', [
		m('.scoreboard__camps', [
			campColumn(topic.positioningScale.leftLabel, '--camp-left-glow', score?.perCamp.left),
			m('.scoreboard__divider'),
			campColumn(topic.positioningScale.rightLabel, '--camp-right-glow', score?.perCamp.right),
		]),
		m('.scoreboard__bridge', [
			m('.scoreboard__bridge-head', [
				m('span.scoreboard__bridge-label', t('delib.bridge_power')),
				m('span.scoreboard__bridge-value', [
					String(bridging),
					m('span.scoreboard__bridge-max', '/100'),
				]),
			]),
			m('.scoreboard__meter', [
				m(
					'.scoreboard__meter-fill',
					{ style: { width: `${bridging}%` } },
					m('span.scoreboard__meter-spark'),
				),
			]),
			m(
				'p.scoreboard__caption',
				// "no one rated YOUR proposal yet" only fits the owner's screen
				raters === 0 && own ? t('delib.no_raters_yet') : t('delib.bridge_meaning'),
			),
		]),
	]);
}

/** Tab header of the workshop card */
function workshopTabs(
	tabs: ReadonlyArray<{ id: string; label: string; badge?: number }>,
	active: string,
	onSelect: (id: string) => void,
): m.Children {
	return m(
		'.workshop__tabs',
		tabs.map((tab) =>
			m(
				'button.workshop__tab',
				{
					class: tab.id === active ? 'workshop__tab--active' : undefined,
					'aria-selected': String(tab.id === active),
					onclick: () => onSelect(tab.id),
				},
				[
					tab.label,
					tab.badge !== undefined && tab.badge > 0
						? m('span.workshop__badge', String(tab.badge))
						: null,
				],
			),
		),
	);
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
	/** Active tab of the workshop card on the "mine" step */
	let workTab: 'feedback' | 'ai' | 'needs' = 'feedback';
	/** Active tab of the workshop card on the "help" step */
	let helpTab: 'suggest' | 'ai' | 'needs' = 'suggest';
	let helpCoachNote = '';
	let helpAiBusy = false;
	/**
	 * Mine/Others navigation (bottom tabs on mobile, top tabs on desktop).
	 * "Mine" during rate/help is a PEEK at my workshop — the lap's guided
	 * progression (mine → rate → help) is untouched.
	 */
	let peekMine = false;

	const cycleKey = `agora_${session.sessionId}_cycle`;
	let cycle: CycleState = { round: 1, step: 'mine', rated: 0 };
	try {
		const stored = sessionStorage.getItem(cycleKey);
		if (stored) cycle = { ...cycle, ...(JSON.parse(stored) as Partial<CycleState>) };
	} catch {
		// Corrupt storage — start the cycle over
	}

	function setCycle(patch: Partial<CycleState>): void {
		if (patch.step !== undefined && patch.step !== cycle.step) {
			// Each step opens its workshop on the default tab
			workTab = 'feedback';
			helpTab = 'suggest';
			peekMine = false;
		}
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

	/**
	 * The Mine | Others tabs. Mobile: fixed bottom bar; desktop: tab row
	 * under the HUD (CSS switches placement on one element). Hidden until
	 * the student has a proposal — lap 1 starts with writing.
	 */
	function delibNav(myProposal: AgoraProposal | undefined): m.Children {
		if (!myProposal) return null;
		const { suggestions } = getDeliberationState();
		const openCount = (suggestions[myProposal.statementId] ?? []).filter(
			(entry) => entry.suggestionStatus === AgoraSuggestionStatus.open,
		).length;
		const mineActive = cycle.step === 'mine' || cycle.step === 'done' || peekMine;

		return m('nav.delib-nav', [
			m(
				'button.delib-nav__item',
				{
					class: mineActive ? 'delib-nav__item--active' : undefined,
					'aria-selected': String(mineActive),
					onclick: () => {
						peekMine = cycle.step === 'rate' || cycle.step === 'help';
						m.redraw();
					},
				},
				[
					m('span.delib-nav__icon', '🏮'),
					m('span.delib-nav__label', t('delib.nav_mine')),
					// New feedback beckons while I'm away from my workshop
					!mineActive && openCount > 0 ? m('span.delib-nav__badge', String(openCount)) : null,
				],
			),
			m(
				'button.delib-nav__item',
				{
					class: mineActive ? undefined : 'delib-nav__item--active',
					'aria-selected': String(!mineActive),
					onclick: () => {
						peekMine = false;
						if (cycle.step === 'mine') {
							setCycle({ step: 'rate', rated: 0 });
						} else if (cycle.step === 'done') {
							// After the laps, "Others" means: keep helping
							setCycle({ round: AGORA_CYCLE.ROUNDS, step: 'help' });
						} else {
							m.redraw();
						}
					},
				},
				[m('span.delib-nav__icon', '👥'), m('span.delib-nav__label', t('delib.nav_others'))],
			),
		]);
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
		myProposal: AgoraProposal,
		review: AgoraCharacterReview | undefined,
	): m.Children {
		const asksUsed = review?.asksByRound?.[String(live.roundNumber)] ?? 0;
		const asksLeft = Math.max(0, AGORA_AI_REVIEW.MAX_ASKS_PER_CHARACTER_PER_ROUND - asksUsed);
		const busy = reviewBusy[character.characterId] === true;
		// The verdict was given about an OLDER text — say so, don't let it
		// impersonate an opinion of the current proposal
		const stale = review !== undefined && myProposal.lastUpdate > review.lastUpdate;
		const ask = () => {
			reviewBusy[character.characterId] = true;
			askCharacterReview(live.sessionId, character.characterId, myProposal.statementId)
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
							stale ? m('p.char-review__stale', t('delib.stale_review')) : null,
							m(
								'p.char-review__bubble',
								{ class: stale ? 'char-review__bubble--stale' : undefined },
								review.verdictText,
							),
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
								// A stale verdict makes re-asking THE next action
								stale ? 'button.btn.btn--primary' : 'button.btn.btn--secondary',
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

	/** The proposal on the table. Mine glows gold; a classmate's sits in a neutral frame. */
	function heroCard(
		proposal: AgoraProposal,
		options: { mine: boolean; editable?: boolean; onNext?: () => void },
	): m.Children {
		return m('.card.my-lantern', { class: options.mine ? undefined : 'my-lantern--theirs' }, [
			m('.my-lantern__header', [
				m('span.my-lantern__icon', options.mine ? '🏮' : '📜'),
				m(
					'span.my-lantern__title',
					options.mine
						? t('delib.my_proposal')
						: t('delib.proposal_by', { name: proposal.anonName || '?' }),
				),
				options.mine && options.editable === true && !isEditing
					? m(
							'button.btn.btn--ghost.my-lantern__edit',
							{
								onclick: () => {
									draft = proposal.statement;
									isEditing = true;
								},
							},
							`✏️ ${t('delib.update_proposal')}`,
						)
					: null,
				options.onNext
					? m(
							'button.btn.btn--ghost.my-lantern__edit',
							{ onclick: options.onNext },
							`↻ ${t('delib.next_proposal')}`,
						)
					: null,
			]),
			m('p.my-lantern__text', proposal.statement),
		]);
	}

	/** Feedback tab: character chips + ONE attributed inbox (verdicts + peer suggestions) */
	function feedbackStream(
		live: AgoraSession,
		myProposal: AgoraProposal,
		topic: AgoraTopicPackage,
	): m.Children {
		const { suggestions, characterReviews } = getDeliberationState();
		const mySuggestions = suggestions[myProposal.statementId] ?? [];
		const openCharacter = topic.characters.find(
			(character) => character.characterId === openCharacterId,
		);

		return m('.stack', [
			m(
				'.char-chips',
				topic.characters.map((character) => {
					const review =
						characterReviews[
							createAgoraCharacterReviewId(myProposal.statementId, character.characterId)
						];
					const open = openCharacterId === character.characterId;
					const stale = review !== undefined && myProposal.lastUpdate > review.lastUpdate;

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
								? stale
									? m('span.char-chips__cta', t('delib.stale_chip'))
									: m('span.char-chips__score', `${review.acceptanceScore}/100`)
								: m('span.char-chips__cta', t('delib.ask_me')),
						],
					);
				}),
			),
			openCharacter
				? characterReviewCard(
						live,
						openCharacter,
						myProposal,
						getDeliberationState().characterReviews[
							createAgoraCharacterReviewId(myProposal.statementId, openCharacter.characterId)
						],
					)
				: null,
			mySuggestions.length === 0 && !openCharacter
				? m('p.square-says__meaning.text-center', t('delib.no_feedback_yet'))
				: null,
			// Nested array (own fragment) — keyed cards must not be spread
			// among unkeyed siblings (Mithril mixed-keys crash)
			mySuggestions.map((suggestion) =>
				m('.card.stack.workshop__item', { key: suggestion.statementId }, [
					suggestion.anonName
						? m('p.char-review__role', t('delib.suggestion_from', { name: suggestion.anonName }))
						: null,
					m('p', suggestion.statement),
					suggestion.suggestionStatus === AgoraSuggestionStatus.open
						? [
								m('.delib__actions', [
									m(
										'button.btn.btn--ghost',
										{
											onclick: () => {
												void resolveSuggestion(
													live.sessionId,
													suggestion.statementId,
													AgoraSuggestionStatus.declined,
												);
											},
										},
										t('delib.no_thanks'),
									),
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
										t('delib.will_implement'),
									),
								]),
								m('p.square-says__meaning', t('delib.accept_hint')),
							]
						: m(
								'span.values__score',
								suggestion.suggestionStatus === AgoraSuggestionStatus.accepted
									? t('delib.accepted')
									: suggestion.suggestionStatus === AgoraSuggestionStatus.declined
										? t('delib.declined')
										: t('delib.thanked'),
							),
				]),
			),
		]);
	}

	/** AI-help tab for MY proposal: improve wording → opens the editor with the coach's draft */
	function mineAiTab(live: AgoraSession, myProposal: AgoraProposal): m.Children {
		return m('.stack', [
			m(
				'button.btn.btn--secondary',
				{
					disabled: aiBusy,
					onclick: () => {
						aiBusy = true;
						improveWithAI(live.sessionId, myProposal.statement)
							.then((result) => {
								draft = result.improvedText;
								coachNote = result.coachNote;
								isEditing = true;
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
			coachNote
				? m('.card.delib__coach', [m('strong', t('delib.coach_note')), m('p', coachNote)])
				: null,
		]);
	}

	/** AI-help tab while helping someone: phrase my suggestion better */
	function helpAiTab(live: AgoraSession): m.Children {
		return m('.stack', [
			m(
				'button.btn.btn--secondary',
				{
					disabled: helpAiBusy || suggestionDraft.trim().length < AGORA_LIMITS.MIN_ANSWER_LENGTH,
					onclick: () => {
						helpAiBusy = true;
						improveWithAI(live.sessionId, suggestionDraft.trim())
							.then((result) => {
								suggestionDraft = result.improvedText;
								helpCoachNote = result.coachNote;
								helpTab = 'suggest';
							})
							.catch((error: unknown) => {
								console.error('[Delib] AI phrase failed:', error);
							})
							.finally(() => {
								helpAiBusy = false;
								m.redraw();
							});
					},
				},
				helpAiBusy ? t('delib.ai_thinking') : t('delib.phrase_suggestion'),
			),
			suggestionDraft.trim().length < AGORA_LIMITS.MIN_ANSWER_LENGTH
				? m('p.square-says__meaning', t('delib.help_dont_attack'))
				: null,
			helpCoachNote
				? m('.card.delib__coach', [m('strong', t('delib.coach_note')), m('p', helpCoachNote)])
				: null,
		]);
	}

	/** The workshop card on the "mine" step: Feedback | AI help | Needs */
	function mineWorkshop(
		live: AgoraSession,
		myProposal: AgoraProposal,
		topic: AgoraTopicPackage,
	): m.Children {
		const { suggestions } = getDeliberationState();
		const openCount = (suggestions[myProposal.statementId] ?? []).filter(
			(entry) => entry.suggestionStatus === AgoraSuggestionStatus.open,
		).length;

		return m('.card.workshop', [
			workshopTabs(
				[
					{ id: 'feedback', label: t('delib.tab_feedback'), badge: openCount },
					{ id: 'ai', label: t('delib.tab_ai') },
					{ id: 'needs', label: t('delib.tab_needs') },
				],
				workTab,
				(id) => {
					workTab = id as typeof workTab;
				},
			),
			m(
				'.workshop__body',
				workTab === 'feedback'
					? feedbackStream(live, myProposal, topic)
					: workTab === 'ai'
						? mineAiTab(live, myProposal)
						: m(NeedsBoard, { topic }),
			),
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
			// Also rendered as a PEEK from rate/help via the Mine tab — the
			// step itself doesn't move.
			const minePeek =
				peekMine && myProposal !== undefined && (cycle.step === 'rate' || cycle.step === 'help');
			if (cycle.step === 'mine' || minePeek) {
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
											// First write moves the lap forward; an improvement
											// STAYS here so the advisors can see the new text
											if (!isImprovement) {
												setCycle({ step: 'rate', rated: 0 });
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

				// Lap 2+ (or a peek from rate/help): the workshop skeleton —
				// scoreboard → my proposal on the table → tabbed work area
				// (editing replaces the work area)
				return m('.shell.shell--delib', [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						header,
						delibNav(myProposal),
						scoreboard(topic, scores[myProposal.statementId]),
						heroCard(myProposal, { mine: true, editable: true }),
						isEditing
							? m('.card.workshop', m('.workshop__body.stack', editPanel))
							: [
									mineWorkshop(live, myProposal, topic),
									// The guided path continues only from the real step —
									// a peek returns via the Others tab instead
									cycle.step === 'mine'
										? m(
												'button.btn.btn--primary.btn--full.btn--lg',
												{
													onclick: () => {
														setCycle({ step: 'rate', rated: 0 });
													},
												},
												t('delib.to_rating'),
											)
										: null,
								],
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

				return m('.shell.shell--delib', [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						header,
						delibNav(myProposal),
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
				const skipLabel =
					cycle.round >= AGORA_CYCLE.ROUNDS ? t('delib.finish_cycles') : t('delib.skip_help');

				// Same workshop skeleton as "mine" — but the proposal on the table
				// is a classmate's, and the tabs help ME help THEM
				return m('.shell.shell--delib', [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						header,
						delibNav(myProposal),
						m('h2.text-center', t('delib.help_others')),
						helpTarget
							? [
									scoreboard(topic, scores[helpTarget.statementId], false),
									heroCard(helpTarget, {
										mine: false,
										onNext: () => {
											helpSkips++;
											suggestionDraft = '';
											helpCoachNote = '';
										},
									}),
									m('.card.workshop', [
										workshopTabs(
											[
												{ id: 'suggest', label: t('delib.tab_suggest') },
												{ id: 'ai', label: t('delib.tab_ai') },
												{ id: 'needs', label: t('delib.tab_needs') },
											],
											helpTab,
											(id) => {
												helpTab = id as typeof helpTab;
											},
										),
										m(
											'.workshop__body',
											helpTab === 'suggest'
												? m('.stack', [
														m('p.workshop__question', t('delib.help_question')),
														m('p.square-says__meaning', t('delib.help_dont_attack')),
														m('textarea.text-input', {
															value: suggestionDraft,
															rows: 4,
															placeholder: t('delib.suggest_placeholder'),
															oninput: (event: InputEvent) => {
																suggestionDraft = (event.target as HTMLTextAreaElement).value;
															},
														}),
														helpCoachNote
															? m('.card.delib__coach', [
																	m('strong', t('delib.coach_note')),
																	m('p', helpCoachNote),
																])
															: null,
														m('.delib__actions', [
															m('button.btn.btn--ghost', { onclick: advanceRound }, skipLabel),
															m(
																'button.btn.btn--primary',
																{
																	disabled:
																		suggestionDraft.trim().length < AGORA_LIMITS.MIN_ANSWER_LENGTH,
																	onclick: () => {
																		const text = suggestionDraft.trim();
																		suggestionDraft = '';
																		helpCoachNote = '';
																		void submitSuggestion(live, helpTarget, anonName, text);
																		advanceRound();
																	},
																},
																t('delib.send_suggestion'),
															),
														]),
													])
												: helpTab === 'ai'
													? helpAiTab(live)
													: m(NeedsBoard, { topic }),
										),
									]),
								]
							: [
									m('p.text-center.lobby__status', t('delib.no_more')),
									m('button.btn.btn--ghost.btn--full', { onclick: advanceRound }, skipLabel),
								],
					]),
				]);
			}

			// ---------- DONE: all cycles complete ----------
			return m('.shell.shell--wide.shell--delib', [
				m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
					header,
					delibNav(myProposal),
					m(EraMap, {
						participants: [],
						lanterns: lanternsFromState(proposals, scores, userId),
					}),
					m('h3.text-center', t('delib.cycle_done_title')),
					m('p.home-explanation', t('delib.cycle_done_hint')),
					myProposal
						? [
								scoreboard(topic, scores[myProposal.statementId]),
								heroCard(myProposal, { mine: true }),
								mineWorkshop(live, myProposal, topic),
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
