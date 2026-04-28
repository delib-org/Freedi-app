import m from 'mithril';
import { Statement, Creator } from '@freedi/shared-types';
import {
  toggleJoining,
  getCreator,
  getCachedJoinFormSubmissionRole,
  getJoinFormSubmissionRole,
  getQuestion,
  getMessageCount,
  getNewMessageCount,
  getClusterEvaluatorCount,
  setOptionFlag,
  JoinRole,
} from '@/lib/store';
import { getUserState } from '@/lib/user';
import { t } from '@/lib/i18n';
import { hasCelebrated, markCelebrated, playCelebrationSound, launchConfetti } from '@/lib/celebrate';

function getOptionDescription(option: Statement): string | null {
  if (option.description) return option.description;
  if (option.brief) return option.brief;

  if (option.paragraphs && option.paragraphs.length > 0) {
    return option.paragraphs
      .map((p) => p.content ?? '')
      .filter(Boolean)
      .join(' ');
  }

  return null;
}

interface SolutionCardAttrs {
  option: Statement;
  questionId: string;
  onRequestJoinForm: (optionId: string, role: JoinRole) => void;
  /** When true, show admin curation controls (Hide / Force-show). */
  adminMode?: boolean;
  /** When true, render the organizer-suggestion variant (badge + accent). */
  isOrganizerSuggestion?: boolean;
  /** When true, render in facilitated/locked mode: no clicks, no join buttons,
   *  no admin controls — only the facilitator can move participants. */
  displayOnly?: boolean;
}

export const SolutionCard: m.Component<SolutionCardAttrs> = {
  view(vnode) {
    const { option, questionId, onRequestJoinForm, adminMode, isOrganizerSuggestion, displayOnly } = vnode.attrs;
    const user = getUserState().user;
    const question = getQuestion();
    const joinedCount = option.joined?.length ?? 0;
    const organizerCount = option.organizers?.length ?? 0;
    const messageCount = getMessageCount(option.statementId);
    const newMsgCount = getNewMessageCount(option.statementId);

    const isJoinedAsActivist = user
      ? option.joined?.some((c: Creator) => c.uid === user.uid) ?? false
      : false;
    const isJoinedAsOrganizer = user
      ? option.organizers?.some((c: Creator) => c.uid === user.uid) ?? false
      : false;

    const isActivated = isOptionActivated(joinedCount, organizerCount, question);

    const navigateToChat = (): void => {
      m.route.set('/q/:qid/s/:sid', {
        qid: questionId,
        sid: option.statementId,
      });
    };

    const handleCardClick = (e: Event): void => {
      const target = e.target as HTMLElement;

      // Don't navigate if clicking on interactive elements
      if (
        target.closest('button') ||
        target.closest('[role="button"]') ||
        target.closest('a') ||
        target.closest('input') ||
        target.closest('textarea')
      ) {
        return;
      }

      // Only navigate if clicking on the card itself, not on nested content
      navigateToChat();
    };

    const isCluster = option.isCluster === true;
    const groupSize = option.integratedOptions?.length ?? 0;

    const organizerClass = isOrganizerSuggestion ? '.solution-card--organizer' : '';
    const displayOnlyClass = displayOnly ? '.solution-card--display-only' : '';

    return m(
      `.solution-card${isActivated ? '.solution-card--activated' : ''}${isCluster && groupSize > 0 ? '.solution-card--grouped' : ''}${organizerClass}${displayOnlyClass}`,
      {
        role: displayOnly ? undefined : 'button',
        tabindex: displayOnly ? undefined : 0,
        'aria-label': option.statement,
        'aria-disabled': displayOnly ? 'true' : undefined,
        onclick: displayOnly ? undefined : handleCardClick,
        onkeydown: displayOnly
          ? undefined
          : (e: KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                navigateToChat();
              }
            },
        oncreate: (vnode: m.VnodeDOM) => {
          if (isActivated && !hasCelebrated(option.statementId)) {
            markCelebrated(option.statementId);
            playCelebrationSound();
            launchConfetti(vnode.dom as HTMLElement);
          }
        },
        onupdate: (vnode: m.VnodeDOM) => {
          if (isActivated && !hasCelebrated(option.statementId)) {
            markCelebrated(option.statementId);
            playCelebrationSound();
            launchConfetti(vnode.dom as HTMLElement);
          }
        },
      },
      [
        isOrganizerSuggestion
          ? m('.solution-card__organizer-badge', t('admin.suggestion_badge'))
          : null,
        isActivated
          ? m('.solution-card__activated-badge', t('card.activated'))
          : null,
        renderMetaRow(option, isCluster, groupSize),
        m('.solution-card__title', option.statement),
        getOptionDescription(option)
          ? m('.solution-card__description', getOptionDescription(option))
          : null,
        buildQuotaBar(joinedCount, organizerCount, question),
        m('.solution-card__meta', [
          m('.solution-card__counts', [
            m('.solution-card__count', t('card.activists', { count: joinedCount })),
            m('.solution-card__count', t('card.organizers', { count: organizerCount })),
          ]),
          m(
            '.solution-card__chat',
            {
              class: messageCount > 0 ? 'solution-card__chat--active' : '',
              role: displayOnly ? undefined : 'button',
              tabindex: displayOnly ? undefined : 0,
              'aria-label':
                newMsgCount > 0
                  ? t(newMsgCount > 1 ? 'card.new_messages_plural' : 'card.new_messages', { count: newMsgCount })
                  : t('chat.open'),
              onclick: displayOnly
                ? undefined
                : (e: Event) => {
                    e.stopPropagation();
                    navigateToChat();
                  },
              onkeydown: displayOnly
                ? undefined
                : (e: KeyboardEvent) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      navigateToChat();
                    }
                  },
            },
            [
              m('.solution-card__chat-icon', { 'aria-hidden': 'true' }, '\uD83D\uDCAC'),
              messageCount > 0
                ? m('.solution-card__chat-count', messageCount)
                : null,
              newMsgCount > 0
                ? m('.solution-card__chat-new', { 'aria-hidden': 'true' }, newMsgCount)
                : null,
            ],
          ),
        ]),
        displayOnly
          ? null
          : m('.solution-card__actions', [
              m(
                `button.btn.btn--small${isJoinedAsActivist ? '.btn--agree' : '.btn--outline-agree'}`,
                {
                  onclick: (e: Event) => {
                    e.stopPropagation();
                    handleJoin(option.statementId, questionId, 'activist', onRequestJoinForm);
                  },
                },
                isJoinedAsActivist ? t('card.joined_activist') : t('card.join_activist'),
              ),
              m(
                `button.btn.btn--small${isJoinedAsOrganizer ? '.btn--organizer' : '.btn--outline-organizer'}`,
                {
                  onclick: (e: Event) => {
                    e.stopPropagation();
                    handleJoin(option.statementId, questionId, 'organizer', onRequestJoinForm);
                  },
                },
                isJoinedAsOrganizer ? t('card.joined_organizer') : t('card.join_organizer'),
              ),
            ]),
        adminMode && !displayOnly
          ? m('.solution-card__admin', [
              m(
                'button.btn.btn--small.btn--outline',
                {
                  onclick: (e: Event) => {
                    e.stopPropagation();
                    setOptionFlag(option.statementId, 'hide', !option.hide);
                  },
                },
                option.hide ? t('admin.unhide') : t('admin.hide'),
              ),
              !isOrganizerSuggestion
                ? m(
                    'button.btn.btn--small.btn--outline',
                    {
                      onclick: (e: Event) => {
                        e.stopPropagation();
                        setOptionFlag(option.statementId, 'forceShow', !option.forceShow);
                      },
                    },
                    option.forceShow ? t('admin.unforce') : t('admin.force_show'),
                  )
                : null,
            ])
          : null,
      ],
    );
  },
};

async function handleJoin(
  optionId: string,
  questionId: string,
  role: JoinRole,
  onRequestJoinForm: (optionId: string, role: JoinRole) => void,
): Promise<void> {
  const creator = getCreator();
  if (!creator) return;

  const question = getQuestion();
  const joinForm = question?.statementSettings?.joinForm;

  if (joinForm?.enabled) {
    // Optimistic path: open the form IMMEDIATELY when the cache doesn't tell
    // us the user already submitted for this role. The Firestore verification
    // runs in the background and corrects the cache for next time.
    const cachedRole = getCachedJoinFormSubmissionRole(questionId, creator.uid);
    if (cachedRole !== role) {
      onRequestJoinForm(optionId, role);
      // Warm the cache so subsequent clicks on the same role skip the form.
      void getJoinFormSubmissionRole(questionId, creator.uid);

      return;
    }
  }

  await toggleJoining(optionId, questionId, role);
  m.redraw();
}

function renderMetaRow(
  option: Statement,
  isCluster: boolean,
  groupSize: number,
): m.Vnode | null {
  if (!isCluster) return null;

  const evaluatorCount = getClusterEvaluatorCount(option.statementId);
  const showBadge = groupSize > 0;
  const showVotes = evaluatorCount > 0;
  if (!showBadge && !showVotes) return null;

  return m('.solution-card__meta-row', [
    showBadge
      ? m('.solution-card__group-badge', t('card.group_represents', { count: groupSize }))
      : null,
    showVotes
      ? m(
          '.solution-card__group-votes',
          t('card.group_evaluators', { count: evaluatorCount }),
        )
      : null,
  ]);
}

function isOptionActivated(
  joinedCount: number,
  organizerCount: number,
  question: Statement | null,
): boolean {
  const threshold = question?.statementSettings?.activationThreshold;
  if (!threshold?.enabled) return false;

  const minActivists = threshold.minActivists ?? 0;
  const minOrganizers = threshold.minOrganizers ?? 0;
  if (minActivists === 0 && minOrganizers === 0) return false;

  return joinedCount >= minActivists && organizerCount >= minOrganizers;
}

function buildQuotaBar(
  joinedCount: number,
  organizerCount: number,
  question: Statement | null,
): m.Vnode | null {
  const threshold = question?.statementSettings?.activationThreshold;
  if (!threshold?.enabled) return null;

  const minActivists = threshold.minActivists ?? 0;
  const minOrganizers = threshold.minOrganizers ?? 0;
  if (minActivists === 0 && minOrganizers === 0) return null;

  const activistsMet = joinedCount >= minActivists;
  const organizersMet = organizerCount >= minOrganizers;
  const allMet = activistsMet && organizersMet;

  const items: m.Vnode[] = [];

  if (minActivists > 0) {
    const remaining = Math.max(0, minActivists - joinedCount);
    const pct = Math.min(100, Math.round((joinedCount / minActivists) * 100));
    items.push(
      m('.solution-card__quota-row', [
        m('.solution-card__quota-label', activistsMet ? t('card.quota.activists_met') : t('card.quota.activists_needed', { count: remaining })),
        m('.solution-card__quota-track', [
          m('.solution-card__quota-fill.solution-card__quota-fill--activist', { style: { width: `${pct}%` } }),
        ]),
      ]),
    );
  }

  if (minOrganizers > 0) {
    const remaining = Math.max(0, minOrganizers - organizerCount);
    const pct = Math.min(100, Math.round((organizerCount / minOrganizers) * 100));
    items.push(
      m('.solution-card__quota-row', [
        m('.solution-card__quota-label', organizersMet ? t('card.quota.organizers_met') : t('card.quota.organizers_needed', { count: remaining })),
        m('.solution-card__quota-track', [
          m('.solution-card__quota-fill.solution-card__quota-fill--organizer', { style: { width: `${pct}%` } }),
        ]),
      ]),
    );
  }

  return m(`.solution-card__quota${allMet ? '.solution-card__quota--met' : ''}`, items);
}
