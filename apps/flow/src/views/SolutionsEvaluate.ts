import m from 'mithril';
import { EvaluationCard } from '../components/EvaluationCard';
import { ProgressBar } from '../components/ProgressBar';
import {
  loadStatements,
  submitEvaluation,
  submitComment,
  submitSuggestion,
  StatementData,
  SessionState,
  saveSession,
} from '../lib/deliberation';
import { getUserState } from '../lib/user';
import { t } from '../lib/i18n';

export interface SolutionsEvaluateAttrs {
  questionId: string;
  session: SessionState;
  maxEvaluations: number;
  onDone: () => void;
}

export function SolutionsEvaluate(initialVnode: m.Vnode<SolutionsEvaluateAttrs>): m.Component<SolutionsEvaluateAttrs> {
  let statements: StatementData[] = [];
  let currentIndex = 0;
  let currentRating: number | null = null;
  let loading = true;
  let showDisagreePrompt = false;
  let commentModalOpen = false;
  let suggestModalOpen = false;
  let commentText = '';
  let suggestText = '';
  let suggestReason = '';
  let submittingComment = false;
  let submittingSuggestion = false;

  loadStatements(initialVnode.attrs.questionId).then((result) => {
    const { user } = getUserState();
    statements = result.filter((s) => s.creatorId !== user?.uid);
    loading = false;
    m.redraw();
  });

  async function advanceCard(session: SessionState, current: StatementData): Promise<void> {
    try {
      if (currentRating !== null) {
        await submitEvaluation(current.statementId, current.parentId, currentRating);
        session.solutionsEvaluated++;
        saveSession(session);
      }
    } catch (error) {
      console.error('[SolutionsEvaluate] Submit failed:', error);
    }

    currentIndex++;
    currentRating = null;
    showDisagreePrompt = false;
    m.redraw();
  }

  return {
    view(vnode) {
      const { session, maxEvaluations, onDone } = vnode.attrs;

      if (loading) {
        return m('.shell', m('.shell__content.text-center', t('common.loading')));
      }

      const totalToEval = Math.min(statements.length, maxEvaluations);

      if (totalToEval === 0 || currentIndex >= totalToEval) {
        return m('.shell', [
          m('.shell__content', { style: { justifyContent: 'center', textAlign: 'center', gap: 'var(--space-lg)' } }, [
            m('h2', t('solutions.eval_done')),
            m('p', { style: { color: 'var(--text-secondary)' } },
              t('solutions.eval_count', { count: currentIndex })),
          ]),
          m('.shell__footer', [
            m('button.btn.btn--primary', { onclick: onDone }, t('solutions.see_results')),
          ]),
        ]);
      }

      const current = statements[currentIndex];

      return m('.shell', [
        m('.shell__header', [
          m(ProgressBar, {
            current: currentIndex,
            total: totalToEval,
            label: t('solutions.eval_label'),
          }),
        ]),

        m('.shell__content', { style: { justifyContent: 'center' } }, [
          m('h2', {
            style: {
              fontSize: 'var(--font-size-lg)',
              textAlign: 'center',
              color: 'var(--text-secondary)',
              marginBottom: 'var(--space-md)',
            },
          }, t('solutions.eval_title')),

          m(EvaluationCard, {
            text: current.statement,
            currentIndex,
            totalCount: totalToEval,
            ratingValue: currentRating,
            showActions: true,
            onRate: async (value: number) => {
              currentRating = value;

              if (value < 0) {
                showDisagreePrompt = true;
                m.redraw();
                setTimeout(() => { advanceCard(session, current); }, 2000);
                return;
              }

              m.redraw();

              try {
                await submitEvaluation(current.statementId, current.parentId, value);
                session.solutionsEvaluated++;
                saveSession(session);
                setTimeout(() => { advanceCard(session, current); }, 400);
              } catch (error) {
                console.error('[SolutionsEvaluate] Submit failed:', error);
              }
            },
            onComment: () => { commentModalOpen = true; commentText = ''; },
            onSuggestImprovement: () => { suggestModalOpen = true; suggestText = ''; suggestReason = ''; },
          }),

          showDisagreePrompt
            ? m('.card', {
                style: { marginTop: 'var(--space-md)', background: 'var(--bg-card-hover)', textAlign: 'center' },
              }, [
                m('p.card__text', t('eval.disagree_prompt')),
                m('button.btn.btn--secondary', {
                  style: { marginTop: 'var(--space-sm)' },
                  onclick: () => { suggestModalOpen = true; suggestText = ''; suggestReason = ''; showDisagreePrompt = false; },
                }, t('eval.suggest_improvement')),
              ])
            : null,

          // Comment modal
          commentModalOpen
            ? m('.modal', {
                role: 'dialog',
                'aria-label': t('eval.comment_title'),
                onclick: (e: Event) => {
                  if ((e.target as HTMLElement).classList.contains('modal')) {
                    commentModalOpen = false;
                  }
                },
              }, [
                m('.modal__content', [
                  m('.modal__header', [
                    m('.modal__title', t('eval.comment_title')),
                    m('button.modal__close', {
                      'aria-label': 'Close',
                      onclick: () => { commentModalOpen = false; },
                    }, '\u00d7'),
                  ]),
                  m('.text-input', [
                    m('textarea.text-input__field', {
                      placeholder: t('eval.comment_placeholder'),
                      style: { minHeight: '80px' },
                      value: commentText,
                      oninput: (e: Event) => { commentText = (e.target as HTMLTextAreaElement).value; },
                    }),
                  ]),
                  m('button.btn.btn--primary', {
                    style: { marginTop: 'var(--space-md)' },
                    disabled: commentText.trim().length < 2 || submittingComment,
                    onclick: async () => {
                      submittingComment = true;
                      m.redraw();
                      try {
                        await submitComment(current.statementId, current.topParentId, commentText.trim());
                        commentModalOpen = false;
                        commentText = '';
                      } catch (error) {
                        console.error('[SolutionsEvaluate] Comment failed:', error);
                      } finally {
                        submittingComment = false;
                        m.redraw();
                      }
                    },
                  }, submittingComment ? t('common.loading') : t('eval.post_comment')),
                ]),
              ])
            : null,

          // Suggest improvement modal
          suggestModalOpen
            ? m('.modal', {
                role: 'dialog',
                'aria-label': t('eval.suggest_title'),
                onclick: (e: Event) => {
                  if ((e.target as HTMLElement).classList.contains('modal')) {
                    suggestModalOpen = false;
                  }
                },
              }, [
                m('.modal__content', [
                  m('.modal__header', [
                    m('.modal__title', t('eval.suggest_title')),
                    m('button.modal__close', {
                      'aria-label': 'Close',
                      onclick: () => { suggestModalOpen = false; },
                    }, '\u00d7'),
                  ]),
                  m('p', { style: { color: 'var(--text-secondary)', marginBottom: 'var(--space-md)' } },
                    `${t('eval.original')} "${current.statement}"`),
                  m('.text-input', [
                    m('textarea.text-input__field', {
                      placeholder: t('eval.improved_placeholder'),
                      style: { minHeight: '80px' },
                      value: suggestText,
                      oninput: (e: Event) => { suggestText = (e.target as HTMLTextAreaElement).value; },
                    }),
                  ]),
                  m('.text-input', { style: { marginTop: 'var(--space-sm)' } }, [
                    m('textarea.text-input__field', {
                      placeholder: t('eval.reason_placeholder'),
                      style: { minHeight: '60px' },
                      value: suggestReason,
                      oninput: (e: Event) => { suggestReason = (e.target as HTMLTextAreaElement).value; },
                    }),
                  ]),
                  m('button.btn.btn--primary', {
                    style: { marginTop: 'var(--space-md)' },
                    disabled: suggestText.trim().length < 3 || submittingSuggestion,
                    onclick: async () => {
                      submittingSuggestion = true;
                      m.redraw();
                      try {
                        await submitSuggestion(
                          current.statementId,
                          current.topParentId,
                          suggestText.trim(),
                          suggestReason.trim(),
                        );
                        suggestModalOpen = false;
                        suggestText = '';
                        suggestReason = '';
                      } catch (error) {
                        console.error('[SolutionsEvaluate] Suggestion failed:', error);
                      } finally {
                        submittingSuggestion = false;
                        m.redraw();
                      }
                    },
                  }, submittingSuggestion ? t('common.loading') : t('eval.submit_improvement')),
                ]),
              ])
            : null,
        ]),
      ]);
    },
  };
}
