import m from 'mithril';
import { submitStatement, loadStatements, findSimilar, StatementData, SessionState, saveSession } from '../lib/deliberation';
import { ProgressBar } from '../components/ProgressBar';
import { t } from '../lib/i18n';

export interface SolutionsWriteAttrs {
  needsQuestionId: string;
  solutionsQuestionId: string;
  topParentId: string;
  session: SessionState;
  maxSolutions: number;
  onDone: () => void;
}

export function SolutionsWrite(initialVnode: m.Vnode<SolutionsWriteAttrs>): m.Component<SolutionsWriteAttrs> {
  let text = '';
  let submitting = false;
  const submitted: string[] = [];
  let topNeeds: StatementData[] = [];
  let loadingNeeds = true;
  let existingSolutions: StatementData[] = [];
  let similarWarning: { text: string; percent: number } | null = null;

  Promise.all([
    loadStatements(initialVnode.attrs.needsQuestionId),
    loadStatements(initialVnode.attrs.solutionsQuestionId),
  ]).then(([needs, solutions]) => {
    topNeeds = needs
      .sort((a, b) => (b.consensus ?? 0) - (a.consensus ?? 0))
      .slice(0, 3);
    existingSolutions = solutions;
    loadingNeeds = false;
    m.redraw();
  });

  function checkSimilarity(): void {
    if (text.trim().length < 10) {
      similarWarning = null;
      return;
    }
    const matches = findSimilar(text, existingSolutions, 0.4);
    if (matches.length > 0) {
      similarWarning = {
        text: matches[0].statement.statement,
        percent: Math.round(matches[0].similarity * 100),
      };
    } else {
      similarWarning = null;
    }
  }

  async function doSubmit(questionId: string, topParentId: string, session: SessionState): Promise<void> {
    submitting = true;
    m.redraw();
    try {
      await submitStatement(questionId, topParentId, text.trim());
      submitted.push(text.trim());
      text = '';
      similarWarning = null;
      session.solutionsWritten = submitted.length;
      saveSession(session);
    } catch (error) {
      console.error('[SolutionsWrite] Submit failed:', error);
    } finally {
      submitting = false;
      m.redraw();
    }
  }

  return {
    view(vnode) {
      const { solutionsQuestionId, topParentId, session, maxSolutions, onDone } = vnode.attrs;
      const canSubmitMore = submitted.length < maxSolutions;

      return m('.shell', [
        m('.shell__header', [
          m(ProgressBar, {
            current: submitted.length,
            total: maxSolutions,
            label: `${submitted.length} ${t('needs.of')} ${maxSolutions}`,
          }),
        ]),

        m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
          m('h2', {
            style: { fontSize: 'var(--font-size-xl)', textAlign: 'center' },
          }, t('solutions.title')),

          m('p', {
            style: { color: 'var(--text-secondary)', textAlign: 'center' },
          }, t('solutions.subtitle')),

          !loadingNeeds && topNeeds.length > 0
            ? m('.card', { style: { background: 'var(--bg-card-hover)' } }, [
                m('.card__title', { style: { fontSize: 'var(--font-size-sm)' } }, t('solutions.top_needs')),
                ...topNeeds.map((need, i) =>
                  m('p.card__text', {
                    style: { fontSize: 'var(--font-size-sm)', marginTop: 'var(--space-xs)' },
                  }, `${i + 1}. ${need.statement}`)
                ),
              ])
            : null,

          m('.text-input', [
            m('textarea.text-input__field', {
              placeholder: t('solutions.placeholder'),
              value: text,
              disabled: submitting || !canSubmitMore,
              oninput: (e: Event) => {
                text = (e.target as HTMLTextAreaElement).value;
                checkSimilarity();
              },
            }),
            m('.text-input__counter', `${text.length} / 500`),
          ]),

          // Similarity warning
          similarWarning
            ? m('.similarity-warning', [
                m('.similarity-warning__title', t('similarity.title')),
                m('.similarity-warning__text',
                  t('similarity.message', { percent: similarWarning.percent })),
                m('p.similarity-warning__match', `"${similarWarning.text}"`),
                m('.similarity-warning__actions', [
                  m('button.btn.btn--secondary', {
                    style: { flex: 1 },
                    onclick: () => { similarWarning = null; },
                  }, t('similarity.edit')),
                  m('button.btn.btn--primary', {
                    style: { flex: 1 },
                    disabled: text.trim().length < 3 || submitting,
                    onclick: () => doSubmit(solutionsQuestionId, topParentId, session),
                  }, t('similarity.submit_anyway')),
                ]),
              ])
            : canSubmitMore
              ? m('button.btn.btn--primary', {
                  disabled: text.trim().length < 3 || submitting,
                  onclick: () => {
                    if (similarWarning) return;
                    checkSimilarity();
                    if (similarWarning) { m.redraw(); return; }
                    doSubmit(solutionsQuestionId, topParentId, session);
                  },
                }, submitting ? t('solutions.submitting') : t('solutions.submit'))
              : null,

          submitted.length > 0
            ? m('.card', [
                m('.card__title', t('solutions.your_solutions')),
                ...submitted.map((txt, i) =>
                  m('p.card__text', { style: { marginTop: 'var(--space-sm)' } }, `${i + 1}. ${txt}`)
                ),
              ])
            : null,
        ]),

        m('.shell__footer', [
          submitted.length > 0
            ? m('button.btn.btn--primary', { onclick: onDone },
                canSubmitMore ? t('needs.continue') : t('common.continue'))
            : null,
        ]),
      ]);
    },
  };
}
