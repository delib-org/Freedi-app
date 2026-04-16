import m from 'mithril';
import { ensureUser } from '@/lib/user';
import {
  loadQuestion,
  getQuestion,
  getVisibleOptions,
  subscribeOptions,
  subscribeQuestion,
  getUnreadCount,
  getTotalVisibleCount,
} from '@/lib/store';
import { SolutionCard } from '@/components/SolutionCard';
import { JoinFormModal } from '@/components/JoinFormModal';
import type { Unsubscribe } from '@/lib/firebase';

let loading = true;
let error: string | null = null;
let questionUnsub: Unsubscribe | null = null;
let optionsUnsub: Unsubscribe | null = null;
let showJoinForm = false;
let pendingJoinOptionId: string | null = null;
let pendingJoinRole: 'activist' | 'organizer' = 'activist';

export const Solutions: m.Component = {
  async oninit() {
    loading = true;
    error = null;
    const questionId = m.route.param('qid');
    if (!questionId) {
      error = 'No question ID provided';
      loading = false;
      m.redraw();

      return;
    }

    try {
      await ensureUser();
      await loadQuestion(questionId);
      questionUnsub = subscribeQuestion(questionId);
      optionsUnsub = subscribeOptions(questionId);
    } catch (err) {
      console.error('[Solutions] Failed to load:', err);
      error = 'Failed to load question';
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
  },

  view() {
    if (loading) {
      return m('.solutions', m('.solutions__loading', 'Loading...'));
    }

    if (error) {
      return m('.solutions', m('.solutions__empty', error));
    }

    const question = getQuestion();
    if (!question) {
      return m('.solutions', m('.solutions__empty', 'Question not found'));
    }

    const options = getVisibleOptions();
    const total = getTotalVisibleCount();
    const unread = getUnreadCount();

    const headerColor = question.color || 'var(--color-primary)';

    return m('.solutions', [
      m('.solutions__header', { style: { background: headerColor } }, [
        m('h1.solutions__title', question.statement),
        m('.solutions__subtitle', 'Please join activities that you want to promote, either as an activist or as an organizer'),
      ]),
      m('.solutions__scroll', [
        (question.description || question.brief)
          ? m('.solutions__description', question.brief || question.description)
          : null,
        m('.solutions__counter', [
          m('span.solutions__counter-total', `${total} options`),
          unread > 0
            ? m('span.solutions__counter-unread', `${unread} new`)
            : null,
        ]),
        options.length === 0
          ? m('.solutions__empty', 'No solutions available yet')
          : m(
              '.solutions__list',
              options.map((option) =>
                m(SolutionCard, {
                  key: option.statementId,
                  option,
                  questionId: question.statementId,
                  onRequestJoinForm: (optionId: string, role: 'activist' | 'organizer') => {
                    pendingJoinOptionId = optionId;
                    pendingJoinRole = role;
                    showJoinForm = true;
                  },
                }),
              ),
            ),
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
    ]);
  },
};
