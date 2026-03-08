import m from 'mithril';
import { loadStatements, StatementData, SessionState } from '../lib/deliberation';
import { t } from '../lib/i18n';

export interface CurrentStateAttrs {
  needsQuestionId: string;
  solutionsQuestionId: string;
  session: SessionState;
  onContinue: () => void;
}

export function CurrentState(initialVnode: m.Vnode<CurrentStateAttrs>): m.Component<CurrentStateAttrs> {
  let topNeeds: StatementData[] = [];
  let topSolutions: StatementData[] = [];
  let loading = true;

  Promise.all([
    loadStatements(initialVnode.attrs.needsQuestionId),
    loadStatements(initialVnode.attrs.solutionsQuestionId),
  ]).then(([needs, solutions]) => {
    topNeeds = needs.sort((a, b) => (b.consensus ?? 0) - (a.consensus ?? 0)).slice(0, 5);
    topSolutions = solutions.sort((a, b) => (b.consensus ?? 0) - (a.consensus ?? 0)).slice(0, 5);
    loading = false;
    m.redraw();
  });

  return {
    view(vnode) {
      const { session, onContinue } = vnode.attrs;

      if (loading) {
        return m('.shell', m('.shell__content.text-center', t('common.loading_results')));
      }

      return m('.shell', [
        m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
          m('h2', { style: { textAlign: 'center', fontSize: 'var(--font-size-xl)' } }, t('state.title')),

          m('.impact', [
            impactStat(String(session.needsWritten), t('state.needs')),
            impactStat(String(session.solutionsWritten), t('state.solutions')),
            impactStat(String(session.needsEvaluated + session.solutionsEvaluated), t('state.evaluations')),
          ]),

          m('h3', { style: { fontSize: 'var(--font-size-lg)', marginTop: 'var(--space-md)' } }, t('state.top_needs')),
          m('.ranked-list', topNeeds.map((need, i) => rankedItem(i + 1, need))),

          m('h3', { style: { fontSize: 'var(--font-size-lg)', marginTop: 'var(--space-md)' } }, t('state.top_solutions')),
          m('.ranked-list', topSolutions.map((sol, i) => rankedItem(i + 1, sol))),
        ]),

        m('.shell__footer', [
          m('button.btn.btn--primary', { onclick: onContinue }, t('state.continue')),
        ]),
      ]);
    },
  };
}

function impactStat(number: string, label: string): m.Vnode {
  return m('.impact__stat', [
    m('.impact__number', number),
    m('.impact__label', label),
  ]);
}

function rankedItem(rank: number, statement: StatementData): m.Vnode {
  const consensus = statement.consensus ?? 0;
  return m('.ranked-list__item', [
    m('.ranked-list__rank', String(rank)),
    m('.ranked-list__body', [
      m('.ranked-list__text', statement.statement),
      m('.ranked-list__consensus', t('state.consensus', { percent: Math.round(consensus * 100) })),
      m('.ranked-list__bar', [
        m('.ranked-list__bar-fill', { style: { width: `${Math.round(consensus * 100)}%` } }),
      ]),
    ]),
  ]);
}
