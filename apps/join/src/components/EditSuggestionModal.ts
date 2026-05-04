import m from 'mithril';
import { Statement } from '@freedi/shared-types';
import { t } from '@/lib/i18n';
import { updateSuggestion } from '@/lib/store';

interface EditSuggestionModalAttrs {
  option: Statement;
  onClose: () => void;
}

let text = '';
let submitting = false;
let lastOptionId: string | null = null;

export const EditSuggestionModal: m.Component<EditSuggestionModalAttrs> = {
  oninit(vnode) {
    // Seed the textarea from the option's current title. Tracking the option id
    // lets us reset the field cleanly when reopening on a different card without
    // a stale value from the previous edit session.
    text = vnode.attrs.option.statement ?? '';
    submitting = false;
    lastOptionId = vnode.attrs.option.statementId;
  },

  onupdate(vnode) {
    if (vnode.attrs.option.statementId !== lastOptionId) {
      text = vnode.attrs.option.statement ?? '';
      submitting = false;
      lastOptionId = vnode.attrs.option.statementId;
    }
  },

  view(vnode) {
    const { option, onClose } = vnode.attrs;
    const trimmed = text.trim();
    const unchanged = trimmed === (option.statement ?? '').trim();
    const canSubmit = !submitting && trimmed.length > 0 && !unchanged;

    return m(
      '.modal__overlay',
      {
        onclick: (e: Event) => {
          if (e.target === e.currentTarget) onClose();
        },
      },
      [
        m('.modal__body', [
          m('h2.modal__title', t('solutions.edit_suggestion')),

          m('.modal__field', [
            m(
              'label.modal__label',
              { for: 'edit-suggestion-text' },
              t('solutions.edit_suggestion_placeholder'),
            ),
            m('textarea.modal__input', {
              id: 'edit-suggestion-text',
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
                onclick: () => handleSubmit(option.statementId, onClose),
              },
              submitting ? t('form.submitting') : t('solutions.edit_suggestion_submit'),
            ),
          ]),
        ]),
      ],
    );
  },
};

async function handleSubmit(optionId: string, onClose: () => void): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed || submitting) return;

  submitting = true;
  m.redraw();

  try {
    await updateSuggestion(optionId, trimmed);
    onClose();
  } catch (err) {
    console.error('[EditSuggestionModal] Update failed:', err);
  } finally {
    submitting = false;
    m.redraw();
  }
}
