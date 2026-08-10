import m from 'mithril';
import { t, tCount, isRTL, getLang } from '../lib/i18n';
import {
	AgoraProposal,
	getThreadMessages,
	isSuggestionKind,
	isSystemKind,
	openSuggestionsBy,
	resolveSuggestion,
	submitProposal,
	submitThreadMessage,
} from '../lib/proposals';
import { celebrate } from '../lib/celebration';
import { diffWords } from '../lib/textDiff';
import { markThreadSeen } from '../lib/seenState';
import { RateScale, rateOptionFor } from '../components/RateScale';
import { requestMineFocus } from '../lib/helpedFocus';
import {
	reWeighMoment,
	roundTripClosed,
	scoreMovedMoment,
	type ReWeighMoment,
} from '../lib/improvementSignals';
import {
	AgoraMessageKind,
	AgoraSession,
	AgoraSuggestionStatus,
	AGORA_LIMITS,
	createAgoraThreadKey,
} from '@freedi/shared-types';

/**
 * A conversation about a proposal is a PLACE you go to, not a fold inside a
 * card — the same shape every other Freedi app gives a chat (Join's option
 * chat, the main app's statement chat). The card keeps only the indicator
 * the other apps show: a bubble, the last thing said, when, and how many
 * messages are still unread.
 *
 * The data hierarchy is unchanged and deliberately Freedi-standard: every
 * message is a child Statement of the proposal Statement, keyed into one
 * conversation by `agoraThreadUserId` (the helper's uid).
 */
export interface ThreadChatAttrs {
	session: AgoraSession;
	proposal: AgoraProposal;
	/** The helper whose conversation this is — one thread per classmate */
	helperUid: string;
	/** Which side of the conversation I'm standing on */
	role: 'helper' | 'owner';
	userId: string;
	anonName: string;
	/** The proposal's number on the square — proposals are shown by number, never by name */
	proposalNumber: number;
	onBack: () => void;
	/** A suggestion-kind message left this page — the lap counts it as helping */
	onSuggestionSent?: (proposalId: string) => void;
}

/** HH:MM for today, a short date for anything older — WhatsApp's grammar */
export function formatMessageTime(timestamp: number): string {
	const date = new Date(timestamp);
	const today = new Date();
	const sameDay =
		date.getFullYear() === today.getFullYear() &&
		date.getMonth() === today.getMonth() &&
		date.getDate() === today.getDate();

	return new Intl.DateTimeFormat(
		getLang(),
		sameDay ? { hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short' },
	).format(date);
}

export interface ThreadEntryOptions {
	/** Who the conversation is with */
	label: string;
	messages: readonly AgoraProposal[];
	unread: number;
	/** Improvement ideas still waiting on the owner's answer (owner side only) */
	openIdeas?: number;
	/** The owner revised after my idea and I have not weighed it (helper side) */
	reWeigh?: boolean;
	/** The class answered my revision (owner side) */
	scoreMoved?: boolean;
	onOpen: () => void;
}

/**
 * What the indicator quotes. A system line has no words of its own — an
 * edit's `statement` is the whole new proposal, which would read as if
 * somebody had pasted it into the chat.
 */
function lastLine(message: AgoraProposal): string {
	if (message.agoraMessageKind === AgoraMessageKind.award) {
		return `🏅 +${message.agoraPointsAwarded ?? 0}`;
	}
	if (message.agoraMessageKind === AgoraMessageKind.edit) {
		return `✏️ ${t('delib.edit_line')}`;
	}

	return message.statement;
}

/**
 * The one-line indicator that replaces the inline thread on a card: bubble,
 * last message, its time, unread count. Nothing else — the conversation
 * itself lives on its own page.
 */
export function threadEntry(options: ThreadEntryOptions): m.Children {
	const { label, messages, unread, openIdeas = 0, reWeigh, scoreMoved, onOpen } = options;
	const last = messages[messages.length - 1];

	return m(
		'button.chat-entry',
		{
			type: 'button',
			class: unread > 0 ? 'chat-entry--unread' : undefined,
			'aria-label': t('delib.chat_open'),
			onclick: (event: Event) => {
				event.stopPropagation();
				onOpen();
			},
		},
		[
			m('span.chat-entry__icon', { 'aria-hidden': 'true' }, '💬'),
			m('span.chat-entry__body', [
				m('span.chat-entry__label', label),
				m(
					'span.chat-entry__last',
					{ class: last ? undefined : 'chat-entry__last--empty' },
					last ? lastLine(last) : t('delib.chat_start'),
				),
			]),
			m('span.chat-entry__meta', [
				last ? m('span.chat-entry__time', formatMessageTime(last.createdAt)) : null,
				openIdeas > 0
					? m('span.chat-entry__ideas', tCount('delib.thread_open_ideas', openIdeas))
					: null,
				// Marks, not counts: the unread number must keep meaning "how many
				// things were said", or two different facts start sharing one badge
				reWeigh
					? m('span.chat-entry__mark', { 'aria-label': t('thread.reweigh_title') }, '✨')
					: null,
				scoreMoved
					? m(
							'span.chat-entry__mark',
							{ 'aria-label': t('thread.score_bridge', { range: '' }) },
							'📈',
						)
					: null,
				unread > 0
					? m(
							'span.chat-entry__unread',
							{ 'aria-label': tCount('delib.thread_unread', unread) },
							String(unread),
						)
					: null,
			]),
		],
	);
}

export function ThreadChat(): m.Component<ThreadChatAttrs> {
	let draft = '';
	let busy = false;
	/** Message count the scroller last saw — a new message pins it to the bottom */
	let seenCount = -1;
	let listEl: HTMLElement | null = null;
	/**
	 * The proposal quoted at the top is EDITABLE by the person who wrote it —
	 * the answer to an idea is often "you're right", and the text you would
	 * change is right there. Same gesture as every other Freedi surface: tap
	 * the text, it becomes a box.
	 */
	let editing = false;
	let editDraft = '';
	let savingEdit = false;

	function stickToBottom(dom: HTMLElement, count: number): void {
		listEl = dom;
		if (count === seenCount) return;
		seenCount = count;
		dom.scrollTop = dom.scrollHeight;
	}

	/** The quoted proposal: a plain line, or the box it becomes when tapped */
	function proposalQuote(
		session: AgoraSession,
		proposal: AgoraProposal,
		anonName: string,
		canEdit: boolean,
	): m.Children {
		if (!canEdit) return m('p.chat-page__proposal', proposal.statement);

		if (!editing) {
			return m(
				'button.chat-page__proposal.chat-page__proposal--editable',
				{
					type: 'button',
					title: t('delib.tap_to_edit'),
					'aria-label': t('delib.tap_to_edit'),
					onclick: () => {
						editing = true;
						editDraft = proposal.statement;
					},
				},
				[
					m('span.chat-page__proposal-text', proposal.statement),
					m('span.chat-page__proposal-pencil', { 'aria-hidden': 'true' }, '✎'),
				],
			);
		}

		const text = editDraft.trim();
		const changed = text !== proposal.statement && text.length >= AGORA_LIMITS.MIN_PROPOSAL_LENGTH;

		return m('.chat-page__edit', [
			m('textarea.text-input.chat-page__edit-input', {
				value: editDraft,
				rows: 3,
				maxlength: AGORA_LIMITS.MAX_PROPOSAL_LENGTH,
				'aria-label': t('delib.my_proposal'),
				oncreate: (node: m.VnodeDOM) => {
					(node.dom as HTMLTextAreaElement).focus();
				},
				oninput: (event: InputEvent) => {
					editDraft = (event.target as HTMLTextAreaElement).value;
				},
			}),
			m('.delib__actions.delib__actions--tight', [
				m(
					'button.btn.btn--ghost.btn--sm',
					{
						onclick: () => {
							editing = false;
						},
					},
					t('common.cancel'),
				),
				m(
					'button.btn.btn--primary.btn--sm',
					{
						disabled: !changed || savingEdit,
						onclick: () => {
							savingEdit = true;
							submitProposal(session, anonName, text, proposal.statementId)
								.then(() => {
									editing = false;
									// The same glitter the workshop gives: improving your
									// own proposal is the behaviour the game most wants
									celebrate({ message: t('celebrate.proposal_improved'), detail: text });
								})
								.catch((error: unknown) => {
									console.error('[Chat] Update proposal failed:', error);
								})
								.finally(() => {
									savingEdit = false;
									m.redraw();
								});
						},
					},
					t('delib.update_proposal'),
				),
			]),
		]);
	}

	/**
	 * The owner's answer to an improvement idea. "Thank you" is the whole
	 * positive side of the economy now: it pays the classmate who sent the
	 * idea (server-side, so the points can't be spoofed) and closes the idea.
	 * Declining is free and silent.
	 */
	function decision(session: AgoraSession, message: AgoraProposal): m.Children {
		return m('.delib__actions.delib__actions--tight', [
			m(
				'button.btn.btn--ghost.btn--sm',
				{
					onclick: () => {
						resolveSuggestion(
							session.sessionId,
							message.statementId,
							AgoraSuggestionStatus.declined,
						).catch((error: unknown) => {
							console.error('[Chat] Decline suggestion failed:', error);
						});
					},
				},
				t('delib.no_thanks'),
			),
			m(
				'button.btn.btn--primary.btn--sm',
				{
					onclick: () => {
						resolveSuggestion(
							session.sessionId,
							message.statementId,
							AgoraSuggestionStatus.thanked,
						).catch((error: unknown) => {
							console.error('[Chat] Thank suggestion failed:', error);
						});
					},
				},
				`🙏 ${t('delib.thank')}`,
			),
		]);
	}

	/**
	 * The system's own lines, centred and unattributed so they never read as
	 * something a classmate said: what the author changed (Wikipedia-style,
	 * old wording struck through beside the new), and what a thank-you paid.
	 */
	function systemLine(message: AgoraProposal, role: 'helper' | 'owner'): m.Children {
		if (message.agoraMessageKind === AgoraMessageKind.award) {
			const points = message.agoraPointsAwarded ?? 0;

			return m('.chat-system.chat-system--award', { key: message.statementId }, [
				m('span.chat-system__icon', { 'aria-hidden': 'true' }, '🏅'),
				// BOTH sides read this line: "your idea earned you" is only true
				// for the helper — the author gave the points, they didn't get them
				m(
					'span.chat-system__text',
					tCount(role === 'owner' ? 'delib.award_line_owner' : 'delib.award_line', points),
				),
				m('span.chat-system__time', formatMessageTime(message.createdAt)),
			]);
		}

		const previous = message.agoraPreviousText ?? '';
		const parts = diffWords(previous, message.statement);

		return m(
			'.chat-system.chat-system--edit',
			{ key: message.statementId, id: `msg-${message.statementId}` },
			[
				m('.chat-system__head', [
					m('span.chat-system__icon', { 'aria-hidden': 'true' }, '✏️'),
					m('span.chat-system__text', t('delib.edit_line')),
					m('span.chat-system__time', formatMessageTime(message.createdAt)),
				]),
				// One paragraph, read straight through: untouched words plain,
				// what went in highlighted, what came out struck through
				// NO keys on these spans: they sit among plain strings (the untouched
				// runs), and Mithril forbids mixing keyed and unkeyed children in one
				// array — it throws mid-redraw and takes the whole screen with it.
				m(
					'p.chat-system__diff',
					parts.map((part) =>
						part.op === 'same'
							? part.text
							: m(
									`span.chat-system__${part.op === 'added' ? 'ins' : 'del'}`,
									{
										'aria-label': t(
											part.op === 'added' ? 'delib.diff_added' : 'delib.diff_removed',
										),
									},
									part.text,
								),
					),
				),
			],
		);
	}

	/**
	 * The circle closes on a press, so the glitter belongs to whoever pressed —
	 * and only once. A celebration that replays on every reload stops meaning
	 * anything, while the round trip itself is a fact about the data, true from
	 * then on.
	 */
	function cheerRoundTrip(session: AgoraSession, proposalId: string): void {
		if (!roundTripClosed(proposalId, currentThreadHelper)) return;
		const key = `agora_${session.sessionId}_roundtrip_${proposalId}_${currentThreadHelper}`;
		if (sessionStorage.getItem(key)) return;
		try {
			sessionStorage.setItem(key, '1');
		} catch {
			// A full or locked-down store must never cost the student the moment
		}
		celebrate({
			message: `🔁 ${t('celebrate.round_trip')}`,
			detail: t('thread.round_trip_body'),
			hint: t('celebrate.round_trip_hint'),
		});
	}

	/** The helper whose conversation is on screen, for the handlers above */
	let currentThreadHelper = '';

	// ---------- the two moments that close the improvement cycle ----------

	/**
	 * The read gate. The scale does not exist in the DOM until the student says
	 * they have read the change — which is the whole point of the block, and the
	 * one cheap thing that shifts the judgment from "be nice to them" back to
	 * "what does the new text say". `editedAt` is the gate's key, so a later
	 * revision closes it again.
	 */
	let gateOpenedFor = 0;
	/** The press that just happened, kept alive long enough to be answered */
	let justVoted: { before: number | undefined; after: number; at: number } | null = null;
	let votedTimer: number | undefined;

	function faceFor(value: number | undefined): string {
		return value === undefined ? '—' : (rateOptionFor(value)?.emoji ?? '—');
	}

	/**
	 * What a student sees after weighing a revision. The block itself vanishes
	 * the instant the rating lands (the moment is derived), so the confirmation
	 * has to outlive it — otherwise the one press that closes the whole cycle
	 * gets no answer at all.
	 */
	function votedLine(): m.Children {
		if (!justVoted) return null;

		return m('.chat-system.chat-system--moment.chat-system--voted', { key: 'reweigh-done' }, [
			m('span.chat-system__icon', { 'aria-hidden': 'true' }, '✓'),
			m(
				'span.chat-system__text',
				justVoted.before === undefined
					? t('delib.rerate_ack')
					: t('thread.reweigh_before_after', {
							before: faceFor(justVoted.before),
							after: faceFor(justVoted.after),
						}),
			),
		]);
	}

	/**
	 * The helper's moment: the owner revised after my idea, and I have not
	 * weighed the new version.
	 *
	 * Deliberately says only what is knowable — the text changed AFTER my idea,
	 * never that my idea is in it. The diff sits above; the student judges. And
	 * the scale arrives blank: marking the face I gave last time, right at the
	 * moment I am being asked to give another, is an anchor, and this particular
	 * number is the one the whole game is scored on.
	 */
	function reWeighBlock(
		session: AgoraSession,
		proposal: AgoraProposal,
		moment: ReWeighMoment,
		onScrollToChange: () => void,
	): m.Children {
		const open = gateOpenedFor === moment.editedAt;
		const title = moment.neverRated
			? t('thread.weigh_title')
			: moment.credited
				? t('thread.reweigh_title_credited')
				: t('thread.reweigh_title');

		return m('.chat-system.chat-system--moment.chat-system--reweigh', { key: 'reweigh' }, [
			m('.chat-system__head', [
				m('span.chat-system__icon', { 'aria-hidden': 'true' }, moment.credited ? '✨' : '✏️'),
				m('span.chat-system__text', title),
			]),
			open
				? [
						m('p.chat-system__prompt', t('thread.reweigh_prompt')),
						m(RateScale, {
							session,
							proposalId: proposal.statementId,
							// Blank on purpose — see the note above
							showCurrent: false,
							onVote: (value, previous) => {
								justVoted = { before: previous, after: value, at: Date.now() };
								window.clearTimeout(votedTimer);
								votedTimer = window.setTimeout(() => {
									justVoted = null;
									m.redraw();
								}, 5000);
								cheerRoundTrip(session, proposal.statementId);
							},
						}),
						// Said out loud, every time: keeping or lowering a rating is a
						// real answer, not a rudeness
						m('p.chat-system__free', t('thread.reweigh_free')),
					]
				: m('.chat-system__gate', [
						m(
							'button.btn.btn--primary.btn--sm',
							{
								type: 'button',
								onclick: () => {
									gateOpenedFor = moment.editedAt;
									onScrollToChange();
								},
							},
							t('thread.reweigh_read'),
						),
						m(
							'button.text-link',
							{ type: 'button', onclick: onScrollToChange },
							t('thread.reweigh_see_change'),
						),
					]),
		]);
	}

	/**
	 * The owner's moment: the class answered my revision.
	 *
	 * Two sentences, two attributions. The helper led to the revision — that is
	 * an act, and it is praiseworthy however the number lands. The number itself
	 * belongs to the class, in both directions. Fusing them ("your score rose
	 * because of X") would denominate a classmate's goodwill in points and hand
	 * them the blame the next time it falls, so on a drop the helper is not
	 * named at all.
	 */
	function scoreMovedBlock(
		proposal: AgoraProposal,
		helperUid: string,
		helperName: string,
		onBack: () => void,
	): m.Children {
		const moment = scoreMovedMoment(proposal.statementId, proposal.creatorId, helperUid, proposal);
		if (!moment) return null;

		const fell = moment.bridgeDelta < 0;
		// A single re-rater plus a direction is one identifiable classmate's vote,
		// so at n = 1 the line reports a state and no movement at all
		const single = moment.reRaters === 1;
		const range = `⁦${moment.bridgeNow - moment.bridgeDelta} → ${moment.bridgeNow}⁩`;

		return m(
			'.chat-system.chat-system--moment.chat-system--score',
			{ key: 'score', class: fell ? 'chat-system--down' : undefined },
			[
				m('.chat-system__head', [
					m(
						'span.chat-system__icon',
						{ 'aria-hidden': 'true' },
						single ? '👀' : fell ? '📉' : '📈',
					),
					m(
						'span.chat-system__text',
						single
							? t('thread.score_single', { n: moment.bridgeNow })
							: t('thread.score_since', { n: moment.reRaters }),
					),
				]),
				// The act, credited — but only where a credit cannot read as blame
				!single && !fell && helperName
					? m('p.chat-system__credit', t('thread.score_led', { name: helperName }))
					: null,
				!single && moment.bridgeDelta !== 0
					? m('p.chat-system__bridge', t('thread.score_bridge', { range }))
					: null,
				fell ? m('p.chat-system__hint', t('thread.score_fell')) : null,
				m(
					'button.text-link',
					{
						type: 'button',
						onclick: () => {
							// Close the chat FIRST, so the dock's focus request lands on
							// the game screen rather than on a page about to unmount
							onBack();
							requestMineFocus();
						},
					},
					t('thread.back_to_mine'),
				),
			],
		);
	}

	/**
	 * The circle, closed: an idea went out, it was acknowledged, the text came
	 * back changed, and it was weighed again. Direction-blind on purpose — a
	 * round trip that only counted when the score rose would be paying the
	 * helper to vote up.
	 */
	function roundTripBlock(): m.Children {
		return m('.chat-system.chat-system--moment.chat-system--roundtrip', { key: 'roundtrip' }, [
			m('span.chat-system__icon', { 'aria-hidden': 'true' }, '🔁'),
			m('.chat-system__body', [
				m('p.chat-system__title', t('thread.round_trip_title')),
				m('p.chat-system__text', t('thread.round_trip_body')),
			]),
		]);
	}

	/** One line of the conversation: what someone said, or what happened */
	function messageRow(
		session: AgoraSession,
		message: AgoraProposal,
		role: 'helper' | 'owner',
		userId: string,
	): m.Children {
		// What HAPPENED, as opposed to what someone said
		if (isSystemKind(message)) return systemLine(message, role);
		const mine = message.creatorId === userId;
		const decidable =
			role === 'owner' &&
			!mine &&
			isSuggestionKind(message) &&
			(message.suggestionStatus ?? AgoraSuggestionStatus.open) === AgoraSuggestionStatus.open;

		return m(
			'.thread__msg',
			{
				key: message.statementId,
				id: `msg-${message.statementId}`,
				class: [
					mine ? 'thread__msg--mine' : 'thread__msg--peer',
					isSuggestionKind(message) ? 'thread__msg--suggestion' : undefined,
				]
					.filter(Boolean)
					.join(' '),
			},
			[
				!mine && message.anonName ? m('span.thread__who', message.anonName) : null,
				isSuggestionKind(message)
					? m('span.thread__tag', `💡 ${t('delib.thread_suggestion_tag')}`)
					: null,
				m('p.thread__text', message.statement),
				m('span.thread__time', formatMessageTime(message.createdAt)),
				decidable ? decision(session, message) : statusChip(message),
				// Said once, where the button is: a thank-you is not just
				// politeness, it pays the classmate who helped
				decidable ? m('p.action-hint', t('delib.thank_hint')) : null,
			],
		);
	}

	/** The lifecycle chip a resolved improvement idea wears */
	function statusChip(message: AgoraProposal): m.Children {
		if (!isSuggestionKind(message)) return null;
		const status = message.suggestionStatus ?? AgoraSuggestionStatus.open;
		if (status === AgoraSuggestionStatus.open) return null;
		const key =
			status === AgoraSuggestionStatus.declined
				? 'delib.declined'
				: status === AgoraSuggestionStatus.implemented
					? 'delib.implemented'
					: status === AgoraSuggestionStatus.accepted
						? 'delib.accepted'
						: 'delib.thanked';

		return m('span.helped__chip', { class: `helped__chip--${status}` }, t(key));
	}

	return {
		onremove() {
			listEl = null;
		},

		view(vnode) {
			const { session, proposal, helperUid, role, userId, anonName, proposalNumber, onBack } =
				vnode.attrs;
			const threadKey = createAgoraThreadKey(proposal.statementId, helperUid);
			const messages = getThreadMessages(proposal.statementId, helperUid);

			// Standing on this page IS reading the conversation
			if (document.visibilityState === 'visible') {
				const newest = messages.reduce(
					(max, message) => (message.creatorId !== userId ? Math.max(max, message.createdAt) : max),
					0,
				);
				if (newest > 0) markThreadSeen(threadKey, newest);
			}

			// ONE open improvement idea at a time, per conversation. With the
			// mark-as-idea toggle gone the box decides for itself: while my idea
			// is still waiting on the author this is plain conversation (so chat
			// can never pile work on their desk), and the moment they answer —
			// thanks or no thanks — the box offers the next idea. Helping stays
			// earnable every lap without anyone queueing ideas nobody asked for.
			const kind =
				role === 'helper' && openSuggestionsBy(proposal.statementId, userId) === 0
					? AgoraMessageKind.suggestion
					: AgoraMessageKind.chat;
			const helperName =
				messages.find((message) => message.creatorId === helperUid)?.anonName ?? '';
			const title =
				role === 'owner'
					? helperName
						? t('delib.chat_with', { name: helperName })
						: t('delib.chat_with_author')
					: t('delib.chat_with_author');

			// The two closing moments of the improvement cycle. `creatorId` is the
			// truth about who is standing here — `role` is caller-supplied and can
			// lie — and both are derived, so neither can fire twice or go stale.
			currentThreadHelper = helperUid;
			const amHelper = role === 'helper' && proposal.creatorId !== userId && helperUid === userId;
			const moment = amHelper ? reWeighMoment(proposal.statementId, userId, proposal) : null;
			const closed = roundTripClosed(proposal.statementId, helperUid);

			function scrollToChange(): void {
				const newest = [...messages]
					.reverse()
					.find((message) => message.agoraMessageKind === AgoraMessageKind.edit);
				if (!newest) return;
				document
					.getElementById(`msg-${newest.statementId}`)
					?.scrollIntoView({ block: 'center', behavior: 'smooth' });
			}

			const listChildren = [
				...messages.map((message) => messageRow(session, message, role, userId)),
				moment ? reWeighBlock(session, proposal, moment, scrollToChange) : null,
				votedLine(),
				proposal.creatorId === userId
					? scoreMovedBlock(proposal, helperUid, helperName, onBack)
					: null,
				closed ? roundTripBlock() : null,
			].filter(Boolean);

			// A derived moment changes no message count, so it would otherwise
			// arrive below the fold — fold its presence into the scroll signature
			const scrollKey = messages.length * 8 + listChildren.length;

			return m('.shell.shell--chat', [
				m('.chat-page', [
					m('header.chat-page__bar', [
						m(
							'button.chat-page__back',
							{ type: 'button', 'aria-label': t('common.back'), onclick: onBack },
							m('span', { 'aria-hidden': 'true' }, isRTL() ? '→' : '←'),
						),
						m('.chat-page__who', [
							m('span.chat-page__title', title),
							m('span.chat-page__sub', t('delib.proposal_number', { n: proposalNumber })),
						]),
					]),
					// The proposal this conversation is about — and, for the person
					// who wrote it, the place to change it
					proposalQuote(session, proposal, anonName, proposal.creatorId === userId),
					m(
						'.chat-page__list',
						{
							oncreate: (node: m.VnodeDOM) => {
								stickToBottom(node.dom as HTMLElement, scrollKey);
							},
							onupdate: (node: m.VnodeDOM) => {
								stickToBottom(node.dom as HTMLElement, scrollKey);
							},
						},
						listChildren.length === 0
							? m('p.chat-page__empty', t('delib.chat_empty'))
							: listChildren,
					),
					m('.chat-page__composer', [
						m('textarea.text-input.chat-page__input', {
							value: draft,
							rows: 2,
							placeholder: t(
								role === 'owner' ? 'delib.thread_reply_placeholder' : 'delib.thread_placeholder',
							),
							oninput: (event: InputEvent) => {
								draft = (event.target as HTMLTextAreaElement).value;
							},
						}),
						m(
							`button.btn.btn--sm.chat-page__send.${
								kind === AgoraMessageKind.suggestion ? 'btn--primary' : 'btn--secondary'
							}`,
							{
								disabled: busy || draft.trim().length < AGORA_LIMITS.MIN_ANSWER_LENGTH,
								onclick: () => {
									const text = draft.trim();
									busy = true;
									draft = '';
									if (kind === AgoraMessageKind.suggestion) {
										vnode.attrs.onSuggestionSent?.(proposal.statementId);
									}
									submitThreadMessage(session, proposal, anonName, text, kind, helperUid)
										.catch((error: unknown) => {
											console.error('[Chat] Thread message failed:', error);
										})
										.finally(() => {
											busy = false;
											// The message I just sent is the newest thing here —
											// follow it down rather than leaving it below the fold
											seenCount = -1;
											if (listEl) listEl.scrollTop = listEl.scrollHeight;
											m.redraw();
										});
								},
							},
							t(
								kind === AgoraMessageKind.suggestion
									? 'delib.send_suggestion'
									: 'delib.thread_send',
							),
						),
					]),
				]),
			]);
		},
	};
}
