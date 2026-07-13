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
	estimateReception,
	askCharacterReview,
	getHelpedProposals,
	AgoraProposal,
	AgoraRating,
	HelpedProposal,
	ReceptionEstimate,
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
	ratingsMoved = 0,
	proposalN?: number,
): m.Children {
	const raters = totalRaters(score);
	const bridging = score?.bridgingScore ?? 0;

	return m('.card.scoreboard', [
		// Whose numbers are these? The chip answers before a word is read
		m('.owner-row', [
			m(
				'span.owner-chip',
				{ class: own ? 'owner-chip--mine' : 'owner-chip--peer' },
				own ? `📘 ${t('delib.owner_mine')}` : `📙 ${t('delib.owner_peer')}`,
			),
			!own && proposalN !== undefined
				? m('span.owner-row__number', t('delib.proposal_number', { n: proposalN }))
				: null,
		]),
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
			// The loop closing: votes moved after my latest improvement.
			// Aggregate ONLY — individual ratings stay anonymous.
			own && ratingsMoved > 0
				? m('p.scoreboard__updated', `📈 ${t('delib.ratings_moved', { n: ratingsMoved })}`)
				: null,
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
	let submitting = false;
	/** Reception forecast for the CURRENT draft text (stale once the text changes) */
	let estimate: ReceptionEstimate | null = null;
	let estimateText = '';
	let estimateBusy = false;
	let suggestionDraft = '';
	let helpSkips = 0;
	/** The always-editable box on the mine screen + the proposal text it was seeded from */
	let mineDraft = '';
	let mineDraftBase = '';
	/** Which character's verdict accordion is expanded */
	let openCharacterId = '';
	/** characterId → in-flight review request */
	const reviewBusy: Record<string, boolean> = {};
	/** proposalId → follow-up comment draft (the collaboration loop; per-proposal) */
	const followUpDrafts: Record<string, string> = {};
	const followUpBusy: Record<string, boolean> = {};
	/** Active tab of the workshop card on the "help" step */
	let helpTab: 'suggest' | 'needs' = 'suggest';
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
					m('span.delib-nav__icon', '📘'),
					m('span.delib-nav__label', t('delib.nav_mine')),
					// New feedback beckons while I'm away from my workshop
					!mineActive && openCount > 0 ? m('span.delib-nav__badge', String(openCount)) : null,
				],
			),
			m(
				'button.delib-nav__item.delib-nav__item--peer',
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
				[
					m('span.delib-nav__icon', '👥'),
					m('span.delib-nav__label', t('delib.nav_others')),
					// Proposals I helped moved while I was away — come see
					mineActive && helpedChangedCount() > 0
						? m('span.delib-nav__badge', String(helpedChangedCount()))
						: null,
				],
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

	/**
	 * Proposals are shown by NUMBER, not by author name — evaluate the idea,
	 * not the person. Stable across clients: state.proposals is sorted by
	 * createdAt everywhere.
	 */
	function proposalNumber(proposal: AgoraProposal): number {
		const index = getDeliberationState().proposals.findIndex(
			(candidate) => candidate.statementId === proposal.statementId,
		);

		return index + 1;
	}

	function asksLeftFor(live: AgoraSession, review: AgoraCharacterReview | undefined): number {
		const asksUsed = review?.asksByRound?.[String(live.roundNumber)] ?? 0;

		return Math.max(0, AGORA_AI_REVIEW.MAX_ASKS_PER_CHARACTER_PER_ROUND - asksUsed);
	}

	function askCharacter(
		live: AgoraSession,
		character: AgoraCharacter,
		myProposal: AgoraProposal,
	): void {
		if (reviewBusy[character.characterId]) return;
		reviewBusy[character.characterId] = true;
		askCharacterReview(live.sessionId, character.characterId, myProposal.statementId)
			.catch((error: unknown) => {
				console.error('[Delib] Character review failed:', error);
			})
			.finally(() => {
				reviewBusy[character.characterId] = false;
				m.redraw();
			});
	}

	function characterReviewCard(
		live: AgoraSession,
		character: AgoraCharacter,
		myProposal: AgoraProposal,
		review: AgoraCharacterReview | undefined,
	): m.Children {
		const asksLeft = asksLeftFor(live, review);
		const busy = reviewBusy[character.characterId] === true;
		// The verdict was given about an OLDER text — say so, don't let it
		// impersonate an opinion of the current proposal
		const stale = review !== undefined && myProposal.lastUpdate > review.lastUpdate;
		const ask = () => {
			askCharacter(live, character, myProposal);
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
	/**
	 * Reception forecast — numbers only, on demand. The AI never writes or
	 * advises here (a mirror, not a ghost-writer): it only predicts how each
	 * camp would receive the current draft, so the thinking stays with the
	 * student. Opinions live in the in-character reviews.
	 */
	function estimateSection(
		live: AgoraSession,
		rawText: string,
		topic: AgoraTopicPackage,
	): m.Children {
		const text = rawText.trim();
		const tooShort = text.length < AGORA_LIMITS.MIN_PROPOSAL_LENGTH;
		const stale = estimate !== null && estimateText !== text;

		const campRow = (label: string, colorVar: string, value: number) =>
			m('.estimate__row', [
				m('span.estimate__label', { style: { color: `var(${colorVar})` } }, label),
				m('.estimate__track', [
					m('.estimate__fill', {
						style: { width: `${value}%`, background: `var(${colorVar})` },
					}),
				]),
				m('span.estimate__value', String(value)),
			]);

		return m('.stack', [
			m(
				'button.btn.btn--secondary.estimate__button',
				{
					disabled: estimateBusy || tooShort,
					onclick: () => {
						estimateBusy = true;
						estimateReception(live.sessionId, text)
							.then((result) => {
								estimate = result;
								estimateText = text;
							})
							.catch((error: unknown) => {
								console.error('[Delib] Reception estimate failed:', error);
							})
							.finally(() => {
								estimateBusy = false;
								m.redraw();
							});
					},
				},
				estimateBusy ? t('delib.ai_thinking') : `🔮 ${t('delib.estimate_button')}`,
			),
			estimate
				? m('.estimate', { class: stale ? 'estimate--stale' : undefined }, [
						m('p.estimate__title', t('delib.estimate_title')),
						campRow(topic.positioningScale.leftLabel, '--camp-left-glow', estimate.left),
						campRow(topic.positioningScale.rightLabel, '--camp-right-glow', estimate.right),
						m('.estimate__avg', [
							m('span', t('delib.estimate_avg')),
							m('strong', `${estimate.average}/100`),
						]),
						m(
							'p.square-says__meaning',
							stale ? t('delib.estimate_stale') : t('delib.estimate_hint'),
						),
					])
				: null,
		]);
	}

	/**
	 * MY whole workshop as ONE card: the always-editable proposal text, the
	 * reception forecast, the improvements received, the ask-the-characters
	 * helpers and the needs reminder — everything under the same gold frame.
	 * No AI rewriting anywhere: the AI only reacts.
	 */
	function editableProposalCard(
		live: AgoraSession,
		myProposal: AgoraProposal,
		topic: AgoraTopicPackage,
	): m.Children {
		// Seed / re-seed the draft when the proposal changes underneath —
		// without clobbering what the student is currently typing
		if (mineDraftBase !== myProposal.statement) {
			if (mineDraft.trim() === '' || mineDraft === mineDraftBase) {
				mineDraft = myProposal.statement;
			}
			mineDraftBase = myProposal.statement;
		}
		const text = mineDraft.trim();
		const changed =
			text !== myProposal.statement && text.length >= AGORA_LIMITS.MIN_PROPOSAL_LENGTH;

		return m('.card.my-lantern.my-lantern--workshop', [
			m('.my-lantern__header', [
				m('span.my-lantern__icon', '📘'),
				m('span.my-lantern__title', t('delib.my_proposal')),
				m('span.my-lantern__hint', `✏️ ${t('delib.always_editable')}`),
			]),
			m('textarea.my-lantern__textarea', {
				value: mineDraft,
				rows: 4,
				maxlength: AGORA_LIMITS.MAX_PROPOSAL_LENGTH,
				placeholder: t('delib.placeholder'),
				oninput: (event: InputEvent) => {
					mineDraft = (event.target as HTMLTextAreaElement).value;
				},
			}),
			m('.delib__actions', [
				m(
					'button.btn.btn--primary.my-lantern__save',
					{
						disabled: !changed || submitting,
						onclick: () => {
							submitting = true;
							submitProposal(
								live,
								initialVnode.attrs.myParticipant.anonName,
								text,
								myProposal.statementId,
							)
								.then(() => {
									// Improving your own proposal earns glitter — the
									// behavior the game most wants to reinforce
									celebrate({ message: t('celebrate.proposal_improved'), detail: text });
								})
								.catch((error: unknown) => {
									console.error('[Delib] Update proposal failed:', error);
								})
								.finally(() => {
									submitting = false;
									m.redraw();
								});
						},
					},
					t('delib.update_proposal'),
				),
			]),
			// The mirror: how would the camps receive this version?
			estimateSection(live, mineDraft, topic),
			m('.my-lantern__divider'),
			suggestionsSection(live, myProposal),
			m('.my-lantern__divider'),
			askSection(live, myProposal, topic),
			m('.my-lantern__divider'),
			m(NeedsPeek, { topic }),
		]);
	}

	/** The latest comments & improvement suggestions, right under the editable text */
	function suggestionsSection(live: AgoraSession, myProposal: AgoraProposal): m.Children {
		const { suggestions } = getDeliberationState();
		// Newest first — the freshest feedback sits closest to the edit box
		const mySuggestions = [...(suggestions[myProposal.statementId] ?? [])].reverse();

		return m('.stack', [
			m('p.teacher__section-title', t('delib.suggestions_received')),
			mySuggestions.length === 0
				? m('p.square-says__meaning.text-center', t('delib.no_feedback_yet'))
				: null,
			// Nested array (own fragment) — keyed cards must not be spread
			// among unkeyed siblings (Mithril mixed-keys crash)
			mySuggestions.map((suggestion) =>
				m('.card.stack.workshop__item', { key: suggestion.statementId }, [
					suggestion.anonName
						? m(
								'p.workshop__from',
								`💡 ${t('delib.suggestion_from', { name: suggestion.anonName })}`,
							)
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
												// The edit box is right above — accepting means:
												// now weave the idea into your text
												void resolveSuggestion(
													live.sessionId,
													suggestion.statementId,
													AgoraSuggestionStatus.accepted,
												);
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

	/** The era's AI helpers: ask each character what's wrong and how to improve */
	function askSection(
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
					const stale = review !== undefined && myProposal.lastUpdate > review.lastUpdate;

					return m(
						'button.char-chips__chip',
						{
							class: open ? 'char-chips__chip--open' : undefined,
							'aria-expanded': String(open),
							onclick: () => {
								openCharacterId = open ? '' : character.characterId;
								// One tap does it: opening a character with no verdict
								// (or one about older text) asks them right away
								if (!open && (!review || stale) && asksLeftFor(live, review) > 0) {
									askCharacter(live, character, myProposal);
								}
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
		]);
	}

	// ---------- The collaboration loop: "proposals I helped" ----------

	/** sessionStorage map: helped proposalId → lastUpdate already SEEN in the section */
	const helpedSeenKey = `agora_${session.sessionId}_helped_seen`;

	function readHelpedSeen(): Record<string, number> {
		try {
			return JSON.parse(sessionStorage.getItem(helpedSeenKey) ?? '{}') as Record<string, number>;
		} catch {
			return {};
		}
	}

	/** Helped proposals that moved since I last looked — feeds the Others badge */
	function helpedChangedCount(): number {
		const seen = readHelpedSeen();

		return getHelpedProposals(userId).filter(({ proposal, mySuggestions }) => {
			// Never-seen baseline = my latest input there, so the badge only
			// lights for REAL changes after my suggestion, not for the
			// suggestion itself
			const baseline =
				seen[proposal.statementId] ??
				Math.max(...mySuggestions.map((suggestion) => suggestion.createdAt));

			return proposal.lastUpdate > baseline;
		}).length;
	}

	/** Rendering the section counts as seeing it (equality-guarded — no storage thrash) */
	function markHelpedSeen(entries: readonly HelpedProposal[]): void {
		const seen = readHelpedSeen();
		let changed = false;
		for (const { proposal } of entries) {
			if (seen[proposal.statementId] !== proposal.lastUpdate) {
				seen[proposal.statementId] = proposal.lastUpdate;
				changed = true;
			}
		}
		if (changed) sessionStorage.setItem(helpedSeenKey, JSON.stringify(seen));
	}

	/** Compact five-level scale for CHANGING my vote — never touches cycle state */
	function reRateScale(live: AgoraSession, proposal: AgoraProposal): m.Children {
		const current = getDeliberationState().myRatings[proposal.statementId]?.value;

		return m(
			'.rate-scale.rate-scale--compact',
			RATE_OPTIONS.map((option) =>
				m(
					`button.rate-scale__option.rate-scale__option--${option.variant}`,
					{
						class: current === option.value ? 'rate-scale__option--selected' : undefined,
						'aria-pressed': String(current === option.value),
						onclick: () => {
							void rateProposal(live, proposal.statementId, option.value);
						},
					},
					[
						m('span.rate-scale__emoji', option.emoji),
						m('span.rate-scale__label', t(option.labelKey)),
					],
				),
			),
		);
	}

	/** One helped proposal: my suggestions + status, the current text, re-rate, follow-up */
	function helpedItem(live: AgoraSession, entry: HelpedProposal): m.Children {
		const { proposal, mySuggestions } = entry;
		// createdAt, NOT lastUpdate: resolving a suggestion bumps its lastUpdate,
		// which would wrongly hide the marker when the owner edited first
		const latestInput = Math.max(...mySuggestions.map((suggestion) => suggestion.createdAt));
		const improvedSince = proposal.lastUpdate > latestInput;
		const draft = followUpDrafts[proposal.statementId] ?? '';
		const statusKey = (suggestion: AgoraProposal): string =>
			suggestion.suggestionStatus === AgoraSuggestionStatus.accepted
				? 'delib.accepted'
				: suggestion.suggestionStatus === AgoraSuggestionStatus.thanked
					? 'delib.thanked'
					: suggestion.suggestionStatus === AgoraSuggestionStatus.declined
						? 'delib.declined'
						: 'delib.helped_status_open';

		return m('.card.stack.helped__item', { key: proposal.statementId }, [
			// The proposal itself comes first — that's what I'm evaluating
			m('.owner-row', [
				m('span.owner-chip.owner-chip--peer', `📙 ${t('delib.owner_peer')}`),
				m('span.owner-row__number', t('delib.proposal_number', { n: proposalNumber(proposal) })),
			]),
			m('p.helped__current', proposal.statement),
			improvedSince ? m('p.helped__improved', `✨ ${t('delib.helped_improved_marker')}`) : null,
			m('p.square-says__meaning', t('delib.helped_rerate_prompt')),
			reRateScale(live, proposal),
			// My improvement ideas + live status chips — the acknowledgment —
			// sit beneath the evaluation, with the follow-up box continuing them.
			// Nested array (own fragment): keyed children must not be spread
			// among unkeyed siblings (Mithril mixed-keys crash)
			m('p.teacher__section-title', t('delib.helped_your_ideas')),
			mySuggestions.map((suggestion) =>
				m('.helped__suggestion', { key: suggestion.statementId }, [
					m('p.helped__suggestion-text', suggestion.statement),
					m(
						'span.helped__chip',
						{ class: `helped__chip--${suggestion.suggestionStatus ?? 'open'}` },
						t(statusKey(suggestion)),
					),
				]),
			),
			m('textarea.text-input.helped__followup', {
				value: draft,
				rows: 2,
				placeholder: t('delib.helped_followup_placeholder'),
				oninput: (event: InputEvent) => {
					followUpDrafts[proposal.statementId] = (event.target as HTMLTextAreaElement).value;
				},
			}),
			m(
				'button.btn.btn--secondary',
				{
					disabled:
						followUpBusy[proposal.statementId] === true ||
						draft.trim().length < AGORA_LIMITS.MIN_ANSWER_LENGTH,
					onclick: () => {
						const text = draft.trim();
						followUpBusy[proposal.statementId] = true;
						followUpDrafts[proposal.statementId] = '';
						// A free follow-up: continues the conversation, no lap advance
						submitSuggestion(live, proposal, initialVnode.attrs.myParticipant.anonName, text)
							.catch((error: unknown) => {
								console.error('[Delib] Follow-up failed:', error);
							})
							.finally(() => {
								followUpBusy[proposal.statementId] = false;
								m.redraw();
							});
					},
				},
				t('delib.send_suggestion'),
			),
		]);
	}

	/** "Proposals I helped" — hidden until I've actually helped something */
	function helpedSection(live: AgoraSession): m.Children {
		const entries = getHelpedProposals(userId);
		if (entries.length === 0) return null;
		markHelpedSeen(entries);

		return m('.stack', [
			m('p.teacher__section-title', t('delib.helped_title')),
			entries.map((entry) => helpedItem(live, entry)),
		]);
	}

	return {
		onremove() {
			stopDeliberationListeners();
		},

		view(vnode) {
			const { session: live, myParticipant, topic } = vnode.attrs;
			const { proposals, suggestions, myRatings, studentEvalTimes, scores } =
				getDeliberationState();
			const myProposal = proposals.find((proposal) => proposal.creatorId === userId);
			const anonName = myParticipant.anonName;
			// Aggregate loop-closing signal for the owner: how many classmates
			// (re)rated AFTER my latest improvement (AI raters already excluded)
			const ratingsMoved = myProposal
				? (studentEvalTimes[myProposal.statementId] ?? []).filter(
						(entry) => entry.evaluatorId !== userId && entry.updatedAt > myProposal.lastUpdate,
					).length
				: 0;

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
					// The reception mirror works from the first draft on
					estimateSection(live, draft, topic),
					m('.delib__actions', [
						m(
							'button.btn.btn--primary',
							{
								disabled: submitting || draft.trim().length < AGORA_LIMITS.MIN_PROPOSAL_LENGTH,
								onclick: () => {
									submitting = true;
									const text = draft.trim();
									submitProposal(live, anonName, text)
										.then(() => {
											// The first write moves the lap forward
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
							t('delib.submit_proposal'),
						),
					]),
				];

				// Lap 1: nothing exists yet — plain write screen
				if (writeMode) {
					return m('.shell.shell--mode-mine', [
						m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
							header,
							m('h2.text-center', t('delib.phase_propose')),
							m('p.home-explanation', t('delib.propose_hint')),
							...editPanel,
						]),
					]);
				}

				// Lap 2+ (or a peek from rate/help): scoreboard → ONE workshop card
				// (editable box, forecast, suggestions, characters, needs)
				return m('.shell.shell--delib.shell--mode-mine', [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						header,
						delibNav(myProposal),
						scoreboard(topic, scores[myProposal.statementId], true, ratingsMoved),
						editableProposalCard(live, myProposal, topic),
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
					]),
				]);
			}

			// ---------- STEP: RATE OTHERS (peer mode — silver accent) ----------
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

				return m('.shell.shell--delib.shell--mode-peer', [
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
							? m('.card.stack.delib__rate-card', [
									// Whose proposal am I rating? A classmate's — say so
									m('.owner-row', [
										m('span.owner-chip.owner-chip--peer', `📙 ${t('delib.owner_peer')}`),
										m(
											'span.owner-row__number',
											t('delib.proposal_number', { n: proposalNumber(current) }),
										),
									]),
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
						// The collaboration loop stays in reach on the whole Others
						// side — one tap on the Others tab and it's visible
						helpedSection(live),
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
				return m('.shell.shell--delib.shell--mode-peer', [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						header,
						delibNav(myProposal),
						m('h2.text-center', t('delib.help_others')),
						helpTarget
							? [
									scoreboard(
										topic,
										scores[helpTarget.statementId],
										false,
										0,
										proposalNumber(helpTarget),
									),
									// ONE box: their proposal on top, my suggestion workshop
									// beneath it — same unified frame as the mine screen
									m('.card.my-lantern.my-lantern--theirs.my-lantern--workshop', [
										m('.my-lantern__header', [
											m('span.my-lantern__icon', '📙'),
											m(
												'span.my-lantern__title',
												t('delib.proposal_number', { n: proposalNumber(helpTarget) }),
											),
											m('span.owner-chip.owner-chip--peer', t('delib.owner_peer')),
											m(
												'button.btn.btn--ghost.my-lantern__edit',
												{
													onclick: () => {
														helpSkips++;
														suggestionDraft = '';
													},
												},
												`↻ ${t('delib.next_proposal')}`,
											),
										]),
										m('p.my-lantern__text', helpTarget.statement),
										m('.my-lantern__divider'),
										workshopTabs(
											[
												{ id: 'suggest', label: t('delib.tab_suggest') },
												{ id: 'needs', label: t('delib.tab_needs') },
											],
											helpTab,
											(id) => {
												helpTab = id as typeof helpTab;
											},
										),
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
																	void submitSuggestion(live, helpTarget, anonName, text);
																	advanceRound();
																},
															},
															t('delib.send_suggestion'),
														),
													]),
												])
											: m(NeedsBoard, { topic }),
									]),
									helpedSection(live),
								]
							: [
									m('p.text-center.lobby__status', t('delib.no_more')),
									helpedSection(live),
									m('button.btn.btn--ghost.btn--full', { onclick: advanceRound }, skipLabel),
								],
					]),
				]);
			}

			// ---------- DONE: all cycles complete ----------
			return m('.shell.shell--wide.shell--delib.shell--mode-mine', [
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
								scoreboard(topic, scores[myProposal.statementId], true, ratingsMoved),
								editableProposalCard(live, myProposal, topic),
							]
						: null,
					helpedSection(live),
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
