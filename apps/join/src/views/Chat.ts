import m from 'mithril';
import {
	getMessages,
	sendMessage,
	subscribeChat,
	unsubscribeChat,
	markOptionRead,
	needsDisplayName,
	setCustomDisplayName,
	getCustomDisplayName,
	subscribeMainStatement,
	getMainIdForQuestion,
	loadQuestion,
	subscribeQuestion,
	getQuestion,
} from '@/lib/store';
import { generateTemporalName } from '@/lib/nameGenerator';
import { t } from '@/lib/i18n';
import { isFacilitatedMode } from '@/lib/facilitator';
import { db, doc, getDoc, Unsubscribe } from '@/lib/firebase';
import { Collections, Statement } from '@freedi/shared-types';
import { getUserState, waitForAuthReady } from '@/lib/user';
import { ChatMessage } from '@/components/ChatMessage';
import { FacilitatorPanel } from '@/components/FacilitatorPanel';
import { BackButton } from '@/components/BackButton';
import { SplashLoader } from '@/views/Splash';

let option: Statement | null = null;
let loading = true;
let messageText = '';
let sending = false;
let messagesEl: HTMLElement | null = null;
let showNamePrompt = false;
let closingNamePrompt = false;
let nameInput = '';
let mainUnsub: Unsubscribe | null = null;
let questionUnsub: Unsubscribe | null = null;
// Tracks the `sid` (option id) this Chat instance is currently subscribed for.
// Mithril 2 reuses a component instance when the URL changes to the same route
// shape (e.g. follow-me from `/m/X/q/A/s/Y` to `/m/X/q/A/s/Z`), so `oninit`
// doesn't re-run. We compare against this on every update tick and re-init
// when the URL diverges — that's what actually swaps the rendered chat.
let currentChatOptionId: string | null = null;

let isAtBottom = true;
let newMessageCount = 0;
let prevMessageCount = 0;

const BOTTOM_THRESHOLD = 60;

function checkIfAtBottom(): void {
	if (!messagesEl) return;
	const { scrollTop, scrollHeight, clientHeight } = messagesEl;
	isAtBottom = scrollHeight - scrollTop - clientHeight < BOTTOM_THRESHOLD;
}

function scrollToBottom(): void {
	if (messagesEl) {
		messagesEl.scrollTop = messagesEl.scrollHeight;
	}
	isAtBottom = true;
	newMessageCount = 0;
}

function closeNamePrompt(): void {
	closingNamePrompt = true;
	m.redraw();
	setTimeout(() => {
		showNamePrompt = false;
		closingNamePrompt = false;
		m.redraw();
	}, 250);
}

function teardownChatSubscriptions(): void {
	unsubscribeChat();
	if (mainUnsub) {
		mainUnsub();
		mainUnsub = null;
	}
	if (questionUnsub) {
		questionUnsub();
		questionUnsub = null;
	}
}

async function initChatForOption(optionId: string): Promise<void> {
	// Re-entrant by design: when the facilitator moves us between chats under
	// the same route shape, drop the prior subscriptions and rebuild for the
	// new option. Without this, Mithril's component-instance reuse leaves us
	// on the previous chat even after the URL has updated.
	teardownChatSubscriptions();
	currentChatOptionId = optionId;
	loading = true;
	option = null;
	messageText = '';
	showNamePrompt = false;
	closingNamePrompt = false;
	nameInput = getCustomDisplayName() || '';
	isAtBottom = true;
	newMessageCount = 0;
	prevMessageCount = 0;
	m.redraw();

	try {
		const optionDoc = await getDoc(doc(db, Collections.statements, optionId));
		if (currentChatOptionId !== optionId) return;
		if (optionDoc.exists()) {
			option = optionDoc.data() as Statement;
		}
		subscribeChat(optionId);
		markOptionRead(optionId);

		const qid = m.route.param('qid');
		if (qid) {
			await loadQuestion(qid);
			if (currentChatOptionId !== optionId) return;
			questionUnsub = subscribeQuestion(qid);
		}

		let mainId: string | undefined = m.route.param('mid');
		if (!mainId) {
			const derivedMainId = getMainIdForQuestion(getQuestion());
			if (derivedMainId) mainId = derivedMainId;
		}
		if (mainId) {
			mainUnsub = subscribeMainStatement(mainId);
		}

		await waitForAuthReady();
		if (currentChatOptionId !== optionId) return;
		if (needsDisplayName()) {
			showNamePrompt = true;
		}
	} catch (err) {
		console.error('[Chat] Failed to load option:', err);
	} finally {
		if (currentChatOptionId === optionId) {
			loading = false;
			m.redraw();
		}
	}
}

export const Chat: m.Component = {
	async oninit() {
		const optionId = m.route.param('sid');
		if (!optionId) {
			loading = false;
			currentChatOptionId = null;
			m.redraw();

			return;
		}
		await initChatForOption(optionId);
	},

	onbeforeupdate() {
		// Mithril reuses this instance when the URL changes to another chat under
		// the same route shape. Re-init when the sid diverges so follow-me can
		// actually swap to the new chat instead of leaving the previous one on
		// screen with a stale URL.
		const optionId = m.route.param('sid');
		if (optionId && optionId !== currentChatOptionId) {
			void initChatForOption(optionId);
		}

		return true;
	},

	onremove() {
		teardownChatSubscriptions();
		currentChatOptionId = null;
		option = null;
		messagesEl = null;
	},

	view() {
		const questionId = m.route.param('qid');
		const user = getUserState().user;
		const msgs = getMessages();
		const facilitated = isFacilitatedMode();
		// `hasChat === false` means a facilitator paused chat. Treat undefined as
		// ON so existing questions without the field keep working.
		const chatPaused = getQuestion()?.statementSettings?.hasChat === false;

		const currentCount = msgs.length;
		if (currentCount > prevMessageCount && prevMessageCount > 0) {
			const incoming = currentCount - prevMessageCount;
			if (isAtBottom) {
				newMessageCount = 0;
			} else {
				newMessageCount += incoming;
			}
		}
		prevMessageCount = currentCount;

		if (loading) {
			return m(SplashLoader);
		}

		if (!option) {
			return m('.chat', m('.chat__empty', t('chat.not_found')));
		}

		const mainId = m.route.param('mid');

		// Where "back" goes depends on entry path: facilitated participants land
		// here from /m/:mid/q/:qid (the Solutions list), legacy share links from
		// /q/:qid. Admins also get the iOS-style corner BackButton as a redundant
		// affordance \u2014 kept since it's already wired up.
		const backTo = facilitated && mainId ? `/m/${mainId}/q/${questionId}` : `/q/${questionId}`;

		return m(`.chat${facilitated ? '.chat--facilitated' : ''}`, [
			facilitated && mainId ? m(BackButton, { to: `/m/${mainId}/q/${questionId}` }) : null,
			m('.chat__header', [
				m(
					'button.chat__back',
					{
						onclick: () => m.route.set(backTo),
						'aria-label': t('chat.back'),
					},
					'\u2190',
				),
				m('.chat__title', option.statement),
			]),

			msgs.length === 0
				? m('.chat__empty', t('chat.empty'))
				: m('.chat__messages-wrapper', [
						m(
							'.chat__messages',
							{
								oncreate: (vnode: m.VnodeDOM) => {
									messagesEl = vnode.dom as HTMLElement;
									scrollToBottom();
									messagesEl.addEventListener(
										'scroll',
										() => {
											checkIfAtBottom();
											if (isAtBottom && newMessageCount > 0) {
												newMessageCount = 0;
												m.redraw();
											}
										},
										{ passive: true },
									);
								},
								onupdate: () => {
									if (isAtBottom) {
										scrollToBottom();
									}
								},
							},
							msgs.map((msg) =>
								m(ChatMessage, {
									key: msg.statementId,
									message: msg,
									isMine: msg.creatorId === user?.uid,
								}),
							),
						),
						newMessageCount > 0
							? m(
									'button.chat__new-badge',
									{
										onclick: () => {
											scrollToBottom();
											m.redraw();
										},
									},
									[
										m(
											'span',
											t(newMessageCount > 1 ? 'chat.new_messages' : 'chat.new_message', {
												count: newMessageCount,
											}),
										),
										m('span', ' \u2193'),
									],
								)
							: null,
					]),

			chatPaused
				? m('.chat__paused-banner', t('facilitator.chat.paused'))
				: showNamePrompt
					? m(`.chat__name-prompt${closingNamePrompt ? '.chat__name-prompt--closing' : ''}`, [
							m('.chat__name-label', t('chat.name_prompt')),
							m('input.chat__name-input', {
								type: 'text',
								value: nameInput,
								placeholder: t('chat.name_placeholder'),
								oninput: (e: InputEvent) => {
									nameInput = (e.target as HTMLInputElement).value;
								},
								oncreate: (vnode: m.VnodeDOM) => {
									(vnode.dom as HTMLInputElement).focus();
								},
								onkeydown: (e: KeyboardEvent) => {
									if (e.key === 'Enter' && nameInput.trim()) {
										confirmName();
									} else if (e.key === 'Escape') {
										closeNamePrompt();
									}
								},
							}),
							m('.chat__name-actions', [
								m(
									'button.btn.btn--primary.btn--small',
									{
										disabled: !nameInput.trim(),
										onclick: confirmName,
									},
									t('chat.name_continue'),
								),
								m(
									'button.btn.btn--secondary.btn--small',
									{
										onclick: () => {
											const generated = generateTemporalName();
											nameInput = generated;
											setCustomDisplayName(generated);
											closeNamePrompt();
										},
									},
									t('chat.name_anonymous'),
								),
							]),
						])
					: m('.chat__input-area', [
							user?.isAnonymous
								? m(
										'button.chat__name-tag',
										{
											onclick: () => {
												nameInput = getCustomDisplayName() || '';
												showNamePrompt = true;
												m.redraw();
											},
										},
										[
											m('span', getCustomDisplayName() || t('chat.set_name')),
											m('span.chat__name-edit', '\u270E'),
										],
									)
								: null,
							m('.chat__input-bar', [
								m('textarea.chat__input', {
									value: messageText,
									placeholder: t('chat.placeholder'),
									rows: 1,
									oncreate: (vnode: m.VnodeDOM) => {
										autosizeTextarea(vnode.dom as HTMLTextAreaElement);
									},
									onupdate: (vnode: m.VnodeDOM) => {
										autosizeTextarea(vnode.dom as HTMLTextAreaElement);
									},
									onfocus: () => {
										if (needsDisplayName()) {
											showNamePrompt = true;
											m.redraw();
										}
									},
									oninput: (e: InputEvent) => {
										const ta = e.target as HTMLTextAreaElement;
										messageText = ta.value;
										autosizeTextarea(ta);
									},
									onkeydown: (e: KeyboardEvent) => {
										if (e.key === 'Enter' && !e.shiftKey) {
											e.preventDefault();
											handleSend();
										}
									},
								}),
								m(
									'button.chat__send',
									{
										disabled: !messageText.trim() || sending,
										onclick: handleSend,
										'aria-label': t('chat.send'),
									},
									'\u27A4',
								),
							]),
						]),
			m(FacilitatorPanel),
		]);
	},
};

function confirmName(): void {
	if (!nameInput.trim()) return;
	setCustomDisplayName(nameInput.trim());
	closeNamePrompt();
}

/** Auto-grow the message textarea to fit the user's text, capped at 6 lines.
 *  CSS already enforces the 6-line max-height via `max-height` on `.chat__input`;
 *  this resets `height` so it shrinks back when text is deleted, then matches
 *  scrollHeight so the input grows in step with the typed content. */
function autosizeTextarea(el: HTMLTextAreaElement): void {
	el.style.height = 'auto';
	el.style.height = `${el.scrollHeight}px`;
}

async function handleSend(): Promise<void> {
	const optionId = m.route.param('sid');
	if (!optionId || !messageText.trim() || sending) return;

	if (needsDisplayName()) {
		showNamePrompt = true;
		m.redraw();

		return;
	}

	sending = true;
	const text = messageText;
	messageText = '';
	m.redraw();

	try {
		await sendMessage(optionId, text);
	} catch (err) {
		console.error('[Chat] Failed to send message:', err);
		messageText = text;
	} finally {
		sending = false;
		m.redraw();
	}
}
