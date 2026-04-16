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

    return m(
      '.solution-card',
      {
        onclick: () =>
          m.route.set('/q/:qid/s/:sid', {
            qid: questionId,
            sid: option.statementId,
          }),
      },
      [
        m('.solution-card__title', option.statement),
        getOptionDescription(option)
          ? m('.solution-card__description', getOptionDescription(option))
          : null,
        m('.solution-card__meta', [
          m('.solution-card__counts', [
            m('.solution-card__count', `${joinedCount} activists`),
            m('.solution-card__count', `${organizerCount} organizers`),
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
            isJoinedAsActivist ? 'Activist \u2713' : 'Join as activist',
          ),
          m(
            `button.btn.btn--small${isJoinedAsOrganizer ? '.btn--organizer' : '.btn--outline-organizer'}`,
            {
              onclick: (e: Event) => {
                e.stopPropagation();
                handleJoin(option.statementId, questionId, 'organizer', onRequestJoinForm);
              },
            },
            isJoinedAsOrganizer ? 'Organizer \u2713' : 'Join organizers',
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
