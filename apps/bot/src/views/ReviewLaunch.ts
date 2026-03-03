import m from 'mithril';
import { t } from '../lib/i18n';
import {
  loadWizardState,
  createDeliberation,
  estimateTime,
  WizardState,
} from '../lib/deliberation';
import { ensureUser, getUserState, upgradeToGoogle } from '../lib/user';

export interface ReviewLaunchAttrs {
  onLaunched: (deliberationId: string) => void;
  onEditStep: (step: string) => void;
}

export function ReviewLaunch(): m.Component<ReviewLaunchAttrs> {
  let wizard: WizardState | null = loadWizardState();
  let launching = false;
  let error = '';
  let showAuthPrompt = false;

  async function launch(onLaunched: (id: string) => void): Promise<void> {
    if (!wizard || launching) return;
    launching = true;
    error = '';
    m.redraw();

    try {
      await ensureUser();
      const id = await createDeliberation(wizard);
      onLaunched(id);
    } catch (err: unknown) {
      console.error('[ReviewLaunch] Creation failed:', err);
      error = t('create.launch_failed');
      launching = false;
      m.redraw();
    }
  }

  return {
    view(vnode) {
      const { onLaunched, onEditStep } = vnode.attrs;

      if (!wizard) {
        return m('.shell', m('.shell__content.text-center', t('create.no_wizard_data')));
      }

      const { tier } = getUserState();
      const time = estimateTime(wizard);

      const stages: string[] = [];
      if (wizard.includeNeeds) stages.push(t('intro.needs'));
      if (wizard.includeSolutions) stages.push(t('intro.solutions'));
      stages.push(t('wizard.stage_evaluate'));
      stages.push(t('intro.results'));

      return m('.shell', [
        m('.shell__header', [
          m('button.btn.btn--ghost.btn--sm', {
            onclick: () => onEditStep('privacy'),
          }, t('create.back_to_editing')),
        ]),

        m('.shell__content', { style: { gap: 'var(--space-md)' } }, [
          m('h1.create-title', t('create.review_title')),

          // Title card
          m('.review-card', [
            m('.review-card__header', [
              m('.review-card__label', t('wizard.title_label')),
              m('button.review-card__edit', {
                onclick: () => onEditStep('title'),
                'aria-label': t('create.edit_title'),
              }, '✎'),
            ]),
            m('.review-card__value', `"${wizard.title}"`),
            wizard.description
              ? m('.review-card__sub', wizard.description)
              : null,
          ]),

          // Structure card
          m('.review-card', [
            m('.review-card__header', [
              m('.review-card__label', t('wizard.structure_label')),
              m('button.review-card__edit', {
                onclick: () => onEditStep('structure'),
                'aria-label': t('create.edit_structure'),
              }, '✎'),
            ]),
            m('.review-card__value', stages.join(' → ')),
          ]),

          // Limits card
          m('.review-card', [
            m('.review-card__header', [
              m('.review-card__label', t('wizard.limits_label')),
              m('button.review-card__edit', {
                onclick: () => onEditStep('limits'),
                'aria-label': t('create.edit_limits'),
              }, '✎'),
            ]),
            m('.review-card__value', [
              wizard.includeNeeds ? `${wizard.maxNeeds} ${t('intro.needs').toLowerCase()}, ` : '',
              wizard.includeSolutions ? `${wizard.maxSolutions} ${t('intro.solutions').toLowerCase()}, ` : '',
              `${wizard.maxEvaluations} ${t('state.evaluations').toLowerCase()}`,
            ].join('')),
            m('.review-card__sub', t('wizard.time_estimate', { minutes: time })),
          ]),

          // Seeds card
          (wizard.seedNeeds.length > 0 || wizard.seedSolutions.length > 0)
            ? m('.review-card', [
                m('.review-card__header', [
                  m('.review-card__label', t('wizard.seeds_label')),
                  m('button.review-card__edit', {
                    onclick: () => onEditStep('seeds'),
                    'aria-label': t('create.edit_seeds'),
                  }, '✎'),
                ]),
                m('.review-card__value',
                  `${wizard.seedNeeds.length + wizard.seedSolutions.length} ${t('wizard.starting_items')}`
                ),
              ])
            : null,

          // Privacy card
          m('.review-card', [
            m('.review-card__header', [
              m('.review-card__label', t('wizard.privacy_label')),
              m('button.review-card__edit', {
                onclick: () => onEditStep('privacy'),
                'aria-label': t('create.edit_privacy'),
              }, '✎'),
            ]),
            m('.review-card__value', [
              wizard.requireSignIn ? t('wizard.signed_in_only') : t('wizard.anyone_with_link'),
              ', ',
              wizard.anonymousContributions ? t('wizard.anonymous') : t('wizard.show_names_option'),
            ].join('')),
          ]),

          error ? m('.error-msg', { role: 'alert' }, error) : null,

          // Auth prompt
          showAuthPrompt && tier === 0
            ? m('.auth-prompt', [
                m('p', t('create.auth_prompt')),
                m('.auth-prompt__actions', [
                  m('button.btn.btn--primary.btn--full', {
                    onclick: async () => {
                      try {
                        await upgradeToGoogle();
                      } catch (err: unknown) {
                        console.error('[ReviewLaunch] Google sign-in failed:', err);
                      }
                    },
                  }, t('signin.google')),
                  m('button.btn.btn--ghost.btn--full', {
                    onclick: () => {
                      showAuthPrompt = false;
                      launch(onLaunched);
                    },
                  }, t('create.continue_as_guest')),
                ]),
              ])
            : null,
        ]),

        m('.shell__footer', [
          !showAuthPrompt
            ? m('button.btn.btn--primary.btn--full.btn--lg', {
                disabled: launching,
                onclick: () => {
                  if (tier === 0) {
                    showAuthPrompt = true;
                    m.redraw();
                  } else {
                    launch(onLaunched);
                  }
                },
              }, launching ? t('create.creating') : t('create.launch'))
            : null,
        ]),
      ]);
    },
  };
}
