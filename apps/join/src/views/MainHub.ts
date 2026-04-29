import m from 'mithril';
import { Statement } from '@freedi/shared-types';
import { ensureUser, signInWithGoogle, getUserState } from '@/lib/user';
import {
  loadMainStatement,
  getMainStatement,
  getSubQuestions,
  subscribeMainStatement,
  subscribeSubQuestions,
} from '@/lib/store';
import { checkAdminStatus } from '@/lib/admin';
import { t, isRTL } from '@/lib/i18n';
import { WizColFooter } from '@/components/WizColFooter';
import { FacilitatorPanel } from '@/components/FacilitatorPanel';
import { SplashLoader } from '@/views/Splash';
import type { Unsubscribe } from '@/lib/firebase';

function getStatementBody(s: Statement): string | null {
  // `description` is the cloud-function-cached preview built from child
  // paragraph sub-statements (`statementType === paragraph`), capped at
  // ~200 chars. Using it here is intentional — it saves an extra Firestore
  // query on the hub. `brief` is the admin-authored tagline fallback.
  // The legacy embedded `paragraphs[]` array is no longer the source of truth.
  if (s.description) return s.description;
  if (s.brief) return s.brief;

  return null;
}

let loading = true;
let error: string | null = null;
let mainUnsub: Unsubscribe | null = null;
let subUnsub: Unsubscribe | null = null;

export const MainHub: m.Component = {
  async oninit() {
    loading = true;
    error = null;

    const mainId = m.route.param('mid');
    if (!mainId) {
      error = t('solutions.error.no_id');
      loading = false;
      m.redraw();

      return;
    }

    try {
      await ensureUser();
      await loadMainStatement(mainId);
      // Resolve admin status against the main statement so the facilitator
      // panel handle is visible to admins even on the hub (where no specific
      // question is in scope yet). Per-question status is re-resolved on
      // navigation into Solutions.
      const main = getMainStatement();
      if (main) {
        await checkAdminStatus(mainId, main.creatorId);
      }
      mainUnsub = subscribeMainStatement(mainId);
      subUnsub = subscribeSubQuestions(mainId);
    } catch (err) {
      console.error('[MainHub] Failed to load:', err);
      error = t('solutions.error.failed');
    } finally {
      loading = false;
      m.redraw();
    }
  },

  onremove() {
    if (mainUnsub) {
      mainUnsub();
      mainUnsub = null;
    }
    if (subUnsub) {
      subUnsub();
      subUnsub = null;
    }
  },

  view() {
    if (loading) {
      return m(SplashLoader);
    }

    if (error) {
      return m('.main-hub', m('.main-hub__empty', error));
    }

    const main = getMainStatement();
    if (!main) {
      return m('.main-hub', m('.main-hub__empty', t('solutions.error.not_found')));
    }

    const subs = getSubQuestions();
    const accentColor = main.color || 'var(--terra-500)';
    const logoSrc = isRTL() ? '/wizcol-logo-rtl.png' : '/wizcol-logo-ltr.png';

    return m('.main-hub', { style: `--q-accent: ${accentColor}` }, [
      m('.main-hub__brand', [
        m('img.main-hub__logo', {
          src: logoSrc,
          alt: 'WizCol',
          width: 64,
          height: 64,
          loading: 'eager',
          decoding: 'async',
        }),
        renderAdminSignIn(main.statementId, main.creatorId),
      ]),
      m('h1.main-hub__title', main.statement),
      (() => {
        const body = getStatementBody(main);

        return body ? m('.main-hub__description', body) : null;
      })(),
      m('.main-hub__scroll', [
        m('h2.main-hub__questions-heading', t('mainHub.questionsHeading')),
        subs.length === 0
          ? m('.main-hub__empty', t('mainHub.empty'))
          : m(
              '.main-hub__question-list',
              subs.map((q: Statement) =>
                m(
                  '.main-hub__question-card',
                  {
                    key: q.statementId,
                    'aria-disabled': 'true',
                  },
                  [
                    m('.main-hub__question-title', q.statement),
                    (() => {
                      const body = getStatementBody(q);

                      return body
                        ? m('.main-hub__question-description', body)
                        : null;
                    })(),
                  ],
                ),
              ),
            ),
        m(WizColFooter),
      ]),
      m(FacilitatorPanel),
    ]);
  },
};

/** Discreet "Sign in as admin" link in the top-inline-end corner of the
 *  hub brand row. Mirrors `Solutions.renderAdminSignIn` but presented as a
 *  text link rather than a button — the hub is a participant-first surface
 *  and shouldn't grow an admin-shaped CTA. Hidden once the user has a
 *  non-anonymous session, at which point either the FacilitatorPanel handle
 *  takes over (admin) or nothing replaces the link (non-admin Google user). */
function renderAdminSignIn(mainId: string, creatorId: string): m.Children {
  const user = getUserState().user;
  if (!user || !user.isAnonymous) return null;

  return m(
    'button.main-hub__admin-signin',
    {
      type: 'button',
      onclick: async () => {
        try {
          await signInWithGoogle();
          await checkAdminStatus(mainId, creatorId);
          m.redraw();
        } catch (err) {
          console.error('[MainHub] Admin sign-in failed:', err);
        }
      },
    },
    t('admin.signin'),
  );
}
