import m from 'mithril';
import { t } from '../lib/i18n';
import { ProgressBar } from '../components/ProgressBar';
import {
  loadWizardState,
  saveWizardState,
  createDefaultWizardState,
  estimateTime,
  WizardState,
} from '../lib/deliberation';

export interface WizardAttrs {
  onDone: () => void;
  onBack: () => void;
}

type WizardStep = 'title' | 'structure' | 'limits' | 'seeds' | 'privacy';
const STEPS: WizardStep[] = ['title', 'structure', 'limits', 'seeds', 'privacy'];

export function Wizard(): m.Component<WizardAttrs> {
  let wizard: WizardState = loadWizardState() ?? createDefaultWizardState();
  let step: WizardStep = 'title';
  let seedInput = '';
  let seedType: 'need' | 'solution' = 'need';

  function save(): void {
    saveWizardState(wizard);
  }

  function nextStep(): void {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) {
      step = STEPS[idx + 1];
      m.redraw();
    }
  }

  function prevStep(): void {
    const idx = STEPS.indexOf(step);
    if (idx > 0) {
      step = STEPS[idx - 1];
      m.redraw();
    }
  }

  function stepNumber(): number {
    return STEPS.indexOf(step) + 1;
  }

  // ------- Step renderers -------

  function renderTitle(): m.Vnode {
    return m('.wizard-step', [
      m('h2.wizard-step__heading', t('wizard.title_heading')),
      m('.wizard-step__context', [
        m('span.wizard-step__label', t('wizard.based_on')),
        m('.wizard-step__quote', `"${wizard.challengeText}"`),
      ]),

      m('.form-group', [
        m('label.form-label', t('wizard.suggested_title')),
        m('input.text-input', {
          type: 'text',
          value: wizard.title,
          maxlength: 100,
          oninput: (e: InputEvent) => {
            wizard.title = (e.target as HTMLInputElement).value;
            save();
          },
        }),
        m('.char-count', `${wizard.title.length}/100`),
      ]),

      m('.form-group', [
        m('label.form-label', `${t('wizard.description')} (${t('wizard.optional')})`),
        m('textarea.text-input', {
          value: wizard.description,
          rows: 3,
          maxlength: 300,
          placeholder: t('wizard.description_placeholder'),
          oninput: (e: InputEvent) => {
            wizard.description = (e.target as HTMLTextAreaElement).value;
            save();
          },
        }),
        m('.char-count', `${wizard.description.length}/300`),
      ]),
    ]);
  }

  function renderStructure(): m.Vnode {
    const neitherChecked = !wizard.includeNeeds && !wizard.includeSolutions;

    return m('.wizard-step', [
      m('h2.wizard-step__heading', t('wizard.structure_heading')),
      m('p.wizard-step__desc', t('wizard.structure_desc')),

      m('.checkbox-card-list', [
        m('.checkbox-card', [
          m('label.checkbox-card__label', [
            m('input', {
              type: 'checkbox',
              checked: wizard.includeNeeds,
              onchange: () => {
                wizard.includeNeeds = !wizard.includeNeeds;
                save();
              },
            }),
            m('span.checkbox-card__title', t('wizard.stage_needs')),
          ]),
          m('.checkbox-card__desc', t('wizard.stage_needs_desc')),
        ]),

        m('.checkbox-card', [
          m('label.checkbox-card__label', [
            m('input', {
              type: 'checkbox',
              checked: wizard.includeSolutions,
              onchange: () => {
                wizard.includeSolutions = !wizard.includeSolutions;
                save();
              },
            }),
            m('span.checkbox-card__title', t('wizard.stage_solutions')),
          ]),
          m('.checkbox-card__desc', t('wizard.stage_solutions_desc')),
        ]),

        m('.checkbox-card.checkbox-card--disabled', [
          m('label.checkbox-card__label', [
            m('input', {
              type: 'checkbox',
              checked: true,
              disabled: true,
            }),
            m('span.checkbox-card__title', t('wizard.stage_evaluate')),
          ]),
          m('.checkbox-card__desc', t('wizard.stage_evaluate_desc')),
        ]),
      ]),

      neitherChecked
        ? m('.validation-msg', t('wizard.at_least_one'))
        : null,

      m('.wizard-step__tip', t('wizard.recommended_all')),
    ]);
  }

  function renderLimits(): m.Vnode {
    return m('.wizard-step', [
      m('h2.wizard-step__heading', t('wizard.limits_heading')),

      wizard.includeNeeds
        ? m('.stepper-row', [
            m('.stepper-row__label', t('wizard.needs_per_user')),
            m('.stepper', [
              m('button.stepper__btn', {
                disabled: wizard.maxNeeds <= 1,
                onclick: () => { wizard.maxNeeds = Math.max(1, wizard.maxNeeds - 1); save(); },
              }, '−'),
              m('.stepper__value', wizard.maxNeeds),
              m('button.stepper__btn', {
                disabled: wizard.maxNeeds >= 10,
                onclick: () => { wizard.maxNeeds = Math.min(10, wizard.maxNeeds + 1); save(); },
              }, '+'),
            ]),
          ])
        : null,

      wizard.includeSolutions
        ? m('.stepper-row', [
            m('.stepper-row__label', t('wizard.solutions_per_user')),
            m('.stepper', [
              m('button.stepper__btn', {
                disabled: wizard.maxSolutions <= 1,
                onclick: () => { wizard.maxSolutions = Math.max(1, wizard.maxSolutions - 1); save(); },
              }, '−'),
              m('.stepper__value', wizard.maxSolutions),
              m('button.stepper__btn', {
                disabled: wizard.maxSolutions >= 10,
                onclick: () => { wizard.maxSolutions = Math.min(10, wizard.maxSolutions + 1); save(); },
              }, '+'),
            ]),
          ])
        : null,

      m('.stepper-row', [
        m('.stepper-row__label', t('wizard.evaluations_per_user')),
        m('.stepper', [
          m('button.stepper__btn', {
            disabled: wizard.maxEvaluations <= 3,
            onclick: () => { wizard.maxEvaluations = Math.max(3, wizard.maxEvaluations - 1); save(); },
          }, '−'),
          m('.stepper__value', wizard.maxEvaluations),
          m('button.stepper__btn', {
            disabled: wizard.maxEvaluations >= 30,
            onclick: () => { wizard.maxEvaluations = Math.min(30, wizard.maxEvaluations + 1); save(); },
          }, '+'),
        ]),
      ]),

      m('.time-estimate', [
        m('.time-estimate__icon', '⏱'),
        m('.time-estimate__text', t('wizard.time_estimate', { minutes: estimateTime(wizard) })),
      ]),
    ]);
  }

  function renderSeeds(): m.Vnode {
    const seeds = seedType === 'need' ? wizard.seedNeeds : wizard.seedSolutions;
    const maxSeeds = 10;

    return m('.wizard-step', [
      m('h2.wizard-step__heading', t('wizard.seeds_heading')),
      m('p.wizard-step__desc', t('wizard.seeds_desc')),

      // Tab selector if both enabled
      (wizard.includeNeeds && wizard.includeSolutions)
        ? m('.tab-bar.tab-bar--sm', [
            m('button.tab-bar__tab', {
              class: seedType === 'need' ? 'tab-bar__tab--active' : '',
              onclick: () => { seedType = 'need'; },
            }, t('wizard.seed_needs')),
            m('button.tab-bar__tab', {
              class: seedType === 'solution' ? 'tab-bar__tab--active' : '',
              onclick: () => { seedType = 'solution'; },
            }, t('wizard.seed_solutions')),
          ])
        : null,

      m('.seed-input-row', [
        m('textarea.text-input', {
          value: seedInput,
          rows: 2,
          placeholder: seedType === 'need' ? t('wizard.seed_need_placeholder') : t('wizard.seed_solution_placeholder'),
          maxlength: 200,
          oninput: (e: InputEvent) => {
            seedInput = (e.target as HTMLTextAreaElement).value;
          },
        }),
        m('button.btn.btn--primary.btn--sm', {
          disabled: seedInput.trim().length < 3 || seeds.length >= maxSeeds,
          onclick: () => {
            if (seedInput.trim().length >= 3 && seeds.length < maxSeeds) {
              seeds.push(seedInput.trim());
              seedInput = '';
              save();
            }
          },
        }, t('wizard.add')),
      ]),

      seeds.length > 0
        ? m('.seed-list', seeds.map((text, i) =>
            m('.seed-list__item', [
              m('.seed-list__text', `${i + 1}. "${text}"`),
              m('button.seed-list__remove', {
                'aria-label': t('wizard.remove_seed'),
                onclick: () => {
                  seeds.splice(i, 1);
                  save();
                },
              }, '×'),
            ])
          ))
        : m('.wizard-step__tip', t('wizard.no_seeds_ok')),
    ]);
  }

  function renderPrivacy(): m.Vnode {
    return m('.wizard-step', [
      m('h2.wizard-step__heading', t('wizard.privacy_heading')),

      m('.form-group', [
        m('label.form-label', t('wizard.who_can_participate')),
        m('.radio-card-list', [
          m('label.radio-card', [
            m('input', {
              type: 'radio',
              name: 'access',
              checked: !wizard.requireSignIn,
              onchange: () => { wizard.requireSignIn = false; save(); },
            }),
            m('.radio-card__content', [
              m('.radio-card__title', t('wizard.anyone_with_link')),
            ]),
          ]),
          m('label.radio-card', [
            m('input', {
              type: 'radio',
              name: 'access',
              checked: wizard.requireSignIn,
              onchange: () => { wizard.requireSignIn = true; save(); },
            }),
            m('.radio-card__content', [
              m('.radio-card__title', t('wizard.signed_in_only')),
            ]),
          ]),
        ]),
      ]),

      m('.form-group', [
        m('label.form-label', t('wizard.show_names')),
        m('.radio-card-list', [
          m('label.radio-card', [
            m('input', {
              type: 'radio',
              name: 'anonymous',
              checked: wizard.anonymousContributions,
              onchange: () => { wizard.anonymousContributions = true; save(); },
            }),
            m('.radio-card__content', [
              m('.radio-card__title', t('wizard.anonymous')),
              m('.radio-card__subtitle', t('wizard.recommended')),
            ]),
          ]),
          m('label.radio-card', [
            m('input', {
              type: 'radio',
              name: 'anonymous',
              checked: !wizard.anonymousContributions,
              onchange: () => { wizard.anonymousContributions = false; save(); },
            }),
            m('.radio-card__content', [
              m('.radio-card__title', t('wizard.show_names_option')),
            ]),
          ]),
        ]),
      ]),

      m('.form-group', [
        m('label.form-label', t('wizard.facilitator_name')),
        m('input.text-input', {
          type: 'text',
          value: wizard.facilitatorName,
          placeholder: t('wizard.facilitator_placeholder'),
          maxlength: 50,
          oninput: (e: InputEvent) => {
            wizard.facilitatorName = (e.target as HTMLInputElement).value;
            save();
          },
        }),
        m('.form-hint', t('wizard.facilitator_hint')),
      ]),
    ]);
  }

  // ------- Main view -------

  return {
    view(vnode) {
      const { onDone, onBack } = vnode.attrs;
      const currentStepIdx = STEPS.indexOf(step);
      const isLast = currentStepIdx === STEPS.length - 1;
      const canContinueStructure = wizard.includeNeeds || wizard.includeSolutions;
      const canContinueTitle = wizard.title.trim().length >= 3;

      let canContinue = true;
      if (step === 'title') canContinue = canContinueTitle;
      if (step === 'structure') canContinue = canContinueStructure;

      const stepRenderers: Record<WizardStep, () => m.Vnode> = {
        title: renderTitle,
        structure: renderStructure,
        limits: renderLimits,
        seeds: renderSeeds,
        privacy: renderPrivacy,
      };

      return m('.shell', [
        m('.shell__header', [
          m('.wizard-header', [
            m('button.btn.btn--ghost.btn--sm', {
              onclick: () => {
                if (currentStepIdx === 0) {
                  onBack();
                } else {
                  prevStep();
                }
              },
            }, t('create.back')),
            m('.wizard-header__progress', [
              m(ProgressBar, {
                current: stepNumber(),
                total: STEPS.length,
                label: t('wizard.step_of', { current: stepNumber(), total: STEPS.length }),
              }),
            ]),
          ]),
        ]),

        m('.shell__content', { style: { gap: 'var(--space-md)' } }, [
          stepRenderers[step](),
        ]),

        m('.shell__footer', [
          step === 'seeds'
            ? m('.wizard-footer--dual', [
                m('button.btn.btn--ghost.btn--full', {
                  onclick: nextStep,
                }, t('wizard.skip_step')),
                m('button.btn.btn--primary.btn--full', {
                  onclick: nextStep,
                }, t('common.continue')),
              ])
            : m('button.btn.btn--primary.btn--full', {
                disabled: !canContinue,
                onclick: () => {
                  save();
                  if (isLast) {
                    onDone();
                  } else {
                    nextStep();
                  }
                },
              }, isLast ? t('wizard.review_launch') : t('common.continue')),
        ]),
      ]);
    },
  };
}
