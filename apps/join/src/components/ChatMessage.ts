import m from 'mithril';
import { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { linkify } from '@/lib/linkify';
import { formatText, matchNumberedItem } from '@/lib/formatText';

interface ChatMessageAttrs {
	message: Statement;
	isMine: boolean;
}

function formatTime(timestamp: number): string {
	const date = new Date(timestamp);
	const hours = date.getHours().toString().padStart(2, '0');
	const minutes = date.getMinutes().toString().padStart(2, '0');

	return `${hours}:${minutes}`;
}

function getInitials(name: string): string {
	const parts = name.trim().split(/\s+/);
	if (parts.length >= 2) {
		return (parts[0][0] + parts[1][0]).toUpperCase();
	}

	return name.slice(0, 2).toUpperCase();
}

/** Render chat body paragraphs with WhatsApp-style formatting + numbered-list
 *  grouping (consecutive `1. ...` / `2. ...` lines become a single <ol>). */
function renderChatBodyParagraphs(lines: string[]): m.Vnode[] {
	const nodes: m.Vnode[] = [];
	let i = 0;
	while (i < lines.length) {
		const numbered = matchNumberedItem(lines[i]);
		if (numbered) {
			const startNum = numbered.num;
			const items: { content: string; key: number }[] = [];
			while (i < lines.length) {
				const m2 = matchNumberedItem(lines[i]);
				if (!m2) break;
				items.push({ content: m2.content, key: i });
				i++;
			}
			nodes.push(
				m(
					'ol.chat-message__list',
					{ key: `ol-${items[0].key}`, start: startNum },
					items.map((it) =>
						m('li.chat-message__list-item', { key: it.key }, formatText(it.content)),
					),
				),
			);
			continue;
		}
		nodes.push(m('.chat-message__paragraph', { key: i }, formatText(lines[i])));
		i++;
	}

	return nodes;
}

function uidToColor(uid: string): string {
	let hash = 0;
	for (let i = 0; i < uid.length; i++) {
		hash = (hash << 5) - hash + uid.charCodeAt(i);
		hash |= 0;
	}
	const hue = Math.abs(hash) % 360;

	return `hsl(${hue}, 70%, 55%)`;
}

export const ChatMessage: m.Component<ChatMessageAttrs> = {
	view(vnode) {
		const { message, isMine } = vnode.attrs;
		const displayName = message.creator?.displayName || t('common.anonymous');
		const uid = message.creatorId || '';
		const color = uidToColor(uid);
		const initials = getInitials(displayName);

		// Multi-paragraph messages are stored as a parent statement (title) plus
		// paragraph child Statements. The server regenerates `description` from
		// those children — joined with ' | ' — so we split it back to render each
		// paragraph on its own line beneath the title.
		const bodyParagraphs = message.description
			? message.description.split(' | ').filter((s) => s.trim().length > 0)
			: [];

		return m(`.chat-message${isMine ? '.chat-message--mine' : ''}`, [
			!isMine
				? m('.chat-message__header', [
						m('.chat-message__avatar', { style: { background: color } }, initials),
						m('.chat-message__sender', { style: { color } }, displayName),
					])
				: null,
			m('.chat-message__text', linkify(message.statement)),
			bodyParagraphs.length > 0
				? m('.chat-message__body', renderChatBodyParagraphs(bodyParagraphs))
				: null,
			m('.chat-message__time', formatTime(message.createdAt)),
		]);
	},
};
