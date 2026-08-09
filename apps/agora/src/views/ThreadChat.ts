import m from 'mithril';
import { t, tCount, isRTL, getLang } from '../lib/i18n';
import {
	AgoraProposal,
	getThreadMessages,
	isSuggestionKind,
	openSuggestionsBy,
	resolveSuggestion,
	submitThreadMessage,
} from '../lib/proposals';
import { markThreadSeen } from '../lib/seenState';
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
	onOpen: () => void;
}

/**
 * The one-line indicator that replaces the inline thread on a card: bubble,
 * last message, its time, unread count. Nothing else — the conversation
 * itself lives on its own page.
 */
export function threadEntry(options: ThreadEntryOptions): m.Children {
	const { label, messages, unread, openIdeas = 0, onOpen } = options;
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
					last ? last.statement : t('delib.chat_start'),
				),
			]),
			m('span.chat-entry__meta', [
				last ? m('span.chat-entry__time', formatMessageTime(last.createdAt)) : null,
				openIdeas > 0
					? m('span.chat-entry__ideas', tCount('delib.thread_open_ideas', openIdeas))
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

	function stickToBottom(dom: HTMLElement, count: number): void {
		listEl = dom;
		if (count === seenCount) return;
		seenCount = count;
		dom.scrollTop = dom.scrollHeight;
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
					m('p.chat-page__proposal', proposal.statement),
					m(
						'.chat-page__list',
						{
							oncreate: (node: m.VnodeDOM) => {
								stickToBottom(node.dom as HTMLElement, messages.length);
							},
							onupdate: (node: m.VnodeDOM) => {
								stickToBottom(node.dom as HTMLElement, messages.length);
							},
						},
						messages.length === 0
							? m('p.chat-page__empty', t('delib.chat_empty'))
							: messages.map((message) => {
									const mine = message.creatorId === userId;
									const decidable =
										role === 'owner' &&
										!mine &&
										isSuggestionKind(message) &&
										(message.suggestionStatus ?? AgoraSuggestionStatus.open) ===
											AgoraSuggestionStatus.open;

									return m(
										'.thread__msg',
										{
											key: message.statementId,
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
											// Said once, where the button is: a thank-you is not
											// just politeness, it pays the classmate who helped
											decidable ? m('p.action-hint', t('delib.thank_hint')) : null,
										],
									);
								}),
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
