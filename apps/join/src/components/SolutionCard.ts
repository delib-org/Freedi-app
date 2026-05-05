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
	canEditSuggestion,
	getOptionParagraphs,
	loadOptionParagraphs,
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

/** Build the body content (everything below the title): inline body lines from
 *  a multi-paragraph `statement` field, then any loaded paragraph children,
 *  then the description preview as a fallback. Skips the description when
 *  paragraph children are loaded so we don't double up the same content. */
function renderRichBodyContent(option: Statement, bodyLines: string[]): m.Vnode[] {
	const nodes: m.Vnode[] = [];

	for (let i = 0; i < bodyLines.length; i++) {
		nodes.push(m('p.solution-card__body-paragraph', { key: `body-${i}` }, linkify(bodyLines[i])));
	}

	const paragraphs = getOptionParagraphs(option.statementId);
	if (paragraphs && paragraphs.length > 0) {
		for (const p of paragraphs) {
			if (!p.statement) continue;
			nodes.push(
				m(
					'p.solution-card__body-paragraph',
					{ key: `para-${p.statementId}` },
					linkify(p.statement),
				),
			);
		}

		return nodes;
	}

	const description = getOptionDescription(option);
	if (description && bodyLines.length === 0) {
		// Server-cached preview is stored as "para1 | para2 | ...". Split it
		// back so each preview paragraph reads as its own block — matches the
		// chat-message body rendering and keeps spacing consistent once the
		// user expands.
		const previewParas = description
			.split(' | ')
			.map((s) => s.trim())
			.filter(Boolean);
		for (let i = 0; i < previewParas.length; i++) {
			nodes.push(
				m(
					'p.solution-card__body-paragraph.solution-card__body-paragraph--preview',
					{ key: `desc-${i}` },
					linkify(previewParas[i]),
				),
			);
		}
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
	if (description && description.includes(' | ')) return true;
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
							'.solution-card__actions',
							question?.statementSettings?.dualRoleJoin !== false
								? [
										// Default: dual Activist + Organizer buttons. Admin can collapse
										// to a single "Join" by setting `dualRoleJoin: false` explicitly.
										m(
											`button.btn.btn--small${isJoinedAsActivist ? '.btn--agree' : '.btn--outline-agree'}`,
											{
												onclick: (e: Event) => {
													e.stopPropagation();
													handleJoin(option.statementId, questionId, 'activist', onRequestJoinForm);
												},
											},
											isJoinedAsActivist ? t('card.joined_activist') : t('card.join_activist'),
										),
										m(
											`button.btn.btn--small${isJoinedAsOrganizer ? '.btn--organizer' : '.btn--outline-organizer'}`,
											{
												onclick: (e: Event) => {
													e.stopPropagation();
													handleJoin(
														option.statementId,
														questionId,
														'organizer',
														onRequestJoinForm,
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
												onclick: (e: Event) => {
													e.stopPropagation();
													handleJoin(option.statementId, questionId, 'activist', onRequestJoinForm);
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
						])
					: null,
			],
		);
	},
};

async function handleJoin(
	optionId: string,
	questionId: string,
	role: JoinRole,
	onRequestJoinForm: (optionId: string, role: JoinRole) => void,
): Promise<void> {
	const creator = getCreator();
	if (!creator) return;

	const question = getQuestion();
	const joinForm = question?.statementSettings?.joinForm;

	if (joinForm?.enabled) {
		// Optimistic path: open the form IMMEDIATELY when the cache doesn't tell
		// us the user already submitted for this role. The Firestore verification
		// runs in the background and corrects the cache for next time.
		const cachedRole = getCachedJoinFormSubmissionRole(questionId, creator.uid);
		if (cachedRole !== role) {
			onRequestJoinForm(optionId, role);
			// Warm the cache so subsequent clicks on the same role skip the form.
			void getJoinFormSubmissionRole(questionId, creator.uid);

			return;
		}
	}

	await toggleJoining(optionId, questionId, role);
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
