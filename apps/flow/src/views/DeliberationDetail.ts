import m from 'mithril';
import { t } from '../lib/i18n';
import {
  loadDeliberation,
  loadStatements,
  Deliberation,
  StatementData,
} from '../lib/deliberation';

export interface DeliberationDetailAttrs {
  deliberationId: string;
}

export function DeliberationDetail(): m.Component<DeliberationDetailAttrs> {
  let deliberation: Deliberation | null = null;
  let topNeeds: StatementData[] = [];
  let topSolutions: StatementData[] = [];
  let loading = true;

  async function loadData(id: string): Promise<void> {
    try {
      deliberation = await loadDeliberation(id);
      if (!deliberation) {
        loading = false;
        m.redraw();
        return;
      }

      const [needs, solutions] = await Promise.all([
        loadStatements(deliberation.needsQuestionId),
        loadStatements(deliberation.solutionsQuestionId),
      ]);

      // Sort by consensus descending
      topNeeds = needs.sort((a, b) => (b.consensus ?? 0) - (a.consensus ?? 0)).slice(0, 5);
      topSolutions = solutions.sort((a, b) => (b.consensus ?? 0) - (a.consensus ?? 0)).slice(0, 5);
    } catch (err: unknown) {
      console.error('[DeliberationDetail] Load failed:', err);
    }

    loading = false;
    m.redraw();
  }

  function getShareUrl(id: string): string {
    return `${window.location.origin}/#!/d/${id}`;
  }

  let copied = false;
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;

  async function copyLink(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      copied = true;
      m.redraw();
      if (copyTimeout) clearTimeout(copyTimeout);
      copyTimeout = setTimeout(() => { copied = false; m.redraw(); }, 3000);
    } catch (err: unknown) {
      console.error('[Detail] Copy failed:', err);
    }
  }

  return {
    oninit(vnode) {
      loadData(vnode.attrs.deliberationId);
    },

    view(vnode) {
      const { deliberationId } = vnode.attrs;

      if (loading) {
        return m('.shell', m('.shell__content.text-center', { style: { justifyContent: 'center' } }, t('common.loading')));
      }

      if (!deliberation) {
        return m('.shell', m('.shell__content.text-center', { style: { justifyContent: 'center' } }, t('common.deliberation_not_found')));
      }

      const url = getShareUrl(deliberationId);

      return m('.shell', [
        m('.shell__header', [
          m('button.btn.btn--ghost.btn--sm', {
            onclick: () => m.route.set('/my'),
          }, t('dashboard.back_to_dashboard')),
        ]),

        m('.shell__content', { style: { gap: 'var(--space-md)' } }, [
          m('h1.detail-title', deliberation.title),

          // Stats row
          m('.stats-row', [
            m('.stat', [
              m('.stat__value', String(deliberation.participantCount)),
              m('.stat__label', t('dashboard.joined')),
            ]),
            m('.stat', [
              m('.stat__value', String(topNeeds.length)),
              m('.stat__label', t('intro.needs')),
            ]),
            m('.stat', [
              m('.stat__value', String(topSolutions.length)),
              m('.stat__label', t('intro.solutions')),
            ]),
          ]),

          // Action bar
          m('.action-bar', [
            m('button.btn.btn--primary.btn--sm', {
              onclick: () => m.route.set(`/create/share/${deliberationId}`),
            }, t('dashboard.share')),
            m('button.btn.btn--secondary.btn--sm', {
              onclick: () => copyLink(url),
            }, copied ? t('share.copied') : t('share.copy')),
          ]),

          // Top needs
          topNeeds.length > 0
            ? m('.detail-section', [
                m('h2.detail-section__title', t('state.top_needs')),
                ...topNeeds.map((need, i) =>
                  m('.ranked-item', [
                    m('.ranked-item__rank', `${i + 1}`),
                    m('.ranked-item__text', need.statement),
                    m('.ranked-item__score', t('state.consensus', { percent: Math.round((need.consensus ?? 0) * 100) })),
                  ])
                ),
              ])
            : null,

          // Top solutions
          topSolutions.length > 0
            ? m('.detail-section', [
                m('h2.detail-section__title', t('state.top_solutions')),
                ...topSolutions.map((sol, i) =>
                  m('.ranked-item', [
                    m('.ranked-item__rank', `${i + 1}`),
                    m('.ranked-item__text', sol.statement),
                    m('.ranked-item__score', t('state.consensus', { percent: Math.round((sol.consensus ?? 0) * 100) })),
                  ])
                ),
              ])
            : null,
        ]),
      ]);
    },
  };
}
