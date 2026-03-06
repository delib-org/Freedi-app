import m from 'mithril';
import { upgradeToGoogle, getUserState } from '../lib/user';
import { SessionState, saveSession } from '../lib/deliberation';
import { t } from '../lib/i18n';

export interface SignInAttrs {
  session: SessionState;
  onSkip: () => void;
  onDone: () => void;
}

export function SignIn(): m.Component<SignInAttrs> {
  let error: string | null = null;
  let upgradeCompleted = false;

  return {
    view(vnode) {
      const { session, onSkip, onDone } = vnode.attrs;
      const { tier } = getUserState();

      if (tier === 2) {
        if (!upgradeCompleted) {
          upgradeCompleted = true;
          session.completedAt = Date.now();
          saveSession(session);
        }

        return m('.shell', [
          m('.shell__content', { style: { justifyContent: 'center', textAlign: 'center', gap: 'var(--space-lg)' } }, [
            m('div', { style: { fontSize: '3rem' } }, '🎉'),
            m('h2', t('signin.all_set')),
            m('p', { style: { color: 'var(--text-secondary)' } }, t('signin.notify')),
            m('div', { style: { display: 'flex', justifyContent: 'center', gap: 'var(--space-md)', marginTop: 'var(--space-md)' } }, [
              badge('🗣️', t('signin.contributor'),
                t('signin.ideas', { count: session.needsWritten + session.solutionsWritten })),
              badge('⚖️', t('signin.evaluator'),
                t('signin.ratings', { count: session.needsEvaluated + session.solutionsEvaluated })),
            ]),
          ]),
          m('.shell__footer', [
            m('button.btn.btn--primary', { onclick: onDone }, t('signin.done')),
          ]),
        ]);
      }

      return m('.shell', [
        m('.shell__content', { style: { justifyContent: 'center', textAlign: 'center', gap: 'var(--space-lg)' } }, [
          m('div', { style: { fontSize: '3rem' } }, '✨'),
          m('h2', t('signin.title')),
          m('p', { style: { color: 'var(--text-secondary)' } }, t('signin.subtitle')),

          m('button.btn.btn--primary', {
            onclick: () => {
              error = null;
              upgradeToGoogle()
                .catch((err: unknown) => {
                  error = t('signin.failed');
                  console.error('[SignIn] Upgrade failed:', err);
                  m.redraw();
                });
            },
          }, t('signin.google')),

          error
            ? m('p', { role: 'alert', style: { color: 'var(--color-disagree)', fontSize: 'var(--font-size-sm)' } }, error)
            : null,

          m('button.btn.btn--ghost', {
            onclick: () => {
              session.completedAt = Date.now();
              saveSession(session);
              onSkip();
            },
          }, t('signin.skip')),

          m('p', { style: { color: 'var(--text-muted)', fontSize: 'var(--font-size-xs)' } },
            t('signin.saved_note')),
        ]),
      ]);
    },
  };
}

function badge(icon: string, title: string, subtitle: string): m.Vnode {
  return m('.card', { style: { textAlign: 'center', padding: 'var(--space-md)' } }, [
    m('div', { style: { fontSize: '1.5rem' } }, icon),
    m('.card__title', { style: { fontSize: 'var(--font-size-sm)' } }, title),
    m('.card__text', { style: { fontSize: 'var(--font-size-xs)' } }, subtitle),
  ]);
}
