import m from 'mithril';
import { Statement } from '@freedi/shared-types';
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
import { t } from '@/lib/i18n';
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
    const headerColor = question.color || 'var(--color-primary)';

    return m('.solutions', [
      m('.solutions__header', { style: { background: headerColor } }, [
        m('h1.solutions__title', question.statement),
      ]),
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
        options.length === 0
          ? m('.solutions__empty', t('solutions.error.no_options'))
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
