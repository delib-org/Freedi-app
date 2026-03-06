import m from 'mithril';
import { loadStatements, findSimilar, submitStatement, textSimilarity, StatementData } from '../lib/deliberation';
import { getUserState } from '../lib/user';
import { t } from '../lib/i18n';

export interface SearchSolutionsAttrs {
  solutionsQuestionId: string;
  deliberationId: string;
}

export function SearchSolutions(initialVnode: m.Vnode<SearchSolutionsAttrs>): m.Component<SearchSolutionsAttrs> {
  let mySolutions: StatementData[] = [];
  let allSolutions: StatementData[] = [];
  let loading = true;
  let searchQuery = '';
  let results: Array<{ statement: StatementData; similarity: number }> = [];

  // Merge proposal state
  let mergeOpen = false;
  let mergeA: StatementData | null = null;
  let mergeB: StatementData | null = null;
  let mergedText = '';
  let submittingMerge = false;

  loadStatements(initialVnode.attrs.solutionsQuestionId).then((all) => {
    const { user } = getUserState();
    allSolutions = all;
    mySolutions = all.filter((s) => s.creatorId === user?.uid);
    loading = false;
    m.redraw();
  });

  function doSearch(): void {
    const q = searchQuery.trim();
    if (q.length < 2) {
      results = [];
      return;
    }
    // Use similarity search instead of plain substring
    results = findSimilar(q, allSolutions, 0.15)
      .slice(0, 20);

    // Also include substring matches that similarity might miss
    const similarIds = new Set(results.map((r) => r.statement.statementId));
    const substringMatches = allSolutions
      .filter((s) => !similarIds.has(s.statementId) && s.statement.toLowerCase().includes(q.toLowerCase()))
      .map((s) => ({ statement: s, similarity: textSimilarity(q, s.statement) }));

    results = [...results, ...substringMatches].sort((a, b) => b.similarity - a.similarity);
  }

  function openMerge(a: StatementData, b: StatementData): void {
    mergeA = a;
    mergeB = b;
    // Simple merge: combine both texts
    mergedText = `${a.statement} + ${b.statement}`;
    mergeOpen = true;
  }

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
          m('h2', t('back.search')),

          m('.text-input', [
            m('input.text-input__field', {
              type: 'text',
              placeholder: t('back.search_placeholder'),
              style: { minHeight: 'auto', height: '48px' },
              value: searchQuery,
              oninput: (e: Event) => {
                searchQuery = (e.target as HTMLInputElement).value;
                doSearch();
              },
            }),
          ]),

          results.length > 0
            ? [
                m('h3', { style: { fontSize: 'var(--font-size-lg)' } },
                  t('back.matches', { count: results.length })),
                m('.ranked-list',
                  results.map((item, i) => {
                    const consensus = item.statement.consensus ?? 0;
                    const simPercent = Math.round(item.similarity * 100);

                    return m('.ranked-list__item', [
                      m('.ranked-list__rank', String(i + 1)),
                      m('.ranked-list__body', [
                        m('.ranked-list__text', item.statement.statement),
                        m('.ranked-list__consensus-row', [
                          m('.ranked-list__consensus',
                            t('state.consensus', { percent: Math.round(consensus * 100) })),
                          simPercent > 0
                            ? m('span.similarity-badge',
                                t('back.similarity', { percent: simPercent }))
                            : null,
                        ]),
                      ]),
                    ]);
                  })
                ),
              ]
            : searchQuery.length >= 2
              ? m('.card', m('.card__text', t('back.no_matches')))
              : null,

          // My solutions with "find similar" + merge
          mySolutions.length > 0
            ? [
                m('h3', { style: { fontSize: 'var(--font-size-lg)', marginTop: 'var(--space-md)' } },
                  t('back.your_solutions')),
                m('.ranked-list',
                  mySolutions.map((sol, i) => {
                    const similar = findSimilar(sol.statement, allSolutions.filter((s) => s.statementId !== sol.statementId), 0.25);
                    const topMatch = similar[0];

                    return m('.ranked-list__item', [
                      m('.ranked-list__rank', String(i + 1)),
                      m('.ranked-list__body', [
                        m('.ranked-list__text', sol.statement),
                        topMatch
                          ? m('.ranked-list__similar', [
                              m('span.similarity-badge',
                                t('back.similarity', { percent: Math.round(topMatch.similarity * 100) })),
                              m('span', { style: { color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' } },
                                ` "${topMatch.statement.statement.slice(0, 60)}..."`),
                              m('button.btn.btn--ghost', {
                                style: { fontSize: 'var(--font-size-xs)', padding: 'var(--space-xs)' },
                                onclick: () => openMerge(sol, topMatch.statement),
                              }, t('back.merge_btn')),
                            ])
                          : null,
                      ]),
                    ]);
                  })
                ),
              ]
            : null,

          // Merge proposal modal
          mergeOpen && mergeA && mergeB
            ? m('.modal', {
                role: 'dialog',
                'aria-label': t('back.merge_title'),
                onclick: (e: Event) => {
                  if ((e.target as HTMLElement).classList.contains('modal')) {
                    mergeOpen = false;
                  }
                },
              }, [
                m('.modal__content', [
                  m('.modal__header', [
                    m('.modal__title', t('back.merge_title')),
                    m('button.modal__close', {
                      'aria-label': 'Close',
                      onclick: () => { mergeOpen = false; },
                    }, '\u00d7'),
                  ]),
                  m('p', { style: { color: 'var(--text-secondary)', marginBottom: 'var(--space-sm)', fontSize: 'var(--font-size-sm)' } },
                    t('back.merge_desc')),

                  m('.merge-preview', [
                    m('.merge-preview__item', [
                      m('.merge-preview__label', t('back.merge_yours')),
                      m('.merge-preview__text', mergeA.statement),
                    ]),
                    m('.merge-preview__plus', '+'),
                    m('.merge-preview__item', [
                      m('.merge-preview__label', t('back.merge_theirs')),
                      m('.merge-preview__text', mergeB.statement),
                    ]),
                    m('.merge-preview__equals', '='),
                  ]),

                  m('p', { style: { fontWeight: 'var(--font-weight-medium)', marginTop: 'var(--space-md)' } },
                    t('back.merge_result')),
                  m('.text-input', [
                    m('textarea.text-input__field', {
                      style: { minHeight: '100px' },
                      value: mergedText,
                      oninput: (e: Event) => { mergedText = (e.target as HTMLTextAreaElement).value; },
                    }),
                  ]),

                  m('button.btn.btn--primary', {
                    style: { marginTop: 'var(--space-md)' },
                    disabled: mergedText.trim().length < 5 || submittingMerge,
                    onclick: async () => {
                      submittingMerge = true;
                      m.redraw();
                      try {
                        await submitStatement(
                          solutionsQuestionId,
                          mergeA!.topParentId,
                          mergedText.trim(),
                        );
                        mergeOpen = false;
                        mergedText = '';
                        // Refresh solutions
                        const all = await loadStatements(solutionsQuestionId);
                        const { user } = getUserState();
                        allSolutions = all;
                        mySolutions = all.filter((s) => s.creatorId === user?.uid);
                      } catch (error) {
                        console.error('[SearchSolutions] Merge submit failed:', error);
                      } finally {
                        submittingMerge = false;
                        m.redraw();
                      }
                    },
                  }, submittingMerge ? t('common.loading') : t('back.merge_submit')),
                ]),
              ])
            : null,
        ]),
      ]);
    },
  };
}
