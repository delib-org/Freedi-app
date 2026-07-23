import m from 'mithril';
import { Statement, Creator, SortType } from '@freedi/shared-types';
import {
	toggleJoining,
	getCreator,
	getCachedJoinFormSubmissionRole,
	getJoinFormSubmissionRole,
	getQuestion,
	getMessageCount,
	getNewMessageCount,
	getClusterEvaluatorCount,
	setOptionFlag,
	resetOptionJoining,
	deleteOption,
	canEditSuggestion,
	getOptionParagraphs,
	loadOptionParagraphs,
	getUserCommittedOptions,
	JoinRole,
} from '@/lib/store';
import { getUserState } from '@/lib/user';
import { t } from '@/lib/i18n';
import {
	hasCelebrated,
	markCelebrated,
	playCelebrationSound,
	launchConfetti,
} from '@/lib/celebrate';
import { Evaluation } from '@/components/Evaluation';
import { linkify } from '@/lib/linkify';
import { formatText, matchNumberedItem } from '@/lib/formatText';

function getOptionDescription(option: Statement): string | null {
	if (option.description) return option.description;
	if (option.brief) return option.brief;

	if (option.paragraphs && option.paragraphs.length > 0) {
		return option.paragraphs
			.map((p) => p.content ?? '')
			.filter(Boolean)
			.join(' ');
	}

	return null;
}

// Per-option expand/collapse state. Module-level so it survives intra-route
// redraws (Mithril rebuilds the vnode tree on every redraw — local closures
// would reset the toggle on every keystroke elsewhere on the page).
const expandedOptions = new Set<string>();
// Per-option overflow detection — set after first paint when the collapsed
// rich-body's natural height exceeds its visible (clamped) height. Drives
// whether the "Read more" affordance appears at all.
const overflowingOptions = new Set<string>();

// Options with a delete in flight. Module-level for the same reason as the
// expand state above: the vnode tree is rebuilt on every redraw, so a local
// flag would be lost the moment anything else on the page re-renders.
const deletingOptions = new Set<string>();

/** Confirm + permanently delete an option. The options listener removes the
 *  card from the list on its own once Firestore acks, so there's nothing to
 *  clean up locally beyond the in-flight flag. */
async function handleDeleteOption(option: Statement): Promise<void> {
	if (deletingOptions.has(option.statementId)) return;

	const { title } = splitStatement(option.statement);
	const joinedCount = option.joined?.length ?? 0;
	const organizerCount = option.organizers?.length ?? 0;
	const message = t('admin.delete_confirm', {
		title: title || option.statement,
		activists: joinedCount,
		organizers: organizerCount,
	});
	if (!window.confirm(message)) return;

	deletingOptions.add(option.statementId);
	m.redraw();
	try {
		await deleteOption(option);
	} catch (err) {
		console.error('[SolutionCard] deleteOption failed:', err);
		window.alert(t('admin.delete_error'));
	} finally {
		deletingOptions.delete(option.statementId);
		m.redraw();
	}
}

function isExpanded(optionId: string): boolean {
	return expandedOptions.has(optionId);
}

function toggleExpanded(optionId: string): void {
	if (expandedOptions.has(optionId)) {
		expandedOptions.delete(optionId);

		return;
	}
	expandedOptions.add(optionId);
	// Lazy-fetch paragraph children the first time the user opens the card —
	// preview text (`description`) is capped at ~200 chars by the cloud
	// function, so the only way to render the full body is to query the
	// `statementType === paragraph` children. The store caches the result.
	void loadOptionParagraphs(optionId);
}

function detectOverflow(optionId: string, dom: Element): void {
	// 1px buffer absorbs sub-pixel rendering differences across browsers.
	const overflowing = dom.scrollHeight > dom.clientHeight + 1;
	const wasOverflowing = overflowingOptions.has(optionId);
	if (overflowing && !wasOverflowing) {
		overflowingOptions.add(optionId);
		m.redraw();
	} else if (!overflowing && wasOverflowing) {
		overflowingOptions.delete(optionId);
		m.redraw();
	}
}

/** Split a multi-line `option.statement` into its title (first non-empty line)
 *  and the remaining body lines. Options created via `AddSuggestionModal`
 *  store the entire textarea content (including newlines) in `statement`,
 *  so this is the only way to surface their body content without a separate
 *  Firestore round-trip. */
function splitStatement(statement: string): { title: string; bodyLines: string[] } {
	const paragraphs = statement
		.split(/\n+/)
		.map((p) => p.trim())
		.filter(Boolean);

	if (paragraphs.length === 0) return { title: '', bodyLines: [] };

	const [title, ...bodyLines] = paragraphs;

	return { title, bodyLines };
}

/** Single body entry — one paragraph or one list-line. Built from inline
 *  `statement` body lines, paragraph children, or the description preview. */
interface BodyEntry {
	key: string;
	text: string;
	preview?: boolean;
}

/** Build the body content (everything below the title): inline body lines from
 *  a multi-paragraph `statement` field, then any loaded paragraph children,
 *  then the description preview as a fallback. Skips the description when
 *  paragraph children are loaded so we don't double up the same content. */
function renderRichBodyContent(option: Statement, bodyLines: string[]): m.Vnode[] {
	const entries: BodyEntry[] = [];

	bodyLines.forEach((line, i) => entries.push({ key: `body-${i}`, text: line }));

	const paragraphs = getOptionParagraphs(option.statementId);
	if (paragraphs && paragraphs.length > 0) {
		for (const p of paragraphs) {
			if (!p.statement) continue;
			// Paragraph children may themselves contain newlines (rich body
			// stored as a single paragraph child). Split so numbered-list
			// detection works at line granularity.
			const lines = p.statement
				.split(/\n+/)
				.map((s) => s.trim())
				.filter(Boolean);
			lines.forEach((line, i) => entries.push({ key: `para-${p.statementId}-${i}`, text: line }));
		}
	} else if (bodyLines.length === 0) {
		const description = getOptionDescription(option);
		if (description) {
			// The cached preview can use either separator depending on who wrote
			// it last: the server-side `fn_syncParagraphChildrenToDescription`
			// joins with "\n\n", while client-side optimistic writes use " | ".
			// Split on either so each preview paragraph reads as its own block
			// regardless of who flushed last.
			const previewParas = description
				.split(/\n+|\s\|\s/)
				.map((s) => s.trim())
				.filter(Boolean);
			previewParas.forEach((line, i) =>
				entries.push({ key: `desc-${i}`, text: line, preview: true }),
			);
		}
	}

	return groupBodyEntries(option, entries);
}

/** Click handler for a truncated-URL fragment in the description preview.
 *  Resolves the prefix to its full URL by loading the option's paragraph
 *  children (if not already cached), then redirects a placeholder window
 *  opened synchronously during the user gesture so popup blockers stay
 *  satisfied. */
function handleTruncatedUrlClick(option: Statement, truncatedText: string, e: Event): void {
	e.preventDefault();
	e.stopPropagation();

	// Open synchronously while the user-gesture token is still live; we'll
	// either redirect or close it once the full URL is resolved.
	const placeholder = window.open('about:blank', '_blank', 'noopener,noreferrer');

	const resolveAndOpen = async (): Promise<void> => {
		try {
			await loadOptionParagraphs(option.statementId);
			const fullUrl = resolveTruncatedUrl(option, truncatedText);
			if (fullUrl && placeholder && !placeholder.closed) {
				placeholder.location.href = fullUrl;

				return;
			}
			if (placeholder && !placeholder.closed) placeholder.close();
		} catch (err) {
			console.error('[handleTruncatedUrlClick] failed:', err);
			if (placeholder && !placeholder.closed) placeholder.close();
		}
	};

	void resolveAndOpen();
}

const TRUNCATED_URL_PREFIX_STRIP = /(?:\.{2,}|…|\[truncated\]?)+$/;
const FULL_URL_REGEX = /\b((?:https?:\/\/|www\.)[^\s<>"]+)/gi;
const FULL_URL_TRAILING_PUNCT = /[).,;:!?'"\]}>…]+$/;

/** Find the full URL whose prefix matches the truncated fragment. Searches the
 *  loaded paragraph children — same source the cloud function used to build
 *  the preview, so any prefix the preview shows must appear here verbatim. */
function resolveTruncatedUrl(option: Statement, truncatedText: string): string | null {
	const prefix = truncatedText.replace(TRUNCATED_URL_PREFIX_STRIP, '').trim();
	if (!prefix) return null;

	const paragraphs = getOptionParagraphs(option.statementId);
	if (!paragraphs) return null;

	for (const p of paragraphs) {
		const text = p.statement ?? '';
		for (const match of text.matchAll(FULL_URL_REGEX)) {
			const candidate = match[0].replace(FULL_URL_TRAILING_PUNCT, '');
			if (candidate.startsWith(prefix)) {
				return candidate.startsWith('www.') ? `https://${candidate}` : candidate;
			}
		}
	}

	return null;
}

/** Walk the entries left-to-right; collapse runs of "1. ..." / "2. ..." into
 *  a single <ol>; render everything else as a paragraph. The list keeps the
 *  author's starting number via the `start` attribute, so a fragment like
 *  "3. third\n4. fourth" still numbers 3 and 4 instead of resetting to 1.
 *
 *  `option` is threaded through so preview entries (which can carry truncated
 *  URLs from the server-capped description) can attach a deferred-resolve
 *  click handler — keeps the truncated text clickable and routes the user to
 *  the real URL once the paragraph children are loaded. */
function groupBodyEntries(option: Statement, entries: BodyEntry[]): m.Vnode[] {
	const nodes: m.Vnode[] = [];
	let i = 0;

	const formatOptionsFor = (entry: BodyEntry): Parameters<typeof formatText>[1] =>
		entry.preview
			? {
					onTruncatedUrlClick: (text, e) => handleTruncatedUrlClick(option, text, e),
				}
			: undefined;

	while (i < entries.length) {
		const numbered = matchNumberedItem(entries[i].text);
		if (numbered) {
			const items: { entry: BodyEntry; content: string }[] = [];
			const startNum = numbered.num;
			while (i < entries.length) {
				const m2 = matchNumberedItem(entries[i].text);
				if (!m2) break;
				items.push({ entry: entries[i], content: m2.content });
				i++;
			}
			nodes.push(
				m(
					'ol.solution-card__body-list',
					{ key: `ol-${items[0].entry.key}`, start: startNum },
					items.map((it) =>
						m(
							'li.solution-card__body-list-item',
							{ key: it.entry.key },
							formatText(it.content, formatOptionsFor(it.entry)),
						),
					),
				),
			);
			continue;
		}

		const entry = entries[i];
		const cls = entry.preview
			? 'p.solution-card__body-paragraph.solution-card__body-paragraph--preview'
			: 'p.solution-card__body-paragraph';
		nodes.push(m(cls, { key: entry.key }, formatText(entry.text, formatOptionsFor(entry))));
		i++;
	}

	return nodes;
}

/** Heuristic: even before the DOM reports overflow, surface the toggle when
 *  the data shape strongly implies there's more content than the collapsed
 *  body shows. Catches server-truncated descriptions ("…" tail) and the case
 *  where paragraph children exist but haven't been fetched yet. */
function hasMoreContent(option: Statement, bodyLines: string[]): boolean {
	if (bodyLines.length > 2) return true;
	const description = getOptionDescription(option);
	if (description && description.endsWith('...')) return true;
	// Server-canonical preview uses "\n\n", client-optimistic uses " | "; either
	// separator means there's more than one paragraph to reveal.
	if (description && (description.includes('\n') || description.includes(' | '))) return true;
	const loadedParas = getOptionParagraphs(option.statementId);
	if (loadedParas && loadedParas.length > 0) return true;

	return false;
}

/** Pick one of the 15 voting-palette pairs from the statementId so each card
 *  has a stable, distinct rainbow accent in the playful themes. The CSS for
 *  serious mode ignores the resulting custom properties — they're scoped to
 *  `:root[data-theme="playful-*"]` selectors in `_components.scss`. Same
 *  FNV-1a hash the random-sort uses, so two participants always agree on
 *  which colour belongs to which option. Returns a Mithril-friendly style
 *  object — Mithril v2.2.8 routes hyphenated keys through `setProperty`,
 *  which is the only reliable way to write CSS custom properties. */
const CARD_PALETTE_PAIRS = 15;
function cardAccentStyle(statementId: string): Record<string, string> {
	let h = 2166136261;
	for (let i = 0; i < statementId.length; i++) {
		h ^= statementId.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	const idx = ((h >>> 0) % CARD_PALETTE_PAIRS) + 1;

	return {
		'--card-accent': `var(--voting-palette-pair-${idx}-dark)`,
		'--card-accent-soft': `var(--voting-palette-pair-${idx}-light)`,
	};
}

interface SolutionCardAttrs {
	option: Statement;
	questionId: string;
	onRequestJoinForm: (optionId: string, role: JoinRole) => void;
	/** Fired when the user clicks join but is already at the per-user cap.
	 *  Solutions.ts opens the swap modal so the user can pick which existing
	 *  membership to release before joining the new option. */
	onRequestLimitSwap?: (
		optionId: string,
		optionTitle: string,
		role: JoinRole,
		currentJoins: Statement[],
	) => void;
	/** When true, show admin curation controls (Hide / Force-show). */
	adminMode?: boolean;
	/** When true, render the organizer-suggestion variant (badge + accent). */
	isOrganizerSuggestion?: boolean;
	/** When true, render in facilitated/locked mode: no clicks, no join buttons,
	 *  no admin controls — only the facilitator can move participants. */
	displayOnly?: boolean;
	/** Open the edit modal for this option. Provided by the parent so the modal
	 *  lives at the page level (single overlay shared across cards). */
	onRequestEdit?: (optionId: string) => void;
	/** When true, apply a brief bluish highlight — used for newly arrived options
	 *  that the user flushed from the new-options pill. */
	highlighted?: boolean;
}

function renderTitle(statement: string): m.Vnode | null {
	const { title } = splitStatement(statement);
	if (!title) return null;

	return m('.solution-card__title', linkify(title));
}

/** Title-less body block: inline body lines + paragraph children + a Read more
 *  toggle when there's more to show. Returns null when there's nothing below
 *  the title — keeps the card tight for short single-line suggestions. */
function renderRichBody(option: Statement): m.Vnode | null {
	const { bodyLines } = splitStatement(option.statement);
	const bodyContent = renderRichBodyContent(option, bodyLines);
	if (bodyContent.length === 0) return null;

	const expanded = isExpanded(option.statementId);
	const overflowing = overflowingOptions.has(option.statementId);
	const hasMore = hasMoreContent(option, bodyLines);
	const showToggle = expanded || overflowing || hasMore;

	const bodyClass = expanded
		? '.solution-card__rich-body.solution-card__rich-body--expanded'
		: '.solution-card__rich-body';

	return m('.solution-card__body', [
		m(
			bodyClass,
			{
				oncreate: (v: m.VnodeDOM) => detectOverflow(option.statementId, v.dom as Element),
				onupdate: (v: m.VnodeDOM) => detectOverflow(option.statementId, v.dom as Element),
			},
			bodyContent,
		),
		showToggle
			? m(
					'button.solution-card__read-more',
					{
						type: 'button',
						'aria-expanded': expanded ? 'true' : 'false',
						onclick: (e: Event) => {
							e.stopPropagation();
							toggleExpanded(option.statementId);
						},
					},
					expanded ? t('card.show_less') : t('card.read_more'),
				)
			: null,
	]);
}

export const SolutionCard: m.Component<SolutionCardAttrs> = {
	view(vnode) {
		const {
			option,
			questionId,
			onRequestJoinForm,
			onRequestLimitSwap,
			adminMode,
			isOrganizerSuggestion,
			displayOnly,
			onRequestEdit,
			highlighted,
		} = vnode.attrs;
		const user = getUserState().user;
		const question = getQuestion();
		const joinedCount = option.joined?.length ?? 0;
		const organizerCount = option.organizers?.length ?? 0;
		const messageCount = getMessageCount(option.statementId);
		const newMsgCount = getNewMessageCount(option.statementId);

		const isJoinedAsActivist = user
			? (option.joined?.some((c: Creator) => c.uid === user.uid) ?? false)
			: false;
		const isJoinedAsOrganizer = user
			? (option.organizers?.some((c: Creator) => c.uid === user.uid) ?? false)
			: false;

		const isActivated = isOptionActivated(joinedCount, organizerCount, question);

		// Facilitator-controlled freeze: when the admin has frozen the question,
		// the card stays visible but joining / un-joining is disabled. Evaluation
		// is gated separately inside Evaluation.ts. Admin edits/manage-options
		// stay live so the facilitator can curate during the freeze.
		const frozen = question?.statementSettings?.questionStatus === 'frozen';

		const navigateToChat = (): void => {
			const mainId = m.route.param('mid');
			if (mainId) {
				m.route.set('/m/:mid/q/:qid/s/:sid', {
					mid: mainId,
					qid: questionId,
					sid: option.statementId,
				});

				return;
			}
			m.route.set('/q/:qid/s/:sid', {
				qid: questionId,
				sid: option.statementId,
			});
		};

		const handleCardClick = (e: Event): void => {
			const target = e.target as HTMLElement;

			// Don't navigate if clicking on interactive elements
			if (
				target.closest('button') ||
				target.closest('[role="button"]') ||
				target.closest('a') ||
				target.closest('input') ||
				target.closest('textarea')
			) {
				return;
			}

			// Only navigate if clicking on the card itself, not on nested content
			navigateToChat();
		};

		const isCluster = option.isCluster === true;
		const groupSize = option.integratedOptions?.length ?? 0;
		// Show the edit affordance to the option's creator and to question admins.
		// Allowed even in facilitated/displayOnly mode — editing your own text
		// doesn't disrupt the facilitator's flow the way joining/voting does.
		// Suppressed only on cluster cards (system-generated title, not authored).
		const showEdit = !isCluster && Boolean(onRequestEdit) && canEditSuggestion(option);

		const organizerClass = isOrganizerSuggestion ? '.solution-card--organizer' : '';
		const displayOnlyClass = displayOnly ? '.solution-card--display-only' : '';
		const highlightClass = highlighted ? '.solution-card--highlighted' : '';

		return m(
			`.solution-card${isActivated ? '.solution-card--activated' : ''}${isCluster && groupSize > 0 ? '.solution-card--grouped' : ''}${organizerClass}${displayOnlyClass}${highlightClass}`,
			{
				// Stable identifier the FLIP reorder animation reads on the parent
				// list; see lib/flipAnimate.ts and views/Solutions.ts.
				'data-flip-id': option.statementId,
				// Per-card rainbow accent. The CSS only consumes these vars under
				// the playful theme selectors, so serious mode is unaffected.
				style: cardAccentStyle(option.statementId),
				role: displayOnly ? undefined : 'button',
				tabindex: displayOnly ? undefined : 0,
				'aria-label': option.statement,
				'aria-disabled': displayOnly ? 'true' : undefined,
				onclick: displayOnly ? undefined : handleCardClick,
				onkeydown: displayOnly
					? undefined
					: (e: KeyboardEvent) => {
							if (e.key === 'Enter' || e.key === ' ') {
								e.preventDefault();
								navigateToChat();
							}
						},
				oncreate: (vnode: m.VnodeDOM) => {
					if (isActivated && !hasCelebrated(option.statementId)) {
						markCelebrated(option.statementId);
						playCelebrationSound();
						launchConfetti(vnode.dom as HTMLElement);
					}
				},
				onupdate: (vnode: m.VnodeDOM) => {
					if (isActivated && !hasCelebrated(option.statementId)) {
						markCelebrated(option.statementId);
						playCelebrationSound();
						launchConfetti(vnode.dom as HTMLElement);
					}
				},
			},
			[
				isOrganizerSuggestion
					? m('.solution-card__organizer-badge', t('admin.suggestion_badge'))
					: null,
				isActivated ? m('.solution-card__activated-badge', t('card.activated')) : null,
				renderMetaRow(option, isCluster, groupSize),
				renderTitle(option.statement),
				renderRichBody(option),
				// The 5-face evaluation row is gated by the same
				// `statementSettings.showEvaluation` flag the main app uses, so
				// both surfaces open and close evaluation in lockstep — and
				// turning it off in the FacilitatorPanel hides it everywhere.
				// No `key` here on purpose: this slot is positional, and mixing
				// keyed + unkeyed siblings in a fragment is a Mithril error.
				question?.statementSettings?.showEvaluation === true ? m(Evaluation, { option }) : null,
				// Independent from the evaluation row above — `showResults` is a
				// distinct admin toggle in the FacilitatorPanel so a moderator
				// can reveal numbers at a chosen moment without flipping
				// participants out of voting mode.
				question?.statementSettings?.showResults === true
					? renderResultsStrip(option, question.statementSettings?.defaultSortType)
					: null,
				buildQuotaBar(joinedCount, organizerCount, question),
				m('.solution-card__meta', [
					question?.statementSettings?.showEvaluation !== true
						? m('.solution-card__counts', [
								m('.solution-card__count', t('card.activists', { count: joinedCount })),
								m('.solution-card__count', t('card.organizers', { count: organizerCount })),
							])
						: null,
					showEdit
						? m(
								'button.solution-card__edit',
								{
									type: 'button',
									'aria-label': t('solutions.edit_suggestion'),
									onclick: (e: Event) => {
										e.stopPropagation();
										onRequestEdit?.(option.statementId);
									},
								},
								[
									m('span.solution-card__edit-icon', { 'aria-hidden': 'true' }, '✎'),
									m('span.solution-card__edit-label', t('solutions.edit_suggestion')),
								],
							)
						: null,
					// Hide the chat affordance globally when a facilitator pauses chat
					// (`hasChat === false`). Treat undefined as ON for back-compat.
					// Chat stays interactive even in `displayOnly` (facilitated) mode —
					// reading/posting per-option discussion isn't a navigation conflict.
					question?.statementSettings?.hasChat === false
						? null
						: m(
								'.solution-card__chat',
								{
									class: messageCount > 0 ? 'solution-card__chat--active' : '',
									role: 'button',
									tabindex: 0,
									'aria-label':
										newMsgCount > 0
											? t(newMsgCount > 1 ? 'card.new_messages_plural' : 'card.new_messages', {
													count: newMsgCount,
												})
											: t('chat.open'),
									onclick: (e: Event) => {
										e.stopPropagation();
										navigateToChat();
									},
									onkeydown: (e: KeyboardEvent) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault();
											e.stopPropagation();
											navigateToChat();
										}
									},
								},
								[
									m('.solution-card__chat-icon', { 'aria-hidden': 'true' }, '\uD83D\uDCAC'),
									messageCount > 0 ? m('.solution-card__chat-count', messageCount) : null,
									newMsgCount > 0
										? m('.solution-card__chat-new', { 'aria-hidden': 'true' }, newMsgCount)
										: null,
								],
							),
				]),
				// Facilitated mode (`displayOnly`) usually suppresses interactive
				// controls so the admin owns navigation, but joining is a per-
				// option commitment — not a navigation — so the admin's explicit
				// "🤝 Show joining" toggle overrides displayOnly. The toggle
				// defaults to ON; admin sets it false to collapse to a pure
				// evaluation surface.
				question?.statementSettings?.showJoining === false
					? null
					: m(
							`.solution-card__actions${frozen ? '.solution-card__actions--frozen' : ''}`,
							{ 'aria-disabled': frozen ? 'true' : undefined },
							question?.statementSettings?.dualRoleJoin !== false
								? [
										// Default: dual Activist + Organizer buttons. Admin can collapse
										// to a single "Join" by setting `dualRoleJoin: false` explicitly.
										m(
											`button.btn.btn--small${isJoinedAsActivist ? '.btn--agree' : '.btn--outline-agree'}`,
											{
												disabled: frozen ? true : undefined,
												title: frozen ? t('frozen.aria_disabled') : undefined,
												onclick: (e: Event) => {
													e.stopPropagation();
													if (frozen) return;
													handleJoin(
														option,
														questionId,
														'activist',
														onRequestJoinForm,
														onRequestLimitSwap,
													);
												},
											},
											isJoinedAsActivist ? t('card.joined_activist') : t('card.join_activist'),
										),
										m(
											`button.btn.btn--small${isJoinedAsOrganizer ? '.btn--organizer' : '.btn--outline-organizer'}`,
											{
												disabled: frozen ? true : undefined,
												title: frozen ? t('frozen.aria_disabled') : undefined,
												onclick: (e: Event) => {
													e.stopPropagation();
													if (frozen) return;
													handleJoin(
														option,
														questionId,
														'organizer',
														onRequestJoinForm,
														onRequestLimitSwap,
													);
												},
											},
											isJoinedAsOrganizer ? t('card.joined_organizer') : t('card.join_organizer'),
										),
									]
								: [
										m(
											`button.btn.btn--small${isJoinedAsActivist ? '.btn--agree' : '.btn--outline-agree'}`,
											{
												disabled: frozen ? true : undefined,
												title: frozen ? t('frozen.aria_disabled') : undefined,
												onclick: (e: Event) => {
													e.stopPropagation();
													if (frozen) return;
													handleJoin(
														option,
														questionId,
														'activist',
														onRequestJoinForm,
														onRequestLimitSwap,
													);
												},
											},
											isJoinedAsActivist ? t('card.joined') : t('card.join'),
										),
									],
						),
				adminMode && !displayOnly
					? m('.solution-card__admin', [
							m(
								'button.btn.btn--small.btn--outline',
								{
									onclick: (e: Event) => {
										e.stopPropagation();
										setOptionFlag(option.statementId, 'hide', !option.hide);
									},
								},
								option.hide ? t('admin.unhide') : t('admin.hide'),
							),
							!isOrganizerSuggestion
								? m(
										'button.btn.btn--small.btn--outline',
										{
											onclick: (e: Event) => {
												e.stopPropagation();
												setOptionFlag(option.statementId, 'forceShow', !option.forceShow);
											},
										},
										option.forceShow ? t('admin.unforce') : t('admin.force_show'),
									)
								: null,
							// Reset counters — surfaced only when there's actually
							// something to clear so admins can't fire an empty
							// confirmation on a fresh card.
							(option.joined?.length ?? 0) + (option.organizers?.length ?? 0) > 0
								? m(
										'button.btn.btn--small.btn--outline',
										{
											onclick: (e: Event) => {
												e.stopPropagation();
												const activists = option.joined?.length ?? 0;
												const organizers = option.organizers?.length ?? 0;
												const message = t('admin.reset_confirm', {
													title: option.statement,
													activists,
													organizers,
												});
												if (!window.confirm(message)) return;
												void resetOptionJoining(option.statementId);
											},
										},
										t('admin.reset'),
									)
								: null,
							// Permanent delete. Last in the row and danger-tinted because
							// it's the only irreversible action on the card — Hide is the
							// reversible alternative. Outline rather than solid so it
							// doesn't outweigh the curation buttons beside it.
							m(
								'button.btn.btn--small.btn--outline.solution-card__delete',
								{
									disabled: deletingOptions.has(option.statementId) ? true : undefined,
									onclick: (e: Event) => {
										e.stopPropagation();
										void handleDeleteOption(option);
									},
								},
								deletingOptions.has(option.statementId)
									? t('admin.delete.in_progress')
									: t('admin.delete'),
							),
						])
					: null,
			],
		);
	},
};

async function handleJoin(
	option: Statement,
	questionId: string,
	role: JoinRole,
	onRequestJoinForm: (optionId: string, role: JoinRole) => void,
	onRequestLimitSwap:
		| ((optionId: string, optionTitle: string, role: JoinRole, currentJoins: Statement[]) => void)
		| undefined,
): Promise<void> {
	const creator = getCreator();
	if (!creator) return;

	const question = getQuestion();
	const joinForm = question?.statementSettings?.joinForm;

	// Cap check — counts distinct activities (any role). Skipped when:
	//   • the user is already on this option in EITHER role (an activist→
	//     organizer swap on the same option doesn't change their count), or
	//   • the user is unjoining (the click on an already-joined role removes
	//     them, so cap can only go down — toggleJoining handles that path).
	// When the cap is hit on a brand-new option, hand off to the parent's
	// swap modal. Admin owns the cap via `activationThreshold.maxJoinsPerUser`.
	//
	// This is a UX pre-check only — the canonical enforcement now lives in
	// the `fn_joinOption` callable. A direct Firestore write attempting to
	// bypass the cap is blocked by firestore.rules (`blocksDirectMembershipMutation`
	// requires the callable path when a joinForm is configured).
	const isOnThisOptionAnyRole =
		(Array.isArray(option.joined) && option.joined.some((c) => c.uid === creator.uid)) ||
		(Array.isArray(option.organizers) && option.organizers.some((c) => c.uid === creator.uid));
	const cap = question?.statementSettings?.activationThreshold?.enabled
		? (question.statementSettings.activationThreshold.maxJoinsPerUser ?? 0)
		: 0;
	if (cap > 0 && !isOnThisOptionAnyRole && onRequestLimitSwap) {
		const currentJoins = getUserCommittedOptions().filter(
			(o) => o.statementId !== option.statementId,
		);
		if (currentJoins.length >= cap) {
			onRequestLimitSwap(option.statementId, option.statement, role, currentJoins);

			return;
		}
	}

	if (joinForm?.enabled) {
		// Optimistic path: open the form IMMEDIATELY when the cache doesn't tell
		// us the user already submitted for this role. The Firestore verification
		// runs in the background and corrects the cache for next time.
		const cachedRole = getCachedJoinFormSubmissionRole(questionId, creator.uid);
		if (cachedRole !== role) {
			onRequestJoinForm(option.statementId, role);
			// Warm the cache so subsequent clicks on the same role skip the form.
			void getJoinFormSubmissionRole(questionId, creator.uid);

			return;
		}
	}

	await toggleJoining(option.statementId, questionId, role);
	m.redraw();
}

function renderMetaRow(option: Statement, isCluster: boolean, groupSize: number): m.Vnode | null {
	if (!isCluster) return null;

	const evaluatorCount = getClusterEvaluatorCount(option.statementId);
	const showBadge = groupSize > 0;
	const showVotes = evaluatorCount > 0;
	if (!showBadge && !showVotes) return null;

	return m('.solution-card__meta-row', [
		showBadge
			? m('.solution-card__group-badge', t('card.group_represents', { count: groupSize }))
			: null,
		showVotes
			? m('.solution-card__group-votes', t('card.group_evaluators', { count: evaluatorCount }))
			: null,
	]);
}

// Mirrors the main app's `EnhancedEvaluation` results display so admins who
// flip "Show Results" (statementSettings.showEvaluation) get the same numbers
// on every card here as they do in the main app: total evaluators, the avg
// of (sumPro - sumCon) / numberOfEvaluators, and consensus * 100. Hidden
// until at least one evaluator has voted so empty cards don't read as "0%".
type ResultsPrimary = 'consensus' | 'average' | 'evaluators';

function getPrimaryFromSort(sortType: SortType | undefined): ResultsPrimary {
	switch (sortType) {
		case SortType.averageEvaluation:
			return 'average';
		case SortType.accepted:
		default:
			return 'consensus';
	}
}

function renderResultsStrip(option: Statement, sortType: SortType | undefined): m.Vnode | null {
	const evalData = option.evaluation;
	const numberOfEvaluators = evalData?.numberOfEvaluators ?? 0;
	if (numberOfEvaluators <= 0) return null;

	const sumPro = evalData?.sumPro ?? 0;
	const sumCon = evalData?.sumCon ?? 0;
	const average =
		typeof evalData?.averageEvaluation === 'number'
			? evalData.averageEvaluation
			: (sumPro - sumCon) / numberOfEvaluators;
	const averagePct = Math.round(average * 100);
	const consensusPct = Math.round((option.consensus ?? 0) * 100);
	const primary = getPrimaryFromSort(sortType);

	const pill = (kind: ResultsPrimary, label: string, value: string): m.Vnode =>
		m(
			`.solution-card__result${primary === kind ? '.solution-card__result--primary' : ''}`,
			{
				// Stops a tap on the strip from bubbling up to the card-level
				// navigate-to-chat handler. Same defensive pattern the chat pill
				// and evaluation row already use.
				onclick: (e: Event) => e.stopPropagation(),
			},
			[m('span.solution-card__result-value', value), m('span.solution-card__result-label', label)],
		);

	return m('.solution-card__results', { 'aria-label': t('card.results.aria_label') }, [
		numberOfEvaluators >= 3
			? pill('consensus', t('card.results.consensus'), `${consensusPct}%`)
			: null,
		pill('average', t('card.results.average'), `${averagePct}%`),
		pill('evaluators', t('card.results.evaluators'), `${numberOfEvaluators}`),
	]);
}

function isOptionActivated(
	joinedCount: number,
	organizerCount: number,
	question: Statement | null,
): boolean {
	const threshold = question?.statementSettings?.activationThreshold;
	if (!threshold?.enabled) return false;

	const minActivists = threshold.minActivists ?? 0;
	const minOrganizers = threshold.minOrganizers ?? 0;
	if (minActivists === 0 && minOrganizers === 0) return false;

	return joinedCount >= minActivists && organizerCount >= minOrganizers;
}

function buildQuotaBar(
	joinedCount: number,
	organizerCount: number,
	question: Statement | null,
): m.Vnode | null {
	const threshold = question?.statementSettings?.activationThreshold;
	if (!threshold?.enabled) return null;

	const minActivists = threshold.minActivists ?? 0;
	const minOrganizers = threshold.minOrganizers ?? 0;
	if (minActivists === 0 && minOrganizers === 0) return null;

	const activistsMet = joinedCount >= minActivists;
	const organizersMet = organizerCount >= minOrganizers;
	const allMet = activistsMet && organizersMet;

	const items: m.Vnode[] = [];

	if (minActivists > 0) {
		const remaining = Math.max(0, minActivists - joinedCount);
		const pct = Math.min(100, Math.round((joinedCount / minActivists) * 100));
		items.push(
			m('.solution-card__quota-row', [
				m(
					'.solution-card__quota-label',
					activistsMet
						? t('card.quota.activists_met')
						: t('card.quota.activists_needed', { count: remaining }),
				),
				m('.solution-card__quota-track', [
					m('.solution-card__quota-fill.solution-card__quota-fill--activist', {
						style: { width: `${pct}%` },
					}),
				]),
			]),
		);
	}

	if (minOrganizers > 0) {
		const remaining = Math.max(0, minOrganizers - organizerCount);
		const pct = Math.min(100, Math.round((organizerCount / minOrganizers) * 100));
		items.push(
			m('.solution-card__quota-row', [
				m(
					'.solution-card__quota-label',
					organizersMet
						? t('card.quota.organizers_met')
						: t('card.quota.organizers_needed', { count: remaining }),
				),
				m('.solution-card__quota-track', [
					m('.solution-card__quota-fill.solution-card__quota-fill--organizer', {
						style: { width: `${pct}%` },
					}),
				]),
			]),
		);
	}

	return m(`.solution-card__quota${allMet ? '.solution-card__quota--met' : ''}`, items);
}
