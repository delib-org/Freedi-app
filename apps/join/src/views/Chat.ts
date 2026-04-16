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
} from '@/lib/store';
import { generateTemporalName } from '@/lib/nameGenerator';
import { t } from '@/lib/i18n';
import { db, doc, getDoc } from '@/lib/firebase';
import { Collections, Statement } from '@freedi/shared-types';
import { getUserState } from '@/lib/user';
import { ChatMessage } from '@/components/ChatMessage';

let option: Statement | null = null;
let loading = true;
let messageText = '';
let sending = false;
let messagesEl: HTMLElement | null = null;
let showNamePrompt = false;
let closingNamePrompt = false;
let nameInput = '';

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

export const Chat: m.Component = {
  async oninit() {
    loading = true;
    option = null;
    messageText = '';
    showNamePrompt = false;
    closingNamePrompt = false;
    nameInput = getCustomDisplayName() || '';
    isAtBottom = true;
    newMessageCount = 0;
    prevMessageCount = 0;

    const optionId = m.route.param('sid');
    if (!optionId) {
      loading = false;
      m.redraw();

      return;
    }

    try {
      const optionDoc = await getDoc(doc(db, Collections.statements, optionId));
      if (optionDoc.exists()) {
        option = optionDoc.data() as Statement;
      }
      subscribeChat(optionId);
      markOptionRead(optionId);
    } catch (err) {
      console.error('[Chat] Failed to load option:', err);
    } finally {
      loading = false;
      m.redraw();
    }
  },

  onremove() {
    unsubscribeChat();
    option = null;
    messagesEl = null;
  },

  view() {
    const questionId = m.route.param('qid');
    const user = getUserState().user;
    const msgs = getMessages();

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
      return m('.chat', m('.chat__empty', t('chat.loading')));
    }

    if (!option) {
      return m('.chat', m('.chat__empty', t('chat.not_found')));
    }

    return m('.chat', [
      m('.chat__header', [
        m(
          'button.chat__back',
          {
            onclick: () => m.route.set('/q/:qid', { qid: questionId }),
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
                  messagesEl.addEventListener('scroll', () => {
                    checkIfAtBottom();
                    if (isAtBottom && newMessageCount > 0) {
                      newMessageCount = 0;
                      m.redraw();
                    }
                  }, { passive: true });
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
                    m('span', t(newMessageCount > 1 ? 'chat.new_messages' : 'chat.new_message', { count: newMessageCount })),
                    m('span', ' \u2193'),
                  ],
                )
              : null,
          ]),

      showNamePrompt
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
                onfocus: () => {
                  if (needsDisplayName()) {
                    showNamePrompt = true;
                    m.redraw();
                  }
                },
                oninput: (e: InputEvent) => {
                  messageText = (e.target as HTMLTextAreaElement).value;
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
    ]);
  },
};

function confirmName(): void {
  if (!nameInput.trim()) return;
  setCustomDisplayName(nameInput.trim());
  closeNamePrompt();
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
