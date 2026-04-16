import m from 'mithril';
import { t } from '@/lib/i18n';
import type { JoinFormConfig } from '@freedi/shared-types';
import {
  saveJoinFormSubmission,
  toggleJoining,
  getCreator,
  JoinRole,
} from '@/lib/store';

interface JoinFormModalAttrs {
  joinForm: JoinFormConfig;
  questionId: string;
  optionId: string;
  role: JoinRole;
  onClose: () => void;
}

let formValues: Record<string, string> = {};
let displayName = '';
let submitting = false;

export const JoinFormModal: m.Component<JoinFormModalAttrs> = {
  oninit(vnode) {
    formValues = {};
    displayName = '';
    submitting = false;

    const creator = getCreator();
    if (creator) {
      displayName = creator.displayName || '';
    }

    for (const field of vnode.attrs.joinForm.fields ?? []) {
      formValues[field.id] = '';
    }
  },

  view(vnode) {
    const { joinForm, questionId, optionId, role, onClose } = vnode.attrs;
    const fields = joinForm.fields ?? [];

    return m('.modal__overlay', {
      onclick: (e: Event) => {
        if (e.target === e.currentTarget) onClose();
      },
    }, [
      m('.modal__body', [
        m('h2.modal__title', t('form.title')),

        m('.modal__field', [
          m('label.modal__label', { for: 'join-name' }, t('form.your_name')),
          m('input.modal__input', {
            id: 'join-name',
            type: 'text',
            value: displayName,
            required: true,
            oninput: (e: InputEvent) => {
              displayName = (e.target as HTMLInputElement).value;
            },
          }),
        ]),

        fields.map((field) =>
          m('.modal__field', { key: field.id }, [
            m('label.modal__label', { for: `join-${field.id}` },
              `${field.label}${field.required ? ' *' : ''}`),
            m('input.modal__input', {
              id: `join-${field.id}`,
              type: field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text',
              value: formValues[field.id] || '',
              required: field.required,
              oninput: (e: InputEvent) => {
                formValues[field.id] = (e.target as HTMLInputElement).value;
              },
            }),
          ]),
        ),

        m('.modal__actions', [
          m('button.btn.btn--secondary.btn--small', { onclick: onClose }, t('form.cancel')),
          m(
            'button.btn.btn--primary.btn--small',
            {
              disabled: submitting || !displayName.trim(),
              onclick: () => handleSubmit(questionId, optionId, role, onClose),
            },
            submitting ? t('form.submitting') : t('form.submit'),
          ),
        ]),
      ]),
    ]);
  },
};

async function handleSubmit(
  questionId: string,
  optionId: string,
  role: JoinRole,
  onClose: () => void,
): Promise<void> {
  const creator = getCreator();
  if (!creator || !displayName.trim()) return;

  submitting = true;
  m.redraw();

  try {
    await saveJoinFormSubmission(questionId, creator.uid, displayName.trim(), formValues);
    await toggleJoining(optionId, questionId, role);
    onClose();
  } catch (err) {
    console.error('[JoinForm] Submission failed:', err);
  } finally {
    submitting = false;
    m.redraw();
  }
}
