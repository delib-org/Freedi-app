import m from 'mithril';
import { EvaluationCard } from '../components/EvaluationCard';
import { ProgressBar } from '../components/ProgressBar';
import {
  loadStatements,
  submitEvaluation,
  StatementData,
  SessionState,
  saveSession,
} from '../lib/deliberation';
import { getUserState } from '../lib/user';
import { t } from '../lib/i18n';

export interface NeedsEvaluateAttrs {
  questionId: string;
  session: SessionState;
  maxEvaluations: number;
  onDone: () => void;
}

export function NeedsEvaluate(initialVnode: m.Vnode<NeedsEvaluateAttrs>): m.Component<NeedsEvaluateAttrs> {
  let statements: StatementData[] = [];
  let currentIndex = 0;
  let currentRating: number | null = null;
  let loading = true;

  loadStatements(initialVnode.attrs.questionId).then((result) => {
    const { user } = getUserState();
    statements = result.filter((s) => s.creatorId !== user?.uid);
    loading = false;
    m.redraw();
  });

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
            m('h2', t('needs.eval_done')),
            m('p', { style: { color: 'var(--text-secondary)' } },
              t('needs.eval_count', { count: currentIndex })),
          ]),
          m('.shell__footer', [
            m('button.btn.btn--primary', { onclick: onDone }, t('common.continue')),
          ]),
        ]);
      }

      const current = statements[currentIndex];

      return m('.shell', [
        m('.shell__header', [
          m(ProgressBar, {
            current: currentIndex,
            total: totalToEval,
            label: t('needs.eval_label'),
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
          }, t('needs.eval_title')),

          m(EvaluationCard, {
            text: current.statement,
            currentIndex,
            totalCount: totalToEval,
            ratingValue: currentRating,
            onRate: async (value: number) => {
              currentRating = value;
              m.redraw();

              try {
                await submitEvaluation(current.statementId, current.parentId, value);
                session.needsEvaluated++;
                saveSession(session);

                setTimeout(() => {
                  currentIndex++;
                  currentRating = null;
                  m.redraw();
                }, 400);
              } catch (error) {
                console.error('[NeedsEvaluate] Submit failed:', error);
              }
            },
            showActions: false,
          }),
        ]),
      ]);
    },
  };
}
