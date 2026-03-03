import m from 'mithril';
import { Deliberation, getOfflineQueueCount, syncOfflineQueue } from '../lib/deliberation';
import { t } from '../lib/i18n';

export interface WelcomeBackAttrs {
  deliberation: Deliberation;
  deliberationId: string;
}

export function WelcomeBack(): m.Component<WelcomeBackAttrs> {
  let offlineCount = getOfflineQueueCount();
  let syncing = false;
  let syncedMessage: string | null = null;

  return {
    view(vnode) {
      const { deliberation, deliberationId } = vnode.attrs;
      offlineCount = getOfflineQueueCount();

      return m('.shell', [
        m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
          m('h2', { style: { textAlign: 'center' } }, t('back.welcome')),
          m('p', {
            style: { color: 'var(--text-secondary)', textAlign: 'center' },
          }, deliberation.title),

          // Offline sync indicator
          offlineCount > 0
            ? m('.offline-indicator', [
                m('.offline-indicator__text',
                  syncing
                    ? t('offline.syncing', { count: offlineCount })
                    : t('offline.pending', { count: offlineCount })),
                !syncing
                  ? m('button.btn.btn--secondary', {
                      style: { padding: 'var(--space-xs) var(--space-md)', minHeight: 'auto' },
                      onclick: async () => {
                        syncing = true;
                        m.redraw();
                        try {
                          const count = await syncOfflineQueue();
                          syncedMessage = t('offline.synced', { count });
                          setTimeout(() => { syncedMessage = null; m.redraw(); }, 3000);
                        } catch (error) {
                          console.error('[WelcomeBack] Sync failed:', error);
                        } finally {
                          syncing = false;
                          m.redraw();
                        }
                      },
                    }, 'Sync Now')
                  : null,
              ])
            : null,

          syncedMessage
            ? m('.offline-indicator.offline-indicator--success', syncedMessage)
            : null,

          // Navigation cards
          m('.nav-cards', [
            navCard(
              '💡',
              t('back.my_solutions'),
              t('back.my_solutions_desc'),
              `#!/d/${deliberationId}/back/my`
            ),
            navCard(
              '🏆',
              t('back.top_solutions'),
              t('back.top_solutions_desc'),
              `#!/d/${deliberationId}/back/top`
            ),
            navCard(
              '🔍',
              t('back.search'),
              t('back.search_desc'),
              `#!/d/${deliberationId}/back/search`
            ),
          ]),
        ]),
      ]);
    },
  };
}

function navCard(icon: string, title: string, desc: string, href: string): m.Vnode {
  return m('a.nav-cards__card', { href }, [
    m('.nav-cards__icon', icon),
    m('.nav-cards__body', [
      m('.nav-cards__title', title),
      m('.nav-cards__desc', desc),
    ]),
    m('.nav-cards__arrow', '→'),
  ]);
}
