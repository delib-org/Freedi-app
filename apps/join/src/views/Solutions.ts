import m from 'mithril';
import { Statement } from '@freedi/shared-types';
import { ensureUser, signInWithGoogle, getUserState } from '@/lib/user';
import {
  loadQuestion,
  getQuestion,
  getVisibleOptions,
  getOrganizerSuggestions,
  subscribeOptions,
  subscribeQuestion,
  subscribeMainStatement,
  getUnreadCount,
  getTotalVisibleCount,
} from '@/lib/store';
import { isAdmin, checkAdminStatus } from '@/lib/admin';
import { t } from '@/lib/i18n';
import { isFacilitatedMode } from '@/lib/facilitator';
import { SolutionCard } from '@/components/SolutionCard';
import { JoinFormModal } from '@/components/JoinFormModal';
import { AddSuggestionModal } from '@/components/AddSuggestionModal';
import { WizColFooter } from '@/components/WizColFooter';
import type { Unsubscribe } from '@/lib/firebase';

let loading = true;
let error: string | null = null;
let questionUnsub: Unsubscribe | null = null;
let optionsUnsub: Unsubscribe | null = null;
let mainUnsub: Unsubscribe | null = null;
let showJoinForm = false;
let pendingJoinOptionId: string | null = null;
let pendingJoinRole: 'activist' | 'organizer' = 'activist';
let adminMode = false;
let showAddSuggestion = false;

export const Solutions: m.Component = {
  async oninit() {
    loading = true;
    error = null;
    const questionId = m.route.param('qid');
    if (!questionId) {
      error = t('solutions.error.no_id');
      loading = false;
      m.redraw();

      return;
    }

    try {
      await ensureUser();
      await loadQuestion(questionId);
      questionUnsub = subscribeQuestion(questionId);
      optionsUnsub = subscribeOptions(questionId);

      // In facilitated mode, also keep a listener on the main statement so
      // the facilitator can move us up to the Hub or across to another
      // question / chat without us being on the Hub view.
      const mainId = m.route.param('mid');
      if (mainId) {
        mainUnsub = subscribeMainStatement(mainId);
      }
    } catch (err) {
      console.error('[Solutions] Failed to load:', err);
      error = t('solutions.error.failed');
    } finally {
      loading = false;
      m.redraw();
    }
  },

  onremove() {
    if (questionUnsub) {
      questionUnsub();
      questionUnsub = null;
    }
    if (optionsUnsub) {
      optionsUnsub();
      optionsUnsub = null;
    }
    if (mainUnsub) {
      mainUnsub();
      mainUnsub = null;
    }
  },

  view() {
    if (loading) {
      return m('.solutions', m('.solutions__loading', t('solutions.loading')));
    }

    if (error) {
      return m('.solutions', m('.solutions__empty', error));
    }

    const question = getQuestion();
    if (!question) {
      return m('.solutions', m('.solutions__empty', t('solutions.error.not_found')));
    }

    const options = getVisibleOptions();
    const total = getTotalVisibleCount();
    const unread = getUnreadCount();
    const accentColor = question.color || 'var(--terra-500)';
    const facilitated = isFacilitatedMode();

    return m(`.solutions${facilitated ? '.solutions--facilitated' : ''}`, [
      m(
        '.solutions__header',
        { style: `--q-accent: ${accentColor}` },
        [m('h1.solutions__title', question.statement)],
      ),
      m('.solutions__scroll', [
        m('.solutions__subtitle', [
          m('span.solutions__subtitle-icon', '\u2728'),
          m('span', buildSubtitleText(question)),
        ]),
        m('.solutions__counter', [
          m('span.solutions__counter-total', t('solutions.counter.options', { count: total })),
          unread > 0
            ? m('span.solutions__counter-unread', t('solutions.counter.new', { count: unread }))
            : null,
        ]),
        facilitated
          ? null
          : isAdmin()
            ? m('.solutions__admin-toolbar', [
                m(
                  'button.btn.btn--small.btn--primary',
                  {
                    onclick: () => {
                      showAddSuggestion = true;
                    },
                  },
                  t('admin.add_suggestion'),
                ),
                m(
                  `button.btn.btn--small${adminMode ? '.btn--primary' : '.btn--outline'}`,
                  {
                    onclick: () => {
                      adminMode = !adminMode;
                    },
                  },
                  t('admin.manage_options'),
                ),
              ])
            : renderAdminSignIn(question.statementId, question.creatorId),
        options.length === 0
          ? m('.solutions__empty', t('solutions.error.no_options'))
          : m('.solutions__crowd-section', [
              // Header only appears when the organizer section is also
              // visible, so a simple question without any organizer
              // suggestions still shows a single unlabeled list.
              getOrganizerSuggestions().length > 0
                ? m('h2.solutions__crowd-heading', t('admin.crowd_section'))
                : null,
              m(
                '.solutions__list',
                options.map((option) =>
                  m(SolutionCard, {
                    key: option.statementId,
                    option,
                    questionId: question.statementId,
                    adminMode: isAdmin() && adminMode && !facilitated,
                    displayOnly: facilitated,
                    onRequestJoinForm: (optionId: string, role: 'activist' | 'organizer') => {
                      pendingJoinOptionId = optionId;
                      pendingJoinRole = role;
                      showJoinForm = true;
                    },
                  }),
                ),
              ),
            ]),
        // Organizer suggestions render AFTER the crowd list — the crowd
        // is the primary content, admin additions come last.
        renderOrganizerSection(question.statementId, adminMode, facilitated),
        m(WizColFooter),
      ]),
      showJoinForm && question.statementSettings?.joinForm
        ? m(JoinFormModal, {
            joinForm: question.statementSettings.joinForm,
            questionId: question.statementId,
            optionId: pendingJoinOptionId!,
            role: pendingJoinRole,
            onClose: () => {
              showJoinForm = false;
              pendingJoinOptionId = null;
            },
          })
        : null,
      showAddSuggestion
        ? m(AddSuggestionModal, {
            onClose: () => {
              showAddSuggestion = false;
            },
          })
        : null,
    ]);
  },
};

/** Discreet "Sign in as admin" affordance for anonymous visitors. The Join
 *  app signs users in anonymously by default, so admins whose Google uid
 *  would match the question need a way to upgrade the session and trigger a
 *  fresh admin check. Hidden once the user has a non-anonymous session to
 *  avoid nagging non-admin Google users. */
function renderAdminSignIn(questionId: string, creatorId: string): m.Children {
  const user = getUserState().user;
  if (!user || !user.isAnonymous) return null;

  return m('.solutions__admin-signin', [
    m(
      'button.btn.btn--small.btn--outline',
      {
        onclick: async () => {
          try {
            await signInWithGoogle();
            await checkAdminStatus(questionId, creatorId);
            m.redraw();
          } catch (err) {
            console.error('[Solutions] Admin sign-in failed:', err);
          }
        },
      },
      t('admin.signin'),
    ),
  ]);
}

function renderOrganizerSection(
  questionId: string,
  adminModeActive: boolean,
  facilitated: boolean,
): m.Children {
  const suggestions = getOrganizerSuggestions();
  if (suggestions.length === 0) return null;

  return m('.solutions__organizer-section', [
    m('h2.solutions__organizer-heading', t('admin.suggestions_section')),
    m(
      '.solutions__list',
      suggestions.map((option) =>
        m(SolutionCard, {
          key: option.statementId,
          option,
          questionId,
          isOrganizerSuggestion: true,
          adminMode: isAdmin() && adminModeActive && !facilitated,
          displayOnly: facilitated,
          onRequestJoinForm: (optionId: string, role: 'activist' | 'organizer') => {
            pendingJoinOptionId = optionId;
            pendingJoinRole = role;
            showJoinForm = true;
          },
        }),
      ),
    ),
  ]);
}

function buildSubtitleText(question: Statement): string {
  const threshold = question.statementSettings?.activationThreshold;
  if (!threshold?.enabled) {
    return t('solutions.subtitle.default');
  }

  const parts: string[] = [];
  if (threshold.minOrganizers) {
    const key = threshold.minOrganizers > 1 ? 'threshold.organizers_plural' : 'threshold.organizers';
    parts.push(t(key, { count: threshold.minOrganizers }));
  }
  if (threshold.minActivists) {
    const key = threshold.minActivists > 1 ? 'threshold.activists_plural' : 'threshold.activists';
    parts.push(t(key, { count: threshold.minActivists }));
  }

  if (parts.length === 0) {
    return t('solutions.subtitle.default');
  }

  return t('solutions.subtitle.threshold', { requirements: parts.join(' & ') });
}
