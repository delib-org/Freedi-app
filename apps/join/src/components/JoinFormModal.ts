import m from 'mithril';
import { translate } from '@/lib/i18n';
import type { JoinFormConfig, JoinFormField } from '@freedi/shared-types';
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
let submitting = false;

/** Pick the field we'll treat as the user's display name — either the field
 *  whose id is exactly "name", or (failing that) the first text field. */
function findNameField(fields: JoinFormField[]): JoinFormField | undefined {
  return fields.find((f) => f.id === 'name') ?? fields.find((f) => f.type === 'text');
}

function getNameValue(fields: JoinFormField[]): string {
  const nameField = findNameField(fields);
  if (!nameField) return '';

  return (formValues[nameField.id] || '').trim();
}

export const JoinFormModal: m.Component<JoinFormModalAttrs> = {
  oninit(vnode) {
    formValues = {};
    submitting = false;

    const fields = vnode.attrs.joinForm.fields ?? [];
    for (const field of fields) {
      formValues[field.id] = '';
    }

    // Prefill the name field with the creator's existing display name so users
    // don't have to retype it.
    const creator = getCreator();
    const nameField = findNameField(fields);
    if (creator?.displayName && nameField) {
      formValues[nameField.id] = creator.displayName;
    }
  },

  view(vnode) {
    const { joinForm, questionId, optionId, role, onClose } = vnode.attrs;
    const fields = joinForm.fields ?? [];
    const canSubmit = !submitting && getNameValue(fields).length > 0;
    // Render the modal chrome in the language the admin saved the form in —
    // otherwise the title/buttons can drift from the stored field labels.
    const formLang = joinForm.formLanguage;
    const tf = (key: string) => translate(key, formLang);

    return m('.modal__overlay', {
      onclick: (e: Event) => {
        if (e.target === e.currentTarget) onClose();
      },
    }, [
      m('.modal__body', [
        m('h2.modal__title', tf('form.title')),

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
          m('button.btn.btn--secondary.btn--small', { onclick: onClose }, tf('form.cancel')),
          m(
            'button.btn.btn--primary.btn--small',
            {
              disabled: !canSubmit,
              onclick: () => handleSubmit(questionId, optionId, role, fields, onClose),
            },
            submitting ? tf('form.submitting') : tf('form.submit'),
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
  fields: JoinFormField[],
  onClose: () => void,
): Promise<void> {
  const creator = getCreator();
  const displayName = getNameValue(fields);
  if (!creator || !displayName) return;

  submitting = true;
  m.redraw();

  try {
    await saveJoinFormSubmission(questionId, creator.uid, displayName, formValues, role);
    await toggleJoining(optionId, questionId, role);
    onClose();
  } catch (err) {
    console.error('[JoinForm] Submission failed:', err);
  } finally {
    submitting = false;
    m.redraw();
  }
}
