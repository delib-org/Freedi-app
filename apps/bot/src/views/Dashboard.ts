import m from 'mithril';
import { t } from '../lib/i18n';
import {
  loadMyDeliberations,
  getParticipatedIds,
  loadDeliberation,
  loadSession,
  Deliberation,
  SessionState,
} from '../lib/deliberation';
import { getUserState } from '../lib/user';

type Tab = 'created' | 'participated';

interface ParticipatedItem {
  deliberation: Deliberation;
  session: SessionState;
}

export function Dashboard(): m.Component {
  let tab: Tab = 'created';
  let createdDelibs: Deliberation[] = [];
  let participatedItems: ParticipatedItem[] = [];
  let loading = true;

  async function loadData(): Promise<void> {
    loading = true;
    m.redraw();

    try {
      // Load created
      createdDelibs = await loadMyDeliberations();

      // Load participated
      const ids = getParticipatedIds();
      const items: ParticipatedItem[] = [];
      for (const id of ids) {
        const session = loadSession(id);
        if (!session) continue;
        const delib = await loadDeliberation(id);
        if (delib) {
          items.push({ deliberation: delib, session });
        }
      }
      participatedItems = items;
    } catch (err: unknown) {
      console.error('[Dashboard] Load failed:', err);
    }

    loading = false;
    m.redraw();
  }

  function timeAgo(ms: number): string {
    const diff = Date.now() - ms;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return t('dashboard.just_now');
    if (minutes < 60) return t('dashboard.minutes_ago', { count: minutes });
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t('dashboard.hours_ago', { count: hours });
    const days = Math.floor(hours / 24);
    return t('dashboard.days_ago', { count: days });
  }

  return {
    oninit() {
      loadData();
    },

    view() {
      const { user } = getUserState();

      return m('.shell', [
        m('.shell__header', [
          m('.dashboard-header', [
            m('h1.dashboard-header__title', 'Freedi'),
            user && !user.isAnonymous
              ? m('.dashboard-header__avatar', user.displayName?.charAt(0) ?? '?')
              : m('button.btn.btn--ghost.btn--sm', {
                  onclick: () => m.route.set('/'),
                }, t('signin.google')),
          ]),
        ]),

        m('.shell__content', { style: { gap: 'var(--space-md)' } }, [
          // Tab bar
          m('.tab-bar', [
            m('button.tab-bar__tab', {
              class: tab === 'created' ? 'tab-bar__tab--active' : '',
              onclick: () => { tab = 'created'; },
            }, t('dashboard.created')),
            m('button.tab-bar__tab', {
              class: tab === 'participated' ? 'tab-bar__tab--active' : '',
              onclick: () => { tab = 'participated'; },
            }, t('dashboard.participated')),
          ]),

          loading
            ? m('.text-center', t('common.loading'))
            : tab === 'created'
              ? renderCreatedTab()
              : renderParticipatedTab(),
        ]),

        m('.shell__footer', [
          m('button.btn.btn--primary.btn--full', {
            onclick: () => m.route.set('/create'),
          }, t('dashboard.new_deliberation')),
        ]),
      ]);

      function renderCreatedTab(): m.Vnode | m.Vnode[] {
        if (createdDelibs.length === 0) {
          return m('.empty-state', [
            m('.empty-state__text', t('dashboard.no_created')),
            m('button.btn.btn--primary', {
              onclick: () => m.route.set('/create'),
            }, t('dashboard.start_one')),
          ]) as m.Vnode;
        }

        return createdDelibs.map((delib) =>
          m('.delib-card', { key: delib.deliberationId }, [
            m('.delib-card__title', delib.title),
            m('.delib-card__meta', [
              m('span', `${delib.participantCount} ${t('dashboard.participants')}`),
              m('span.delib-card__dot', '·'),
              m('span', timeAgo(delib.createdAt)),
            ]),
            m('.delib-card__actions', [
              m('button.btn.btn--secondary.btn--sm', {
                onclick: () => m.route.set(`/create/share/${delib.deliberationId}`),
              }, t('dashboard.share')),
              m('button.btn.btn--ghost.btn--sm', {
                onclick: () => m.route.set(`/d/${delib.deliberationId}/manage`),
              }, t('dashboard.results')),
            ]),
          ])
        ) as m.Vnode[];
      }

      function renderParticipatedTab(): m.Vnode | m.Vnode[] {
        if (participatedItems.length === 0) {
          return m('.empty-state', [
            m('.empty-state__text', t('dashboard.no_participated')),
          ]) as m.Vnode;
        }

        return participatedItems.map(({ deliberation, session }) =>
          m('.delib-card', { key: deliberation.deliberationId }, [
            m('.delib-card__title', deliberation.title),
            m('.delib-card__meta', [
              m('span', `${session.needsWritten} ${t('intro.needs').toLowerCase()}, ${session.solutionsWritten} ${t('intro.solutions').toLowerCase()}`),
              m('span.delib-card__dot', '·'),
              m('span', timeAgo(session.lastVisit)),
            ]),
            m('.delib-card__actions', [
              m('button.btn.btn--primary.btn--sm', {
                onclick: () => m.route.set(`/d/${deliberation.deliberationId}/back`),
              }, t('dashboard.go_back')),
            ]),
          ])
        ) as m.Vnode[];
      }
    },
  };
}
