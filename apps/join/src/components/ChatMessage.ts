import m from 'mithril';
import { Statement } from '@freedi/shared-types';

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
    const displayName = message.creator?.displayName || 'Anonymous';
    const uid = message.creatorId || '';
    const color = uidToColor(uid);
    const initials = getInitials(displayName);

    return m(
      `.chat-message${isMine ? '.chat-message--mine' : ''}`,
      [
        !isMine
          ? m('.chat-message__header', [
              m(
                '.chat-message__avatar',
                { style: { background: color } },
                initials,
              ),
              m(
                '.chat-message__sender',
                { style: { color } },
                displayName,
              ),
            ])
          : null,
        m('.chat-message__text', message.statement),
        m('.chat-message__time', formatTime(message.createdAt)),
      ],
    );
  },
};
