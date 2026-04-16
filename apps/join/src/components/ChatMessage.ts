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

export const ChatMessage: m.Component<ChatMessageAttrs> = {
  view(vnode) {
    const { message, isMine } = vnode.attrs;

    return m(
      `.chat-message${isMine ? '.chat-message--mine' : ''}`,
      [
        !isMine
          ? m(
              '.chat-message__sender',
              message.creator?.displayName || 'Anonymous',
            )
          : null,
        m('.chat-message__text', message.statement),
        m('.chat-message__time', formatTime(message.createdAt)),
      ],
    );
  },
};
