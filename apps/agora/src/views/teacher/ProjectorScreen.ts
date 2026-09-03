import m from 'mithril';
import { t } from '../../lib/i18n';
import { ensureUser } from '../../lib/user';
import {
	listenToSession,
	stopListening,
	getSessionState,
	getStagePlan,
	getCurrentPlanIndex,
	getConsensusPool,
} from '../../lib/session';
import { getTopicPackage, loadTopicPackage } from '../../lib/topic';
import {
	getDeliberationState,
	listenToDeliberation,
	stopDeliberationListeners,
} from '../../lib/proposals';
import { listenToVoting, stopVotingListeners } from '../../lib/voting';
import { Lobby } from '../Lobby';
import { Results } from '../Results';
import { Voting } from '../Voting';
import { rankedAnswers } from '../QuestionStage';
import { TeacherInstructions } from './TeacherInstructions';
import { NeedsBoard } from '../../components/NeedsBoard';
import { ResultsBoard } from '../../components/ResultsBoard';
import { CpBands } from '../../components/CpBands';
import { CountdownTimer } from '../../components/CountdownTimer';
import { QRShare } from '../../components/QRShare';
import { StageTransition, hasStageTransition } from '../../components/StageTransition';
import { planItemLabel } from '../../components/StageNav';
import {
	AgoraStage,
	tallyAgoraCamps,
	type AgoraSession,
	type AgoraStagePlanItem,
	type AgoraTopicPackage,
} from '@freedi/shared-types';

/**
 * The projector: what the class sees, on the wall.
 *
 * A generic student's view of the stage the room is on — the scenes, the
 * needs board, the question's ranked answers, the live square, the ballot,
 * the results — with NO seat behind it: no userId reaches any child, no
 * participant is "mine", no name is ever real (proposals are numbers,
 * answers are numbers, the ballot is the class's). It follows the room as it
 * advances and never lets anyone step back.
 *
 * Deliberately never imports the notification, inbox, seen-state or
 * teacher-console modules — a projector that toasts, or that could list real
 * names, is a projector that leaks. `projectorImports.test.ts` pins that.
 */
export function ProjectorScreen(
	initialVnode: m.Vnode<{ id: string }>,
): m.Component<{ id: string }> {
	const sessionId = initialVnode.attrs.id;
	let userId = '';
	let lastIndex: number | null = null;
	let transitionItem: AgoraStagePlanItem | null = null;
	let transitionLeaving = false;
	let transitionTimer: number | undefined;
	let transitionLeaveTimer: number | undefined;

	function beginStageTransition(item: AgoraStagePlanItem): void {
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		transitionItem = item;
		transitionLeaving = false;
		window.clearTimeout(transitionTimer);
		window.clearTimeout(transitionLeaveTimer);
		transitionTimer = window.setTimeout(
			() => {
				transitionLeaving = true;
				m.redraw();
				transitionLeaveTimer = window.setTimeout(() => {
					transitionItem = null;
					m.redraw();
				}, 400);
			},
			reduced ? 900 : 1900,
		);
	}

	// Anonymous is enough: every read this screen makes is open to any
	// signed-in user, so a classroom PC that is nobody's account still works
	void ensureUser().then((user) => {
		userId = user.uid;
		listenToSession(sessionId, user.uid);
		setTimeout(() => m.redraw(), 0);
	});

	function stageBody(
		session: AgoraSession,
		item: AgoraStagePlanItem,
		topic: AgoraTopicPackage,
	): m.Children {
		const { participants } = getSessionState();
		switch (item.stage) {
			case AgoraStage.lobby:
				return m(Lobby, { participants, myParticipant: null });

			case AgoraStage.framing:
			case AgoraStage.perspectives:
				return m(TeacherInstructions, { stage: item.stage, topic, projector: true });

			case AgoraStage.needs:
				return [
					m(TeacherInstructions, { stage: item.stage, topic, projector: true }),
					m('.card.stack', m(NeedsBoard, { topic })),
				];

			case AgoraStage.positioning: {
				const tally = tallyAgoraCamps(participants).counts;
				const positioned = tally.left + tally.right + tally.center;
				const leftName = topic.characters[0]?.name ?? '';
				const rightName = topic.characters[1]?.name ?? '';

				return [
					m(TeacherInstructions, { stage: item.stage, topic, projector: true }),
					m('.card.stack.projector__census', [
						m('.projector__camps', [
							m('.projector__camp.projector__camp--left', [
								m('span.projector__camp-count', String(tally.left)),
								m('span.projector__camp-name', leftName),
							]),
							m('.projector__camp.projector__camp--center', [
								m('span.projector__camp-count', String(tally.center)),
								m('span.projector__camp-name', t('projector.center')),
							]),
							m('.projector__camp.projector__camp--right', [
								m('span.projector__camp-count', String(tally.right)),
								m('span.projector__camp-name', rightName),
							]),
						]),
						m(
							'p.projector__count-line',
							t('projector.positioned_count', { n: positioned, total: participants.length }),
						),
					]),
				];
			}

			case AgoraStage.question: {
				const answers = item.statementId
					? (getDeliberationState().answersByQuestion[item.statementId] ?? [])
					: [];
				// Numbers, never names — even in a named room the wall stays anonymous
				const ranked = rankedAnswers(answers, false);
				const outcome = session.stageState?.[item.itemId]?.outcome;

				return [
					m(TeacherInstructions, {
						stage: item.stage,
						topic,
						questionTitle: item.title,
						questionExplanation: item.explanation,
						projector: true,
					}),
					m('.card.stack', [
						m('p.projector__count-line', t('projector.answers_count', { n: ranked.length })),
						outcome?.selected.length
							? m(CpBands, { answers: outcome.selected, bands: outcome.bands })
							: null,
						ranked.length === 0
							? m('p.home-explanation', t('projector.waiting'))
							: m(
									'ol.projector__answers',
									ranked.map((row, index) =>
										m('li.projector__answer', { key: row.statementId }, [
											m('span.projector__answer-num', String(index + 1)),
											m('p.projector__answer-text', row.statement),
										]),
									),
								),
					]),
				];
			}

			case AgoraStage.deliberation: {
				const { proposals, scores } = getDeliberationState();

				return [
					m('.card.stack', [
						m('.delib__header', [
							session.roundEndsAt ? m(CountdownTimer, { endsAt: session.roundEndsAt }) : null,
							m('span.values__score', t('projector.proposals_count', { n: proposals.length })),
						]),
						m(ResultsBoard, {
							sessionId: session.sessionId,
							topic,
							proposals,
							scores,
							census: getConsensusPool(),
							finale: false,
						}),
					]),
				];
			}

			case AgoraStage.voting:
				return m(Voting, { session, userId, board: true, projector: true });

			case AgoraStage.results:
			case AgoraStage.ended:
				return m(Results, { session, topic });

			default:
				return null;
		}
	}

	return {
		onremove() {
			window.clearTimeout(transitionTimer);
			window.clearTimeout(transitionLeaveTimer);
			stopListening();
			stopDeliberationListeners();
			stopVotingListeners();
		},

		view() {
			if (userId) listenToSession(sessionId, userId);
			const { session, participants, loading, error } = getSessionState();

			if (loading || (!session && !error)) {
				return m(
					'.projector',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}
			if (error || !session) {
				return m(
					'.projector',
					m('.shell__content.text-center', m('p.join__error', t('common.error'))),
				);
			}

			const plan = getStagePlan();
			const currentIndex = getCurrentPlanIndex();
			const item = plan[currentIndex];

			if (currentIndex !== lastIndex) {
				if (lastIndex !== null && item && hasStageTransition(item.stage))
					beginStageTransition(item);
				lastIndex = currentIndex;
			}

			const topic = getTopicPackage(session.topicPackageId);
			if (!topic) loadTopicPackage(session.topicPackageId);

			const needsData =
				item.stage === AgoraStage.question ||
				item.stage === AgoraStage.deliberation ||
				item.stage === AgoraStage.voting ||
				item.stage === AgoraStage.results ||
				item.stage === AgoraStage.ended;
			if (needsData && userId) listenToDeliberation(sessionId, userId);
			if (item.stage === AgoraStage.voting && userId) {
				listenToVoting(sessionId, session.challengeQuestionId, userId);
			}

			const joinUrl = `${window.location.origin}/join/${session.code}`;

			return m('.projector', { 'data-stage': item.stage, 'data-screen': 'projector' }, [
				transitionItem !== null
					? m(StageTransition, {
							stage: transitionItem.stage,
							title:
								transitionItem.stage === AgoraStage.question ? transitionItem.title : undefined,
							leaving: transitionLeaving,
						})
					: null,
				m('.projector__stage', [
					m('h2.projector__title', planItemLabel(item)),
					topic
						? stageBody(session, item, topic)
						: m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				]),
				m('aside.projector__code', [
					m('span.projector__code-label', t('projector.scan_to_join')),
					m('.projector__code-value', session.code),
					item.stage === AgoraStage.lobby ? m(QRShare, { url: joinUrl }) : null,
					m('span.projector__code-count', t('projector.participants', { n: participants.length })),
				]),
			]);
		},
	};
}
