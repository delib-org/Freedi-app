import m from 'mithril';
import { t } from '../../lib/i18n';
import { getConsensusPool } from '../../lib/session';
import { getDeliberationState } from '../../lib/proposals';
import { villageDesk } from '../../lib/flows/villageRoute';
import { Lobby } from '../Lobby';
import { Results } from '../Results';
import { Voting } from '../Voting';
import { rankedAnswers } from '../QuestionStage';
import { formatUnit, rankedRoundAnswers } from '../RoundStage';
import { TeacherInstructions } from './TeacherInstructions';
import { NeedsBoard } from '../../components/NeedsBoard';
import { ResultsBoard } from '../../components/ResultsBoard';
import { CpBands } from '../../components/CpBands';
import { CountdownTimer } from '../../components/CountdownTimer';
import { Icon } from '../../components/Icon';
import {
	roundLikes,
	roundSpecOf,
	AgoraStage,
	tallyAgoraCamps,
	type AgoraParticipant,
	type AgoraSession,
	type AgoraStagePlanItem,
	type AgoraTopicPackage,
} from '@freedi/shared-types';

/**
 * A stage as a seatless watcher sees it: the wall's projector and the
 * teacher's class view both render from here.
 *
 * No userId reaches any child, no participant is "mine", no name is ever
 * real: proposals are numbers, answers are numbers, the ballot is the
 * class's. Pure in the component sense — props in, vnodes out; the callers
 * own the listeners and hand the state in. Deliberately never imports the
 * notification, inbox, seen-state or teacher-console modules — a body that
 * could toast or list real names is a body that leaks onto the wall;
 * `projectorImports.test.ts` pins it.
 */
export interface WatchBodyInput {
	session: AgoraSession;
	item: AgoraStagePlanItem;
	topic: AgoraTopicPackage;
	participants: readonly AgoraParticipant[];
	/** An anonymous uid for the ballot's read-only copy; never a seat */
	userId: string;
}

export function watchStageBody(input: WatchBodyInput): m.Children {
	const { session, item, topic, participants, userId } = input;
	switch (item.stage) {
		case AgoraStage.lobby:
			return m(Lobby, { participants: [...participants], myParticipant: null });

		case AgoraStage.framing:
		case AgoraStage.perspectives:
			return m(TeacherInstructions, {
				stage: item.stage,
				topic,
				projector: true,
				videoContext: { libraryVideo: session.libraryVideo },
			});

		case AgoraStage.needs:
			return [
				m(TeacherInstructions, {
					stage: item.stage,
					topic,
					projector: true,
					videoContext: { libraryVideo: session.libraryVideo },
				}),
				m('.card.stack', m(NeedsBoard, { topic })),
			];

		case AgoraStage.positioning: {
			const tally = tallyAgoraCamps([...participants]).counts;
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
			const outcome = session.stageState?.[item.itemId]?.outcome;
			const round = roundSpecOf(item);
			if (round) {
				// A WizCol round: numbers, never names — the wall stays anonymous in a named room too
				const rankedRound = rankedRoundAnswers(round.kind, answers, false);
				const like = round.scale === 'like';

				return [
					m(TeacherInstructions, {
						stage: item.stage,
						topic,
						questionTitle: item.title,
						questionExplanation: item.explanation,
						questionKind: item.kind,
						projector: true,
					}),
					m('.card.stack', [
						m('p.projector__count-line', t('projector.texts_count', { n: rankedRound.length })),
						outcome?.summary ? m('p.round__summary', outcome.summary) : null,
						rankedRound.length === 0
							? m('p.home-explanation', t('projector.waiting'))
							: m(
									'ol.projector__answers',
									rankedRound.map((row, index) =>
										m('li.projector__answer', { key: row.statementId }, [
											m('span.projector__answer-num', String(index + 1)),
											m('p.projector__answer-text', [
												row.statement,
												row.raters > 0
													? m(
															'span.round__figure',
															like ? ` ♥${roundLikes(row)}` : ` · ${formatUnit(row.mean)}`,
														)
													: null,
											]),
										]),
									),
								),
					]),
				];
			}
			// Numbers, never names — even in a named room the wall stays anonymous
			const ranked = rankedAnswers(answers, false);

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
						onlyScored: session.votingSettings?.goalZoneOnly === true,
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

/**
 * What the guide's speech bubble holds for a watcher at a writing station:
 * the station's prompt, as the students read it, and the one thing the
 * students have that the watcher does not — the pen. The button is drawn and
 * disabled rather than dropped, so the view stays the shape the students know.
 */
export function watcherDeskCard(item: AgoraStagePlanItem): m.Children {
	const desk = villageDesk(item);

	return m('.watcher-desk', [
		desk?.prompt ? m('p.village-bubble__prompt', desk.prompt) : null,
		m(
			'button.btn.btn--secondary.btn--full.watcher-desk__pen',
			// Inert, not disabled: the disabled secondary style was drawn for dark
			// surfaces and vanishes on the bubble's paper
			{ type: 'button', 'aria-disabled': 'true', tabindex: -1 },
			[
				m(Icon, { name: 'edit', size: 18 }),
				m('span', ` ${t('teacher.watch.students_write_here')}`),
			],
		),
	]);
}
