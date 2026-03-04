import m from 'mithril';
import { loadStatements, submitEvaluation, StatementData } from '../lib/deliberation';
import { RatingButtons } from '../components/RatingButtons';
import { t } from '../lib/i18n';

export interface TopSolutionsAttrs {
  solutionsQuestionId: string;
  deliberationId: string;
}

export function TopSolutions(initialVnode: m.Vnode<TopSolutionsAttrs>): m.Component<TopSolutionsAttrs> {
  let solutions: StatementData[] = [];
  let loading = true;
  const ratings: Record<string, number | null> = {};

  loadStatements(initialVnode.attrs.solutionsQuestionId).then((all) => {
    solutions = all.sort((a, b) => (b.consensus ?? 0) - (a.consensus ?? 0)).slice(0, 10);
    loading = false;
    m.redraw();
  });

  return {
    view(vnode) {
      const { deliberationId, solutionsQuestionId } = vnode.attrs;

      if (loading) {
        return m('.shell', m('.shell__content.text-center', t('common.loading')));
      }

      return m('.shell', [
        m('.shell__header', [
          m('a', { href: `#!/d/${deliberationId}/back`, style: { color: 'var(--color-primary)', textDecoration: 'none' } }, t('back.back')),
        ]),
        m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
          m('h2', t('back.top_solutions')),
          m('p', { style: { color: 'var(--text-secondary)' } }, t('back.top_desc')),

          solutions.length === 0
            ? m('.card', m('.card__text', t('back.no_solutions_yet')))
            : m('.ranked-list',
                solutions.map((sol, i) => {
                  const consensus = sol.consensus ?? 0;
                  const ratingKey = sol.statementId;

                  return m('.ranked-list__item.ranked-list__item--interactive', { key: ratingKey }, [
                    m('.ranked-list__rank', String(i + 1)),
                    m('.ranked-list__body', [
                      m('.ranked-list__text', sol.statement),
                      m('.ranked-list__consensus', t('state.consensus', { percent: Math.round(consensus * 100) })),
                      m('.ranked-list__bar', [
                        m('.ranked-list__bar-fill', { style: { width: `${Math.round(consensus * 100)}%` } }),
                      ]),
                      // Inline rating
                      m('.ranked-list__inline-rating', [
                        m(RatingButtons, {
                          value: ratings[ratingKey] ?? null,
                          onRate: async (value: number) => {
                            ratings[ratingKey] = value;
                            m.redraw();
                            try {
                              await submitEvaluation(sol.statementId, solutionsQuestionId, value);
                            } catch (error) {
                              console.error('[TopSolutions] Rating failed:', error);
                            }
                          },
                        }),
                      ]),
                    ]),
                  ]);
                })
              ),

          // AI Summary section
          m('.card', { style: { marginTop: 'var(--space-md)' } }, [
            m('.card__title', t('back.ai_summary')),
            m('.card__text', { style: { fontStyle: 'italic' } }, t('back.ai_coming_soon')),
          ]),
        ]),
      ]);
    },
  };
}
