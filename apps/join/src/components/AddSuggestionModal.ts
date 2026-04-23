import m from 'mithril';
import { t } from '@/lib/i18n';
import { createOrganizerSuggestion } from '@/lib/store';

interface AddSuggestionModalAttrs {
  onClose: () => void;
}

let text = '';
let submitting = false;

export const AddSuggestionModal: m.Component<AddSuggestionModalAttrs> = {
  oninit() {
    text = '';
    submitting = false;
  },

  view(vnode) {
    const { onClose } = vnode.attrs;
    const canSubmit = !submitting && text.trim().length > 0;

    return m(
      '.modal__overlay',
      {
        onclick: (e: Event) => {
          if (e.target === e.currentTarget) onClose();
        },
      },
      [
        m('.modal__body', [
          m('h2.modal__title', t('admin.add_suggestion')),

          m('.modal__field', [
            m('label.modal__label', { for: 'organizer-suggestion-text' }, t('admin.suggestion_placeholder')),
            m('textarea.modal__input', {
              id: 'organizer-suggestion-text',
              rows: 4,
              value: text,
              oninput: (e: InputEvent) => {
                text = (e.target as HTMLTextAreaElement).value;
              },
            }),
          ]),

          m('.modal__actions', [
            m('button.btn.btn--secondary.btn--small', { onclick: onClose }, t('form.cancel')),
            m(
              'button.btn.btn--primary.btn--small',
              {
                disabled: !canSubmit,
                onclick: () => handleSubmit(onClose),
              },
              submitting ? t('form.submitting') : t('admin.submit'),
            ),
          ]),
        ]),
      ],
    );
  },
};

async function handleSubmit(onClose: () => void): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || submitting) return;

  submitting = true;
  m.redraw();

  try {
    await createOrganizerSuggestion(trimmed);
    onClose();
  } catch (err) {
    console.error('[AddSuggestionModal] Submission failed:', err);
  } finally {
    submitting = false;
    m.redraw();
  }
}
