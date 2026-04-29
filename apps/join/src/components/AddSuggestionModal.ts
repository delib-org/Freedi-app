import m from 'mithril';
import { t } from '@/lib/i18n';
import { createSuggestion } from '@/lib/store';
import { isAdmin } from '@/lib/admin';

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
    // Admin gets the "organizer suggestion" framing (their option will carry
    // the organizer badge). Everyone else sees neutral "Add option" copy
    // because their submission joins the regular crowd list.
    const adminMode = isAdmin();
    const titleKey = adminMode ? 'admin.add_suggestion' : 'solutions.add_suggestion';
    const placeholderKey = adminMode
      ? 'admin.suggestion_placeholder'
      : 'solutions.add_suggestion_placeholder';
    const submitKey = adminMode ? 'admin.submit' : 'solutions.add_suggestion_submit';

    return m(
      '.modal__overlay',
      {
        onclick: (e: Event) => {
          if (e.target === e.currentTarget) onClose();
        },
      },
      [
        m('.modal__body', [
          m('h2.modal__title', t(titleKey)),

          m('.modal__field', [
            m('label.modal__label', { for: 'organizer-suggestion-text' }, t(placeholderKey)),
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
              submitting ? t('form.submitting') : t(submitKey),
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
    await createSuggestion(trimmed);
    onClose();
  } catch (err) {
    console.error('[AddSuggestionModal] Submission failed:', err);
  } finally {
    submitting = false;
    m.redraw();
  }
}
