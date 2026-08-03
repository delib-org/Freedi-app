import m from 'mithril';
import { t } from '../lib/i18n';

/**
 * One line of the deliberation conversation. Two speakers only: the guide
 * (start-aligned, parchment bubble, fixed owl persona) and the student
 * (end-aligned, blue --mine bubble — the ownership color law: blue is
 * always ME). Adapted from the join app's ChatMessage; no per-user avatar
 * hashing here because the guide is the only "other" speaker.
 */

export interface ChatBubbleAttrs {
	isMine: boolean;
	/** Collapse the guide avatar when the previous bubble was also the guide */
	showAvatar?: boolean;
}

export const GUIDE_GLYPH = '🦉';

export const ChatBubble: m.Component<ChatBubbleAttrs> = {
	view(vnode) {
		const { isMine, showAvatar = true } = vnode.attrs;

		if (isMine) {
			return m('.chat-bubble.chat-bubble--mine', m('.chat-bubble__body', vnode.children));
		}

		return m('.chat-bubble.chat-bubble--guide', [
			showAvatar
				? m('.chat-bubble__avatar', { 'aria-hidden': 'true' }, GUIDE_GLYPH)
				: m('.chat-bubble__avatar.chat-bubble__avatar--ghost', { 'aria-hidden': 'true' }),
			m('.chat-bubble__side', [
				showAvatar ? m('.chat-bubble__sender', t('chat.guide_name')) : null,
				m('.chat-bubble__body', vnode.children),
			]),
		]);
	},
};

/** The three-dot "the guide is typing" indicator */
export const TypingIndicator: m.Component = {
	view() {
		return m('.chat-bubble.chat-bubble--guide', [
			m('.chat-bubble__avatar', { 'aria-hidden': 'true' }, GUIDE_GLYPH),
			m('.chat-bubble__side', [
				m('.chat-bubble__body.chat-bubble__body--typing', { 'aria-label': t('chat.typing_aria') }, [
					m('span.chat-typing__dot'),
					m('span.chat-typing__dot'),
					m('span.chat-typing__dot'),
				]),
			]),
		]);
	},
};
