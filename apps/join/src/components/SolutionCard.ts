import m from 'mithril';
import { Statement, Creator } from '@freedi/shared-types';
import {
  toggleJoining,
  getCreator,
  hasJoinFormSubmission,
  getQuestion,
  getMessageCount,
  getNewMessageCount,
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
}

export const SolutionCard: m.Component<SolutionCardAttrs> = {
  view(vnode) {
    const { option, questionId, onRequestJoinForm } = vnode.attrs;
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

    return m(
      `.solution-card${isActivated ? '.solution-card--activated' : ''}`,
      {
        onclick: () =>
          m.route.set('/q/:qid/s/:sid', {
            qid: questionId,
            sid: option.statementId,
          }),
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
        isActivated
          ? m('.solution-card__activated-badge', t('card.activated'))
          : null,
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
              onclick: (e: Event) => {
                e.stopPropagation();
                m.route.set('/q/:qid/s/:sid', {
                  qid: questionId,
                  sid: option.statementId,
                });
              },
            },
            [
              m('.solution-card__chat-icon', '\uD83D\uDCAC'),
              messageCount > 0
                ? m('.solution-card__chat-count', messageCount)
                : null,
              newMsgCount > 0
                ? m('.solution-card__chat-new', newMsgCount)
                : null,
            ],
          ),
        ]),
        m('.solution-card__actions', [
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

  if (joinForm?.enabled && role === 'activist') {
    const alreadySubmitted = await hasJoinFormSubmission(questionId, creator.uid);
    if (!alreadySubmitted) {
      onRequestJoinForm(optionId, role);

      return;
    }
  }

  await toggleJoining(optionId, questionId, role);
  m.redraw();
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
