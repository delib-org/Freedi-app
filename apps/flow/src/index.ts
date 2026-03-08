import m from 'mithril';
import './styles/global.scss';
import './styles/components.scss';
import { initAuth, ensureUser, getUserState, signInWithGoogle } from './lib/user';
import { initI18n } from './lib/i18n';
import { LanguagePicker } from './components/LanguagePicker';
import {
  Deliberation,
  loadDeliberation,
  loadSession,
  createSession,
  advanceStage,
  syncOfflineQueue,
  getOfflineQueueCount,
  loadMyDeliberations,
  getParticipatedIds,
  SessionState,
} from './lib/deliberation';
import { t } from './lib/i18n';
import { Intro } from './views/Intro';
import { NeedsWrite } from './views/NeedsWrite';
import { NeedsEvaluate } from './views/NeedsEvaluate';
import { SolutionsWrite } from './views/SolutionsWrite';
import { SolutionsEvaluate } from './views/SolutionsEvaluate';
import { CurrentState } from './views/CurrentState';
import { SignIn } from './views/SignIn';
import { WelcomeBack } from './views/WelcomeBack';
import { MySolutions } from './views/MySolutions';
import { TopSolutions } from './views/TopSolutions';
import { SearchSolutions } from './views/SearchSolutions';
import { ChallengeInput } from './views/ChallengeInput';
import { Wizard } from './views/Wizard';
import { ReviewLaunch } from './views/ReviewLaunch';
import { ShareScreen } from './views/ShareScreen';
import { Dashboard } from './views/Dashboard';
import { DeliberationDetail } from './views/DeliberationDetail';

// Initialize
initAuth();
initI18n();

// Sync offline evaluations when connection is restored
window.addEventListener('online', () => {
  if (getOfflineQueueCount() > 0) {
    syncOfflineQueue()
      .then((count) => {
        if (count > 0) {
          console.info(`[OfflineSync] Synced ${count} evaluations`);
          m.redraw();
        }
      })
      .catch((err) => console.error('[OfflineSync] Failed:', err));
  }
});

// ---------------------------------------------------------------------------
// Bootstrap helper — loads deliberation + session + ensures user
// ---------------------------------------------------------------------------
interface BootstrapResult {
  deliberation: Deliberation | null;
  session: SessionState | null;
  loading: boolean;
  error: string | null;
}

async function bootstrap(deliberationId: string, result: BootstrapResult): Promise<void> {
  try {
    await ensureUser();
    const delib = await loadDeliberation(deliberationId);

    if (!delib) {
      result.error = 'Deliberation not found.';
      result.loading = false;
      m.redraw();
      return;
    }

    result.deliberation = delib;
    result.session = loadSession(deliberationId) ?? createSession(deliberationId);
    result.loading = false;
    m.redraw();
  } catch (error) {
    console.error('[Bootstrap] Failed:', error);
    result.error = 'Failed to load. Please try again.';
    result.loading = false;
    m.redraw();
  }
}

// ---------------------------------------------------------------------------
// Flow Controller — orchestrates the forward journey (closure component)
// ---------------------------------------------------------------------------
function FlowController(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
  const state: BootstrapResult = {
    deliberation: null,
    session: null,
    loading: true,
    error: null,
  };

  bootstrap(initialVnode.attrs.id, state);

  return {
    view() {
      const { loading: authLoading } = getUserState();

      if (state.loading || authLoading) {
        return m('.shell', m('.shell__content.text-center', { style: { justifyContent: 'center' } }, 'Loading...'));
      }

      if (state.error || !state.deliberation || !state.session) {
        return m('.shell', m('.shell__content.text-center', { style: { justifyContent: 'center' } }, [
          m('h2', 'Not Found'),
          m('p', { style: { color: 'var(--text-secondary)' } }, state.error ?? 'Deliberation not found.'),
        ]));
      }

      const delib = state.deliberation;
      const session = state.session;
      const settings = delib.settings;

      const advance = () => {
        advanceStage(session);
        m.redraw();
      };

      let stageView: m.Children;

      switch (session.currentStage) {
        case 'intro':
          stageView = m(Intro, {
            deliberation: delib,
            participantCount: delib.participantCount,
            onBegin: advance,
          });
          break;

        case 'needs-write':
          stageView = m(NeedsWrite, {
            questionId: delib.needsQuestionId,
            topParentId: delib.deliberationId,
            session,
            maxNeeds: settings.maxNeedsPerUser,
            onDone: advance,
          });
          break;

        case 'needs-evaluate':
          stageView = m(NeedsEvaluate, {
            questionId: delib.needsQuestionId,
            session,
            maxEvaluations: settings.evaluationsPerStage,
            onDone: advance,
          });
          break;

        case 'solutions-write':
          stageView = m(SolutionsWrite, {
            needsQuestionId: delib.needsQuestionId,
            solutionsQuestionId: delib.solutionsQuestionId,
            topParentId: delib.deliberationId,
            session,
            maxSolutions: settings.maxSolutionsPerUser,
            onDone: advance,
          });
          break;

        case 'solutions-evaluate':
          stageView = m(SolutionsEvaluate, {
            questionId: delib.solutionsQuestionId,
            session,
            maxEvaluations: settings.evaluationsPerStage,
            onDone: advance,
          });
          break;

        case 'state':
          stageView = m(CurrentState, {
            needsQuestionId: delib.needsQuestionId,
            solutionsQuestionId: delib.solutionsQuestionId,
            session,
            onContinue: advance,
          });
          break;

        case 'done':
          stageView = m(SignIn, {
            session,
            onSkip: () => m.route.set('/'),
            onDone: () => m.route.set('/'),
          });
          break;

        default:
          return m('.shell', m('.shell__content.text-center', 'Unknown stage'));
      }

      // Wrap stage view with a floating language picker
      return m('.flow-wrapper', [
        m('.flow-wrapper__lang', m(LanguagePicker)),
        stageView,
      ]);
    },
  };
}

// ---------------------------------------------------------------------------
// Go Back Controllers (closure components)
// ---------------------------------------------------------------------------
function GoBackHub(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
  const state: BootstrapResult = { deliberation: null, session: null, loading: true, error: null };
  bootstrap(initialVnode.attrs.id, state);

  return {
    view(vnode) {
      if (state.loading) return m('.shell', m('.shell__content.text-center', 'Loading...'));
      if (!state.deliberation) return m('.shell', m('.shell__content.text-center', 'Not found'));
      return m(WelcomeBack, { deliberation: state.deliberation, deliberationId: vnode.attrs.id });
    },
  };
}

function GoBackMy(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
  const state: BootstrapResult = { deliberation: null, session: null, loading: true, error: null };
  bootstrap(initialVnode.attrs.id, state);

  return {
    view(vnode) {
      if (state.loading) return m('.shell', m('.shell__content.text-center', 'Loading...'));
      if (!state.deliberation) return m('.shell', m('.shell__content.text-center', 'Not found'));
      return m(MySolutions, { solutionsQuestionId: state.deliberation.solutionsQuestionId, deliberationId: vnode.attrs.id });
    },
  };
}

function GoBackTop(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
  const state: BootstrapResult = { deliberation: null, session: null, loading: true, error: null };
  bootstrap(initialVnode.attrs.id, state);

  return {
    view(vnode) {
      if (state.loading) return m('.shell', m('.shell__content.text-center', 'Loading...'));
      if (!state.deliberation) return m('.shell', m('.shell__content.text-center', 'Not found'));
      return m(TopSolutions, { solutionsQuestionId: state.deliberation.solutionsQuestionId, deliberationId: vnode.attrs.id });
    },
  };
}

function GoBackSearch(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
  const state: BootstrapResult = { deliberation: null, session: null, loading: true, error: null };
  bootstrap(initialVnode.attrs.id, state);

  return {
    view(vnode) {
      if (state.loading) return m('.shell', m('.shell__content.text-center', 'Loading...'));
      if (!state.deliberation) return m('.shell', m('.shell__content.text-center', 'Not found'));
      return m(SearchSolutions, { solutionsQuestionId: state.deliberation.solutionsQuestionId, deliberationId: vnode.attrs.id });
    },
  };
}

// ---------------------------------------------------------------------------
// Home / Landing (Redesigned with language picker, sign-in, app explanation)
// ---------------------------------------------------------------------------
function Home(): m.Component {
  let linkInput = '';
  let recentDelibs: Deliberation[] = [];
  let hasData = false;

  function loadRecent(): void {
    const participated = getParticipatedIds();
    if (participated.length > 0) hasData = true;

    loadMyDeliberations()
      .then((delibs) => {
        recentDelibs = delibs.slice(0, 2);
        if (delibs.length > 0) hasData = true;
        m.redraw();
      })
      .catch(() => { /* ignore */ });
  }

  function handleJoin(): void {
    const input = linkInput.trim();
    // Extract deliberation ID from URL or use raw ID
    const match = input.match(/\/d\/([a-zA-Z0-9_-]+)/);
    const id = match ? match[1] : input;
    if (id) {
      m.route.set(`/d/${id}`);
    }
  }

  function handleSignIn(): void {
    signInWithGoogle()
      .then(() => {
        // Reload deliberations now that we're signed in
        loadRecent();
        m.redraw();
      })
      .catch((err: unknown) => {
        console.error('[Home] Sign in failed:', err);
      });
  }

  return {
    oninit() {
      loadRecent();
    },

    view() {
      const { user, tier } = getUserState();
      const isGoogleUser = tier === 2 && user !== null;
      const displayName = user?.displayName ?? '';
      const initial = displayName ? displayName.charAt(0).toUpperCase() : '';

      return m('.shell', [
        // Header bar: language picker (left) + sign-in/avatar (right)
        m('.home-header', [
          m(LanguagePicker),

          isGoogleUser
            ? m('.home-avatar', {
                onclick: () => m.route.set('/my'),
                role: 'button',
                tabindex: 0,
                style: { cursor: 'pointer' },
              }, [
                m('.home-avatar__circle', initial),
                m('.home-avatar__name', t('home.welcome_user', { name: displayName.split(' ')[0] })),
              ])
            : m('button.btn.btn--ghost', {
                onclick: handleSignIn,
                'aria-label': t('home.sign_in'),
              }, t('home.sign_in')),
        ]),

        m('.shell__content', { style: { justifyContent: 'center', gap: 'var(--space-lg)' } }, [
          // Hero
          m('.home-hero', [
            m('h1.home-hero__title', 'Freedi'),
            m('p.home-hero__tagline', t('home.tagline')),
          ]),

          // App explanation
          m('p.home-explanation', t('home.explanation')),

          // Initiator CTA
          m('.home-card', [
            m('p.home-card__text', t('home.have_challenge')),
            m('button.btn.btn--primary.btn--full', {
              onclick: () => m.route.set('/create'),
            }, t('home.start_deliberation')),
          ]),

          // Divider
          m('.home-divider', [
            m('span', t('home.or')),
          ]),

          // Participant link paste
          m('.home-card', [
            m('p.home-card__text', t('home.have_link')),
            m('.home-card__row', [
              m('input.text-input', {
                type: 'text',
                value: linkInput,
                placeholder: 'https://...',
                'aria-label': t('home.paste_link'),
                oninput: (e: InputEvent) => {
                  linkInput = (e.target as HTMLInputElement).value;
                },
                onkeydown: (e: KeyboardEvent) => {
                  if (e.key === 'Enter') handleJoin();
                },
              }),
              m('button.btn.btn--secondary', {
                disabled: !linkInput.trim(),
                onclick: handleJoin,
              }, t('home.join')),
            ]),
          ]),

          // Recent deliberations
          hasData
            ? m('.home-recent', [
                m('h2.home-recent__title', t('home.my_deliberations')),
                ...recentDelibs.map((delib) =>
                  m('.delib-card.delib-card--compact', {
                    key: delib.deliberationId,
                    onclick: () => m.route.set(`/d/${delib.deliberationId}/manage`),
                    role: 'button',
                    tabindex: 0,
                  }, [
                    m('.delib-card__title', delib.title),
                    m('.delib-card__meta', [
                      m('span', `${delib.participantCount} ${t('dashboard.participants')}`),
                    ]),
                  ])
                ),
                m('button.btn.btn--ghost.btn--sm', {
                  onclick: () => m.route.set('/my'),
                }, t('home.see_all')),
              ])
            : null,
        ]),
      ]);
    },
  };
}

// ---------------------------------------------------------------------------
// Create Flow Controllers (Initiator)
// ---------------------------------------------------------------------------
function CreateChallenge(): m.Component {
  return {
    view() {
      return m(ChallengeInput, {
        onContinue: () => m.route.set('/create/wizard'),
      });
    },
  };
}

function CreateWizard(): m.Component {
  return {
    view() {
      return m(Wizard, {
        onDone: () => m.route.set('/create/review'),
        onBack: () => m.route.set('/create'),
      });
    },
  };
}

function CreateReview(): m.Component {
  return {
    view() {
      return m(ReviewLaunch, {
        onLaunched: (id: string) => m.route.set(`/create/share/${id}`),
        onEditStep: (step: string) => m.route.set(`/create/wizard`),
      });
    },
  };
}

function CreateShare(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
  return {
    view(vnode) {
      return m(ShareScreen, { deliberationId: vnode.attrs.id });
    },
  };
}

function DashboardPage(): m.Component {
  return {
    view() {
      return m(Dashboard);
    },
  };
}

function ManageDeliberation(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
  return {
    view(vnode) {
      return m(DeliberationDetail, { deliberationId: vnode.attrs.id });
    },
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
const root = document.getElementById('app');

if (root) {
  m.route(root, '/', {
    '/': Home,
    '/create': CreateChallenge,
    '/create/wizard': CreateWizard,
    '/create/review': CreateReview,
    '/create/share/:id': CreateShare,
    '/my': DashboardPage,
    '/d/:id': FlowController,
    '/d/:id/manage': ManageDeliberation,
    '/d/:id/back': GoBackHub,
    '/d/:id/back/my': GoBackMy,
    '/d/:id/back/top': GoBackTop,
    '/d/:id/back/search': GoBackSearch,
  });
}
