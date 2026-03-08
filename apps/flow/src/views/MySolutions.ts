import m from 'mithril';
import { loadStatements, loadScoreSnapshot, saveScoreSnapshot, getScoreTrend, StatementData } from '../lib/deliberation';
import { getUserState } from '../lib/user';
import { t } from '../lib/i18n';

export interface MySolutionsAttrs {
  solutionsQuestionId: string;
  deliberationId: string;
}

export function MySolutions(initialVnode: m.Vnode<MySolutionsAttrs>): m.Component<MySolutionsAttrs> {
  let solutions: StatementData[] = [];
  let loading = true;
  let previousScores = loadScoreSnapshot(initialVnode.attrs.solutionsQuestionId);

  loadStatements(initialVnode.attrs.solutionsQuestionId).then((all) => {
    const { user } = getUserState();
    solutions = all.filter((s) => s.creatorId === user?.uid);
    // Save current scores for next visit comparison
    saveScoreSnapshot(initialVnode.attrs.solutionsQuestionId, solutions);
    loading = false;
    m.redraw();
  });

  return {
    view(vnode) {
      const { deliberationId } = vnode.attrs;

      if (loading) {
        return m('.shell', m('.shell__content.text-center', t('common.loading')));
      }

      return m('.shell', [
        m('.shell__header', [
          m('a', { href: `#!/d/${deliberationId}/back`, style: { color: 'var(--color-primary)', textDecoration: 'none' } }, t('back.back')),
        ]),
        m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
          m('h2', t('back.my_solutions')),
          solutions.length === 0
            ? m('.card', m('.card__text', t('back.no_solutions')))
            : m('.ranked-list',
                solutions.map((sol, i) => {
                  const consensus = sol.consensus ?? 0;
                  const trend = getScoreTrend(sol.statementId, consensus, previousScores);

                  return m('.ranked-list__item', [
                    m('.ranked-list__rank', String(i + 1)),
                    m('.ranked-list__body', [
                      m('.ranked-list__text', sol.statement),
                      m('.ranked-list__consensus-row', [
                        m('.ranked-list__consensus', t('state.consensus', { percent: Math.round(consensus * 100) })),
                        trend !== 0
                          ? m('span.score-trend', {
                              class: trend > 0 ? 'score-trend--up' : 'score-trend--down',
                              title: trend > 0
                                ? t('back.score_improved', { delta: Math.round(Math.abs(trend) * 100) })
                                : t('back.score_declined', { delta: Math.round(Math.abs(trend) * 100) }),
                            }, trend > 0 ? `+${Math.round(trend * 100)}%` : `${Math.round(trend * 100)}%`)
                          : previousScores[sol.statementId] === undefined
                            ? m('span.score-trend.score-trend--new', t('back.score_new'))
                            : null,
                      ]),
                      m('.ranked-list__bar', [
                        m('.ranked-list__bar-fill', { style: { width: `${Math.round(consensus * 100)}%` } }),
                      ]),
                    ]),
                  ]);
                })
              ),
        ]),
      ]);
    },
  };
}
