import m from 'mithril';
import { t } from '@/lib/i18n';
import { createSuggestion } from '@/lib/store';

interface AddSuggestionModalAttrs {
  onClose: () => void;
  /** When true, the submission goes through the organizer Cloud Function and
   *  carries the organizer badge. When false, it joins the crowd list as a
   *  regular participant suggestion — which admins can opt into when the
   *  question allows participant additions. */
  asOrganizer: boolean;
}

let text = '';
let submitting = false;

export const AddSuggestionModal: m.Component<AddSuggestionModalAttrs> = {
  oninit() {
    text = '';
    submitting = false;
  },

  view(vnode) {
    const { onClose, asOrganizer } = vnode.attrs;
    const canSubmit = !submitting && text.trim().length > 0;
    // Copy follows the chosen mode, not the user's role: an admin posting
    // as a participant gets the neutral crowd-list framing.
    const titleKey = asOrganizer ? 'admin.add_suggestion' : 'solutions.add_suggestion';
    const placeholderKey = asOrganizer
      ? 'admin.suggestion_placeholder'
      : 'solutions.add_suggestion_placeholder';
    const submitKey = asOrganizer ? 'admin.submit' : 'solutions.add_suggestion_submit';

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
                onclick: () => handleSubmit(onClose, asOrganizer),
              },
              submitting ? t('form.submitting') : t(submitKey),
            ),
          ]),
        ]),
      ],
    );
  },
};

async function handleSubmit(onClose: () => void, asOrganizer: boolean): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || submitting) return;

  submitting = true;
  m.redraw();

  try {
    await createSuggestion(trimmed, asOrganizer);
    onClose();
  } catch (err) {
    console.error('[AddSuggestionModal] Submission failed:', err);
  } finally {
    submitting = false;
    m.redraw();
  }
}
