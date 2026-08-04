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
	askCharacterReview,
	getHelpedProposals,
	AgoraProposal,
	HelpedProposal,
} from '../lib/proposals';
import {
	initChatFlow,
	isBootstrapped,
	bootstrap,
	dispatch,
	getChatFlow,
	stopChatFlow,
	selectCandidates,
	computeMenuOptions,
	computeNudge,
	RATE_OPTIONS,
	MenuInput,
	TranscriptEntry,
	CardRef,
} from '../lib/chatFlow';
import { ChatBubble, TypingIndicator } from '../components/ChatBubble';
import { ScoreHud, ScoreHudStep } from '../components/ScoreHud';
import { NeedsPeek } from '../components/NeedsBoard';
import { celebrate } from '../lib/celebration';
import {
	AgoraCharacter,
	AgoraCharacterReview,
	AgoraParticipant,
	AgoraSession,
	AgoraStage,
	AgoraSuggestionStatus,
	AgoraTopicPackage,
	AGORA_AI_REVIEW,
	AGORA_CYCLE,
	AGORA_LIMITS,
	createAgoraCharacterReviewId,
} from '@freedi/shared-types';
import { reportStageProgress } from '../lib/session';

export interface DeliberationChatAttrs {
	session: AgoraSession;
	myParticipant: AgoraParticipant;
	userId: string;
	topic: AgoraTopicPackage;
}

/** How long the guide "types" before a line appears */
const TYPING_MS = 550;

/**
 * The deliberation square as a CONVERSATION: a scripted guide walks the
 * student through proposing, rating classmates' proposals (one at a time,
 * explicitly framed as "a classmate's"), suggesting improvements, and a
 * free-choice activity menu. The chat framing exists to make ownership
 * unmistakable — the guide SAYS whose text every card shows, and the
 * student's own words always sit in blue bubbles on their side.
 */
export function DeliberationChat(
	initialVnode: m.Vnode<DeliberationChatAttrs>,
): m.Component<DeliberationChatAttrs> {
	const { session, userId } = initialVnode.attrs;

	// ---- composer drafts & in-flight guards (view-only, never persisted)
	let proposalDraft = '';
	let improveDraft = '';
	let busy = false;
	/** The always-editable box on the my-proposal card + its seed text */
	let mineDraft = '';
	let mineDraftBase = '';
	let openCharacterId = '';
	const reviewBusy: Record<string, boolean> = {};
	const followUpDrafts: Record<string, string> = {};
	const followUpBusy: Record<string, boolean> = {};

	// ---- staged reveal (typing effect): a WALL-CLOCK schedule for guide
	// lines only. Interactive cards and the student's own entries are NEVER
	// gated — in occluded tabs (and headless E2E) rAF/timer chains stall,
	// and the menu must not be held hostage by theater. Any redraw catches
	// up by wall clock, so a stalled timer only delays cosmetics.
	const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	const revealAt = new Map<number, number>();
	let revealCursor = 0;
	let revealSeeded = false;
	let revealTimer: number | undefined;

	// ---- auto-scroll: follow the conversation unless the student scrolled up
	let stickToBottom = true;
	let renderCounter = 0;
	let lastScrolledCounter = 0;

	function onWindowScroll(): void {
		stickToBottom =
			window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 120;
	}
	window.addEventListener('scroll', onWindowScroll, { passive: true });

	listenToDeliberation(session.sessionId, userId);
	initChatFlow(session.sessionId, userId, {
		candidateIds: () => {
			const { proposals, myRatings, scores } = getDeliberationState();

			return selectCandidates(proposals, myRatings, scores, userId).map(
				(proposal) => proposal.statementId,
			);
		},
		reportProgress: (ratedCount) => {
			reportStageProgress(
				session.sessionId,
				userId,
				AgoraStage.deliberation,
				Math.min(ratedCount, AGORA_CYCLE.RATINGS_PER_ROUND),
				AGORA_CYCLE.RATINGS_PER_ROUND,
			);
		},
	});

	function proposalNumber(proposal: AgoraProposal): number {
		const index = getDeliberationState().proposals.findIndex(
			(candidate) => candidate.statementId === proposal.statementId,
		);

		return index + 1;
	}

	function myProposal(): AgoraProposal | undefined {
		return getDeliberationState().proposals.find((proposal) => proposal.creatorId === userId);
	}

	// ---------------------------------------------------------------------
	// The collaboration loop bookkeeping (lifted intact from the places UI)
	// ---------------------------------------------------------------------

	const helpedSeenKey = `agora_${session.sessionId}_helped_seen`;

	function readHelpedSeen(): Record<string, number> {
		try {
			return JSON.parse(sessionStorage.getItem(helpedSeenKey) ?? '{}') as Record<string, number>;
		} catch {
			return {};
		}
	}

	/** Helped proposals that moved since I last looked — feeds the menu badge */
	function helpedChangedCount(): number {
		const seen = readHelpedSeen();

		return getHelpedProposals(userId).filter(({ proposal, mySuggestions }) => {
			const baseline =
				seen[proposal.statementId] ??
				Math.max(...mySuggestions.map((suggestion) => suggestion.createdAt));

			return proposal.lastUpdate > baseline;
		}).length;
	}

	/** Rendering the helped card counts as seeing it (equality-guarded) */
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

	// ---------------------------------------------------------------------
	// Menu input from live state
	// ---------------------------------------------------------------------

	function buildMenuInput(): MenuInput {
		const { proposals, suggestions, myRatings, studentEvalTimes, scores, characterReviews } =
			getDeliberationState();
		const mine = myProposal();
		const openOnMine = mine
			? (suggestions[mine.statementId] ?? []).filter(
					(entry) => entry.suggestionStatus === AgoraSuggestionStatus.open,
				).length
			: 0;
		const ratingsMoved = mine
			? (studentEvalTimes[mine.statementId] ?? []).filter(
					(entry) => entry.evaluatorId !== userId && entry.updatedAt > mine.lastUpdate,
				).length
			: 0;
		const topic = initialVnode.attrs.topic;
		let hasReview = false;
		let hasStale = false;
		if (mine) {
			for (const character of topic.characters) {
				const review =
					characterReviews[createAgoraCharacterReviewId(mine.statementId, character.characterId)];
				if (review) {
					hasReview = true;
					if (mine.lastUpdate > review.lastUpdate) hasStale = true;
				}
			}
		}
		const helped = getHelpedProposals(userId);

		return {
			candidatesLeft: selectCandidates(proposals, myRatings, scores, userId).length,
			openSuggestionsOnMine: openOnMine,
			ratingsMoved,
			helpedCount: helped.length,
			helpedChanged: helpedChangedCount(),
			hasCharacterReview: hasReview,
			hasStaleReview: hasStale,
			ratedCount: getChatFlow().state.ratedCount,
			visited: getChatFlow().state.visited,
		};
	}

	// ---------------------------------------------------------------------
	// Embedded cards
	// ---------------------------------------------------------------------

	/** Foot row of every branch card: hand the wheel back to the guide */
	function backToMenu(): m.Children {
		return m(
			'.chat-back',
			m(
				'button.btn.btn--ghost',
				{ onclick: () => dispatch({ type: 'BACK_TO_MENU' }) },
				t('chat.back_to_menu'),
			),
		);
	}

	function proposalComposer(
		card: Extract<CardRef, { type: 'composer' }>,
		active: boolean,
	): m.Children {
		if (card.done) {
			return m('.card.chat-composer', m('p.chat-composer__sent', `✓ ${t('chat.sent')}`));
		}
		const live = initialVnode.attrs.session;
		const anonName = initialVnode.attrs.myParticipant.anonName;

		return m('.card.chat-composer', [
			m('textarea.text-input', {
				value: proposalDraft,
				rows: 5,
				maxlength: AGORA_LIMITS.MAX_PROPOSAL_LENGTH,
				placeholder: t('delib.placeholder'),
				disabled: !active,
				oninput: (event: InputEvent) => {
					proposalDraft = (event.target as HTMLTextAreaElement).value;
				},
			}),
			m(NeedsPeek, { topic: initialVnode.attrs.topic }),
			m('.chat-composer__actions', [
				m(
					'button.btn.btn--primary',
					{
						disabled:
							!active || busy || proposalDraft.trim().length < AGORA_LIMITS.MIN_PROPOSAL_LENGTH,
						onclick: () => {
							const text = proposalDraft.trim();
							busy = true;
							submitProposal(live, anonName, text)
								.then(() => {
									proposalDraft = '';
									dispatch({ type: 'PROPOSAL_SUBMITTED', text });
								})
								.catch((error: unknown) => {
									console.error('[DelibChat] Submit proposal failed:', error);
								})
								.finally(() => {
									busy = false;
									m.redraw();
								});
						},
					},
					t('delib.submit_proposal'),
				),
			]),
		]);
	}

	function improvementComposer(
		card: Extract<CardRef, { type: 'composer' }>,
		active: boolean,
	): m.Children {
		if (card.done) {
			return m('.card.chat-composer', m('p.chat-composer__sent', `✓ ${t('chat.sent')}`));
		}
		const live = initialVnode.attrs.session;
		const anonName = initialVnode.attrs.myParticipant.anonName;
		const target = getDeliberationState().proposals.find(
			(proposal) => proposal.statementId === card.proposalId,
		);

		// Two physical objects, not one form: the classmate's proposal is a
		// mounted POSTER (parchment + pin + orange awning — clearly not an
		// input), the student's reply is a smaller sticky NOTE beneath it.
		// Ownership is legible before a word is read: 📙 orange = theirs,
		// 📘 blue = mine. The card carries its own context once the rate
		// card scrolls away.
		return m('.card.chat-composer', [
			target
				? m('.chat-poster', [
						m('.chat-poster__pin'),
						m('.owner-row', [
							m('span.owner-chip.owner-chip--peer', `📙 ${t('delib.owner_peer')}`),
							m(
								'span.owner-row__number',
								t('delib.proposal_number', { n: proposalNumber(target) }),
							),
						]),
						m('p.chat-poster__text', target.statement),
					])
				: null,
			m('.chat-note', [
				m('.chat-note__tape'),
				m('span.chat-note__label', `📘 ${t('chat.my_note')}`),
				m('p.chat-note__question', t('delib.help_question')),
				m('p.chat-note__hint', t('delib.help_dont_attack')),
				m('textarea.text-input.chat-note__input', {
					value: improveDraft,
					rows: 3,
					placeholder: t('delib.suggest_placeholder'),
					disabled: !active,
					oninput: (event: InputEvent) => {
						improveDraft = (event.target as HTMLTextAreaElement).value;
					},
				}),
				m('.chat-composer__actions', [
					m(
						'button.btn.btn--ghost',
						{
							disabled: !active,
							onclick: () => dispatch({ type: 'IMPROVEMENT_SKIPPED' }),
						},
						t('chat.improve_skip'),
					),
					m(
						'button.btn.btn--primary',
						{
							disabled:
								!active ||
								busy ||
								!target ||
								improveDraft.trim().length < AGORA_LIMITS.MIN_ANSWER_LENGTH,
							onclick: () => {
								if (!target) return;
								const text = improveDraft.trim();
								busy = true;
								submitSuggestion(live, target, anonName, text)
									.then(() => {
										improveDraft = '';
										dispatch({
											type: 'IMPROVEMENT_SENT',
											proposalId: target.statementId,
											text,
										});
									})
									.catch((error: unknown) => {
										console.error('[DelibChat] Suggestion failed:', error);
									})
									.finally(() => {
										busy = false;
										m.redraw();
									});
							},
						},
						t('delib.send_suggestion'),
					),
				]),
			]),
		]);
	}

	function rateCard(card: Extract<CardRef, { type: 'rate' }>, active: boolean): m.Children {
		const live = initialVnode.attrs.session;
		const proposal = getDeliberationState().proposals.find(
			(candidate) => candidate.statementId === card.proposalId,
		);
		if (!proposal) {
			// The pinned proposal vanished from the snapshot
			return active
				? m('.card.stack', [
						m('p.square-says__meaning', t('chat.candidate_gone_card')),
						m(
							'button.btn.btn--secondary',
							{ onclick: () => dispatch({ type: 'CANDIDATE_GONE' }) },
							t('chat.back_to_menu'),
						),
					])
				: null;
		}
		const myRating = getDeliberationState().myRatings[proposal.statementId]?.value;

		return m('.card.stack.delib__rate-card', [
			// Whose proposal is this? A classmate's — the chip says so before
			// a word is read, and the guide said so in the bubble above
			m('.owner-row', [
				m('span.owner-chip.owner-chip--peer', `📙 ${t('delib.owner_peer')}`),
				m('span.owner-row__number', t('delib.proposal_number', { n: proposalNumber(proposal) })),
			]),
			m('p.scene__text', proposal.statement),
			m(
				'.rate-scale',
				RATE_OPTIONS.map((option) =>
					m(
						`button.rate-scale__option.rate-scale__option--${option.variant}`,
						{
							class: myRating === option.value ? 'rate-scale__option--selected' : undefined,
							'aria-pressed': String(myRating === option.value),
							disabled: !active || busy,
							onclick: () => {
								busy = true;
								rateProposal(live, proposal.statementId, option.value)
									.then(() => {
										dispatch({
											type: 'RATED',
											proposalId: proposal.statementId,
											value: option.value,
										});
									})
									.catch((error: unknown) => {
										console.error('[DelibChat] Rating failed:', error);
									})
									.finally(() => {
										busy = false;
										m.redraw();
									});
							},
						},
						[
							m('span.rate-scale__emoji', option.emoji),
							m('span.rate-scale__label', t(option.labelKey)),
						],
					),
				),
			),
		]);
	}

	function improveChoiceCard(
		card: Extract<CardRef, { type: 'improve_choice' }>,
		active: boolean,
	): m.Children {
		if (card.done && !active) return null;

		return m('.chat-choice', [
			m(
				'button.btn.btn--ghost',
				{
					disabled: !active,
					onclick: () => dispatch({ type: 'IMPROVEMENT_SKIPPED' }),
				},
				t('chat.improve_skip'),
			),
			m(
				'button.btn.btn--primary',
				{
					disabled: !active,
					onclick: () => dispatch({ type: 'IMPROVE_ACCEPTED' }),
				},
				t('chat.improve_yes'),
			),
		]);
	}

	function menuCard(active: boolean): m.Children {
		const input = buildMenuInput();
		const options = computeMenuOptions(input);
		const nudge = active ? computeNudge(input) : null;

		return m('.card.chat-menu', [
			m('p.workshop__question', t('chat.menu_title')),
			nudge ? m('p.chat-menu__nudge', t(nudge.key, nudge.params)) : null,
			m(
				'.chat-menu__options',
				options.map((option) =>
					m(
						'button.chat-menu__option',
						{
							key: option.choice,
							'data-choice': option.choice,
							disabled: !active,
							onclick: () => dispatch({ type: 'MENU_CHOICE', choice: option.choice }),
						},
						[
							m('span', t(option.labelKey, option.params)),
							option.badge !== undefined
								? m('span.chat-menu__badge', String(option.badge))
								: option.dot
									? m('span.chat-menu__dot')
									: null,
						],
					),
				),
			),
		]);
	}

	// ---- my proposal (edit) --------------------------------------------

	function myProposalCard(active: boolean): m.Children {
		const live = initialVnode.attrs.session;
		const mine = myProposal();
		if (!mine) return m('.card', m('.spinner'));

		// Seed / re-seed the draft when the proposal changes underneath —
		// without clobbering what the student is currently typing
		if (mineDraftBase !== mine.statement) {
			if (mineDraft.trim() === '' || mineDraft === mineDraftBase) {
				mineDraft = mine.statement;
			}
			mineDraftBase = mine.statement;
		}
		const text = mineDraft.trim();
		const changed = text !== mine.statement && text.length >= AGORA_LIMITS.MIN_PROPOSAL_LENGTH;

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
				disabled: !active,
				oninput: (event: InputEvent) => {
					mineDraft = (event.target as HTMLTextAreaElement).value;
				},
			}),
			m('.delib__actions', [
				m(
					'button.btn.btn--primary.my-lantern__save',
					{
						disabled: !active || !changed || busy,
						onclick: () => {
							busy = true;
							submitProposal(
								live,
								initialVnode.attrs.myParticipant.anonName,
								text,
								mine.statementId,
							)
								.then(() => {
									// Improving your own proposal earns glitter — the
									// behavior the game most wants to reinforce
									celebrate({ message: t('celebrate.proposal_improved'), detail: text });
									dispatch({ type: 'PROPOSAL_UPDATED' });
								})
								.catch((error: unknown) => {
									console.error('[DelibChat] Update proposal failed:', error);
								})
								.finally(() => {
									busy = false;
									m.redraw();
								});
						},
					},
					t('delib.update_proposal'),
				),
			]),
			m(NeedsPeek, { topic: initialVnode.attrs.topic }),
			active ? backToMenu() : null,
		]);
	}

	// ---- my feedback (suggestions received) ------------------------------
	// The scoreboard (camp columns + bridge meter) was removed 2026-08-04 —
	// a proper scoring board will come later.

	function myFeedbackCard(active: boolean): m.Children {
		const live = initialVnode.attrs.session;
		const mine = myProposal();
		if (!mine) return m('.card', m('.spinner'));
		const { suggestions } = getDeliberationState();
		const mySuggestions = [...(suggestions[mine.statementId] ?? [])].reverse();

		return m('.stack', [
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
											disabled: !active,
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
											disabled: !active,
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
											disabled: !active,
											onclick: () => {
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
			active ? backToMenu() : null,
		]);
	}

	// ---- ask the characters ---------------------------------------------

	function asksLeftFor(live: AgoraSession, review: AgoraCharacterReview | undefined): number {
		const asksUsed = review?.asksByRound?.[String(live.roundNumber)] ?? 0;

		return Math.max(0, AGORA_AI_REVIEW.MAX_ASKS_PER_CHARACTER_PER_ROUND - asksUsed);
	}

	function askCharacter(live: AgoraSession, character: AgoraCharacter, mine: AgoraProposal): void {
		if (reviewBusy[character.characterId]) return;
		reviewBusy[character.characterId] = true;
		askCharacterReview(live.sessionId, character.characterId, mine.statementId)
			.catch((error: unknown) => {
				console.error('[DelibChat] Character review failed:', error);
			})
			.finally(() => {
				reviewBusy[character.characterId] = false;
				m.redraw();
			});
	}

	function characterReviewCard(
		live: AgoraSession,
		character: AgoraCharacter,
		mine: AgoraProposal,
		review: AgoraCharacterReview | undefined,
	): m.Children {
		const asksLeft = asksLeftFor(live, review);
		const isBusy = reviewBusy[character.characterId] === true;
		// The verdict was given about an OLDER text — say so, don't let it
		// impersonate an opinion of the current proposal
		const stale = review !== undefined && mine.lastUpdate > review.lastUpdate;
		const ask = () => {
			askCharacter(live, character, mine);
		};

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
			isBusy
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

	function charactersCard(active: boolean): m.Children {
		const live = initialVnode.attrs.session;
		const topic = initialVnode.attrs.topic;
		const mine = myProposal();
		if (!mine) return m('.card', m('.spinner'));
		const { characterReviews } = getDeliberationState();
		const openCharacter = topic.characters.find(
			(character) => character.characterId === openCharacterId,
		);

		return m('.stack', [
			m(
				'.char-chips',
				topic.characters.map((character) => {
					const review =
						characterReviews[createAgoraCharacterReviewId(mine.statementId, character.characterId)];
					const open = openCharacterId === character.characterId;
					const stale = review !== undefined && mine.lastUpdate > review.lastUpdate;

					return m(
						'button.char-chips__chip',
						{
							class: open ? 'char-chips__chip--open' : undefined,
							'aria-expanded': String(open),
							disabled: !active,
							onclick: () => {
								openCharacterId = open ? '' : character.characterId;
								// One tap does it: opening a character with no verdict
								// (or one about older text) asks them right away
								if (!open && (!review || stale) && asksLeftFor(live, review) > 0) {
									askCharacter(live, character, mine);
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
						mine,
						getDeliberationState().characterReviews[
							createAgoraCharacterReviewId(mine.statementId, openCharacter.characterId)
						],
					)
				: null,
			active ? backToMenu() : null,
		]);
	}

	// ---- proposals I helped ----------------------------------------------

	/** Compact five-level scale for CHANGING my vote on a helped proposal */
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
			m('.owner-row', [
				m('span.owner-chip.owner-chip--peer', `📙 ${t('delib.owner_peer')}`),
				m('span.owner-row__number', t('delib.proposal_number', { n: proposalNumber(proposal) })),
			]),
			m('p.helped__current', proposal.statement),
			improvedSince ? m('p.helped__improved', `✨ ${t('delib.helped_improved_marker')}`) : null,
			m('p.square-says__meaning', t('delib.helped_rerate_prompt')),
			reRateScale(live, proposal),
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
						submitSuggestion(live, proposal, initialVnode.attrs.myParticipant.anonName, text)
							.catch((error: unknown) => {
								console.error('[DelibChat] Follow-up failed:', error);
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

	function helpedCard(active: boolean): m.Children {
		const live = initialVnode.attrs.session;
		const entries = getHelpedProposals(userId);
		if (entries.length === 0) {
			return m('.stack', [
				m('p.square-says__meaning.text-center', t('chat.branch_helped_empty')),
				active ? backToMenu() : null,
			]);
		}
		markHelpedSeen(entries);

		return m('.stack', [
			entries.map((entry) => helpedItem(live, entry)),
			active ? backToMenu() : null,
		]);
	}

	// ---------------------------------------------------------------------
	// Transcript rendering
	// ---------------------------------------------------------------------

	function renderCard(entry: Extract<TranscriptEntry, { kind: 'card' }>): m.Children {
		const active = entry.id === getChatFlow().state.activeCardId;
		const card = entry.card;
		const body = ((): m.Children => {
			switch (card.type) {
				case 'composer':
					return card.composer === 'proposal'
						? proposalComposer(card, active)
						: improvementComposer(card, active);
				case 'rate':
					return rateCard(card, active);
				case 'improve_choice':
					return improveChoiceCard(card, active);
				case 'menu':
					return menuCard(active);
				case 'my_proposal':
					return myProposalCard(active);
				case 'my_feedback':
					return myFeedbackCard(active);
				case 'characters':
					return charactersCard(active);
				case 'helped':
					return helpedCard(active);
			}
		})();
		if (body === null) return null;

		// Rate cards stay readable but frozen once answered; the menu and
		// branch cards gray out when they're history
		const inert = !active && card.type !== 'rate' ? '.chat-card--inert' : '';

		return m(`.chat-card${inert}`, body);
	}

	function renderEntry(entry: TranscriptEntry, previous: TranscriptEntry | undefined): m.Children {
		switch (entry.kind) {
			case 'bot':
				return m(
					ChatBubble,
					{ isMine: false, showAvatar: previous?.kind !== 'bot' },
					t(entry.key, entry.params),
				);
			case 'user':
				return m(ChatBubble, { isMine: true }, t(entry.key, entry.params));
			case 'user_text':
				return m(ChatBubble, { isMine: true }, entry.text);
			case 'user_rating': {
				const option = RATE_OPTIONS.find((candidate) => candidate.value === entry.value);

				return m(
					ChatBubble,
					{ isMine: true },
					m('span.chat-bubble__rating', [
						m('span.chat-bubble__rating-emoji', option?.emoji ?? ''),
						m('span', option ? t(option.labelKey) : ''),
					]),
				);
			}
			case 'card':
				return renderCard(entry);
		}
	}

	return {
		onremove() {
			window.clearTimeout(revealTimer);
			window.removeEventListener('scroll', onWindowScroll);
			stopDeliberationListeners();
			stopChatFlow();
		},

		onupdate() {
			// Follow the conversation down — but never yank a student who
			// scrolled up to reread something
			if (stickToBottom && renderCounter !== lastScrolledCounter) {
				lastScrolledCounter = renderCounter;
				window.scrollTo({
					top: document.documentElement.scrollHeight,
					behavior: reducedMotion ? 'auto' : 'smooth',
				});
			}
		},

		view(vnode) {
			const { session: live, myParticipant, topic } = vnode.attrs;
			const delib = getDeliberationState();

			// Re-attach on every render (idempotent) — survives route-transition
			// unmount races, same self-heal as GameController
			listenToDeliberation(live.sessionId, userId);

			// The conversation can only start once we KNOW whether the student
			// has a proposal and how much they already rated
			if (!delib.statementsLoaded || !delib.evaluationsLoaded) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}
			if (!isBootstrapped()) {
				bootstrap(myProposal() !== undefined, Object.keys(delib.myRatings).length);
			}

			const { state, transcript } = getChatFlow();

			// ---- staged reveal: guide lines "type in" on a wall-clock schedule
			const now = Date.now();
			if (!revealSeeded) {
				// A restored transcript renders at once — no replay theater
				for (const entry of transcript) revealAt.set(entry.id, 0);
				revealSeeded = true;
			}
			for (const entry of transcript) {
				if (entry.kind === 'bot' && !revealAt.has(entry.id)) {
					revealCursor = Math.max(now, revealCursor) + (reducedMotion ? 0 : TYPING_MS);
					revealAt.set(entry.id, revealCursor);
				}
			}
			const isRevealed = (entry: TranscriptEntry): boolean =>
				entry.kind !== 'bot' || (revealAt.get(entry.id) ?? 0) <= now;
			const pending = transcript.filter((entry) => !isRevealed(entry));
			if (pending.length > 0 && revealTimer === undefined) {
				const nextReveal = Math.min(...pending.map((entry) => revealAt.get(entry.id) ?? now));
				revealTimer = window.setTimeout(
					() => {
						revealTimer = undefined;
						m.redraw();
					},
					Math.max(50, nextReveal - now),
				);
			}
			renderCounter = transcript.length * 1000 + (transcript.length - pending.length);

			// ---- ScoreHud step mapping (keeps the HUD's mine/rate/help idiom)
			const mine = myProposal();
			const hudStep: ScoreHudStep =
				state.phase === 'rate_present' || state.phase === 'improve_prompt'
					? 'rate'
					: state.phase === 'improve_compose' || state.phase === 'helped'
						? 'help'
						: state.phase === 'menu'
							? buildMenuInput().candidatesLeft > 0
								? 'rate'
								: 'done'
							: 'mine';
			const ratingsMoved = mine
				? (delib.studentEvalTimes[mine.statementId] ?? []).filter(
						(entry) => entry.evaluatorId !== userId && entry.updatedAt > mine.lastUpdate,
					).length
				: 0;

			const squareUrl = topic.artwork?.locationVignetteUrls?.square;

			return m('.shell.shell--delib.shell--delib-chat', [
				m('.shell__content', { style: { gap: 'var(--space-md)' } }, [
					squareUrl
						? m('img.delib-banner', {
								src: squareUrl,
								alt: '',
								onerror: (event: Event) => {
									(event.target as HTMLElement).style.display = 'none';
								},
							})
						: null,
					m(ScoreHud, {
						session: live,
						topic,
						myParticipant,
						myProposal: mine,
						proposals: delib.proposals,
						scores: delib.scores,
						userId,
						step: hudStep,
						ratingsMoved,
					}),
					m(
						'.chat-log',
						{
							'aria-live': 'polite',
							'aria-label': t('chat.log_aria'),
						},
						// ALL children keyed — Mithril forbids mixed keyed/unkeyed
						// fragments (crash documented in the old Deliberation view).
						// A guide line still "typing" renders the dots in its own
						// slot; later pending lines stay empty until their turn.
						(() => {
							let typingShown = false;

							return transcript.map((entry, index) => {
								if (!isRevealed(entry)) {
									const body = typingShown ? null : m(TypingIndicator);
									typingShown = true;

									return m.fragment({ key: entry.id }, [body]);
								}

								return m.fragment({ key: entry.id }, [
									renderEntry(entry, index > 0 ? transcript[index - 1] : undefined),
								]);
							});
						})(),
					),
				]),
			]);
		},
	};
}
