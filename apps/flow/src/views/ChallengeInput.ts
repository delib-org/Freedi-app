import m from 'mithril';
import { t } from '../lib/i18n';
import {
  loadWizardState,
  saveWizardState,
  createDefaultWizardState,
  WizardState,
} from '../lib/deliberation';

export interface ChallengeInputAttrs {
  onContinue: () => void;
}

export function ChallengeInput(): m.Component<ChallengeInputAttrs> {
  let wizard: WizardState = loadWizardState() ?? createDefaultWizardState();

  const examples = [
    'create.example_budget',
    'create.example_features',
    'create.example_neighborhood',
  ];

  function useExample(key: string): void {
    wizard.challengeText = t(key);
    saveWizardState(wizard);
    m.redraw();
  }

  return {
    view(vnode) {
      const { onContinue } = vnode.attrs;
      const canContinue = wizard.challengeText.trim().length >= 10;

      return m('.shell', [
        m('.shell__header', [
          m(
            'button.btn.btn--ghost.btn--sm',
            { onclick: () => m.route.set('/') },
            t('create.back')
          ),
        ]),

        m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
          m('h1.create-title', t('create.challenge_title')),
          m('p.create-subtitle', t('create.challenge_subtitle')),

          m('.form-group', [
            m('textarea.text-input.text-input--lg', {
              value: wizard.challengeText,
              placeholder: t('create.challenge_placeholder'),
              rows: 4,
              maxlength: 500,
              'aria-label': t('create.challenge_title'),
              oninput: (e: InputEvent) => {
                wizard.challengeText = (e.target as HTMLTextAreaElement).value;
                saveWizardState(wizard);
              },
            }),
            m('.char-count', `${wizard.challengeText.length}/500`),
          ]),

          m('.example-cards', [
            m('.example-cards__label', t('create.examples_label')),
            ...examples.map((key) =>
              m(
                'button.example-card',
                {
                  role: 'button',
                  'aria-label': `${t('create.use_example')}: ${t(key)}`,
                  onclick: () => useExample(key),
                },
                t(key)
              )
            ),
          ]),
        ]),

        m('.shell__footer', [
          m(
            'button.btn.btn--primary.btn--full',
            {
              disabled: !canContinue,
              onclick: () => {
                if (!canContinue) return;
                // Auto-generate title from challenge text
                if (!wizard.title) {
                  wizard.title = autoTitle(wizard.challengeText);
                }
                if (!wizard.description) {
                  wizard.description = wizard.challengeText;
                }
                saveWizardState(wizard);
                onContinue();
              },
            },
            t('common.continue')
          ),
        ]),
      ]);
    },
  };
}

/** Auto-generate a title from raw challenge text */
function autoTitle(text: string): string {
  let title = text.trim();
  // Strip common prefixes
  const prefixes = [
    /^(i want to|we need to|our challenge is|the problem is|we want to)\s+/i,
    /^(אני רוצה|אנחנו צריכים|האתגר שלנו הוא|הבעיה היא)\s+/i,
  ];
  for (const prefix of prefixes) {
    title = title.replace(prefix, '');
  }
  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);
  // Add ? if it reads as a question and doesn't have one
  if (!title.endsWith('?') && /^(how|what|which|where|when|why|should|can|will|do|does|is|are)\s/i.test(title)) {
    title += '?';
  }
  // Truncate
  if (title.length > 100) title = title.slice(0, 97) + '...';
  return title;
}
