import m from 'mithril';
import { t } from '../lib/i18n';
import { ensureUser } from '../lib/user';
import {
	listenToSession,
	stopListening,
	getSessionState,
	getSessionFlow,
	reportStageProgress,
} from '../lib/session';
import { getTopicPackage, loadTopicPackage } from '../lib/topic';
import { stopValueAnswerListeners } from '../lib/values';
import { listenToNotifications, stopNotifications } from '../lib/notifications';
import { stopDeliberationListeners } from '../lib/proposals';
import { listenToVoting, stopVotingListeners } from '../lib/voting';
import { ToastStack } from '../components/Toast';
import { NeedsBoard } from '../components/NeedsBoard';
import { CelebrationOverlay } from '../components/Celebration';
import { InstallHint } from '../components/InstallHint';
import { JourneyStrip } from '../components/JourneyStrip';
import { StageTransition, hasStageTransition } from '../components/StageTransition';
import { Lobby } from './Lobby';
import { SceneStage } from './SceneStage';
import { ValueIdentification } from './ValueIdentification';
import { Positioning } from './Positioning';
import { Deliberation } from './Deliberation';
import { Voting } from './Voting';
import { Results } from './Results';
import { ReRate } from './ReRate';
import { AgoraSceneKind, AgoraSessionMode, AgoraStage } from '@freedi/shared-types';

/**
 * Student game controller — routes the current view from the session doc's
 * stage (single source of truth). Scene stages are student-paced within
 * the teacher-controlled session stage.
 */
/**
 * Whether this person has already walked through the event's opening.
 *
 * Per session and per device, in sessionStorage rather than on the
 * participant document: it is a "have I read this" mark, not a fact about the
 * deliberation, and paying a Firestore write for it would put the opening
 * screen behind a round trip.
 */
function framingKey(sessionId: string): string {
	return `agora_${sessionId}_framing_done`;
}

/**
 * The same "already done" mark for the closing re-rate.
 *
 * The participant document is the real record — the callable stamps
 * `reratedAt` — but that stamp arrives a round trip after the button, and
 * without a local mark the screen re-asks the question it just accepted.
 */
function rerateDone(sessionId: string): boolean {
	try {
		return sessionStorage.getItem(`agora_${sessionId}_rerated`) === '1';
	} catch {
		return false;
	}
}

function markRerateDone(sessionId: string): void {
	try {
		sessionStorage.setItem(`agora_${sessionId}_rerated`, '1');
	} catch {
		// Storage refused: the participant doc's stamp still ends the loop.
	}
	m.redraw();
}

function framingSeen(sessionId: string): boolean {
	try {
		return sessionStorage.getItem(framingKey(sessionId)) === '1';
	} catch {
		return false;
	}
}

function markFramingSeen(sessionId: string): void {
	try {
		sessionStorage.setItem(framingKey(sessionId), '1');
	} catch {
		// Storage refused: the opening simply shows again on the next load.
	}
	m.redraw();
}

export function GameController(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
	const sessionId = initialVnode.attrs.id;
	let userId = '';
	/** Last stage rendered — a change plays the travel interstitial */
	let lastStage: AgoraStage | null = null;
	let transitionStage: AgoraStage | null = null;
	let transitionLeaving = false;
	let transitionTimer: number | undefined;
	let transitionLeaveTimer: number | undefined;

	function beginStageTransition(stage: AgoraStage): void {
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		transitionStage = stage;
		transitionLeaving = false;
		window.clearTimeout(transitionTimer);
		window.clearTimeout(transitionLeaveTimer);
		transitionTimer = window.setTimeout(
			() => {
				transitionLeaving = true;
				m.redraw();
				transitionLeaveTimer = window.setTimeout(() => {
					transitionStage = null;
					m.redraw();
				}, 400);
			},
			reduced ? 900 : 1900,
		);
	}

	void ensureUser().then((user) => {
		userId = user.uid;
		listenToSession(sessionId, user.uid);
		// A macrotask redraw survives Mithril's route-resolution window,
		// where a synchronous m.redraw() would be silently swallowed.
		setTimeout(() => m.redraw(), 0);
	});

	return {
		onremove() {
			window.clearTimeout(transitionTimer);
			window.clearTimeout(transitionLeaveTimer);
			stopListening();
			stopValueAnswerListeners();
			stopNotifications();
			// The results recap re-attaches these after the deliberation view
			// drops them, so leaving the game is what finally closes them
			stopDeliberationListeners();
			stopVotingListeners();
		},

		view() {
			// Re-attach on every render (idempotent per sessionId). Mount/unmount
			// interleavings during route transitions can kill the module-level
			// listeners after an async attach; the next redraw self-heals.
			if (userId) {
				listenToSession(sessionId, userId);
				listenToNotifications(userId);
			}

			const { session, participants, myParticipant, participantsLoaded, loading, error } =
				getSessionState();
			const flow = getSessionFlow();

			if (loading || (!session && !error)) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}

			if (error || !session) {
				return m(
					'.shell',
					m('.shell__content.text-center', { style: { justifyContent: 'center' } }, [
						m('p.join__error', t('common.error')),
						m('button.btn.btn--secondary', { onclick: () => m.route.set('/') }, t('common.back')),
					]),
				);
			}

			// A stage change is a journey leg — play the travel card over the
			// incoming stage instead of hard-cutting. Never on first render:
			// a page refresh should land directly where the class already is.
			if (session.stage !== lastStage) {
				if (lastStage !== null && hasStageTransition(session.stage)) {
					beginStageTransition(session.stage);
				}
				lastStage = session.stage;
			}

			const overlays = [
				m(ToastStack),
				m(CelebrationOverlay),
				m(InstallHint),
				transitionStage !== null
					? m(StageTransition, { stage: transitionStage, leaving: transitionLeaving })
					: null,
			];

			if (session.stage === AgoraStage.lobby) {
				return m('.game', [
					...overlays,
					m(JourneyStrip, { stage: session.stage }),
					m(Lobby, { participants, myParticipant }),
				]);
			}

			// Every stage past the lobby needs the topic package
			const topic = getTopicPackage(session.topicPackageId);
			if (!topic) {
				loadTopicPackage(session.topicPackageId);

				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}

			/**
			 * The seat is per BROWSER: a student is known by the anonymous login
			 * stored in this profile, so a cleared browser, a private window or a
			 * link opened on another device arrives with no seat in this session.
			 * That used to render a spinner that never resolved — a dead end with
			 * nothing to read and nothing to press. Say what happened, and hand
			 * back the one door that works: the join code.
			 */
			const notEnrolled = (): m.Children =>
				m(
					'.shell',
					m(
						'.shell__content.text-center',
						{ style: { justifyContent: 'center', gap: 'var(--space-lg)' } },
						[
							m('h2', t('game.no_seat_title')),
							m('p.lobby__status', t('game.no_seat_body')),
							m(
								'button.btn.btn--primary.btn--lg',
								{ onclick: () => m.route.set(`/join/${session.code}`) },
								t('game.no_seat_action', { code: session.code }),
							),
						],
					),
				);

			/** Waiting on the roster is a spinner; a roster without me is a message */
			const noSeatYet = (): m.Children =>
				participantsLoaded
					? notEnrolled()
					: m(
							'.shell',
							m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
						);

			const scenesOf = (...kinds: AgoraSceneKind[]) =>
				kinds
					.map((kind) => topic.scenes.find((scene) => scene.kind === kind))
					.filter((scene) => scene !== undefined);

			// Scene stages publish self-paced progress so the teacher knows
			// who finished and when to advance
			const onProgress = (scenesDone: number, scenesTotal: number) => {
				if (userId) {
					reportStageProgress(sessionId, userId, session.stage, scenesDone, scenesTotal);
				}
			};

			const stageView = ((): m.Children => {
				switch (session.stage) {
					case AgoraStage.framing:
						return m(SceneStage, {
							scenes: scenesOf(
								AgoraSceneKind.intro,
								AgoraSceneKind.timeTunnel,
								AgoraSceneKind.periodExplainer,
							),
							storageKey: `agora_${sessionId}_framing`,
							onProgress,
						});

					case AgoraStage.perspectives:
						return m(SceneStage, {
							scenes: scenesOf(AgoraSceneKind.perspectiveA, AgoraSceneKind.perspectiveB),
							storageKey: `agora_${sessionId}_perspectives`,
							onProgress,
						});

					case AgoraStage.needs:
						return m(SceneStage, {
							scenes: scenesOf(
								AgoraSceneKind.needsQuestion,
								AgoraSceneKind.needsA,
								AgoraSceneKind.needsB,
							),
							storageKey: `agora_${sessionId}_needs`,
							// Both sides' needs stay on screen for re-reading while
							// the class finishes the scenes
							epilogue: m(NeedsBoard, { topic }),
							onProgress,
						});

					case AgoraStage.valueIdentification:
						return m(ValueIdentification, { sessionId, userId, topic });

					case AgoraStage.positioning:
						return myParticipant ? m(Positioning, { topic, myParticipant }) : noSeatYet();

					case AgoraStage.deliberation: {
						if (!myParticipant) return noSeatYet();

						/**
						 * The opening beat, when the event asked for one.
						 *
						 * A civic square is drop-in — people arrive all afternoon, and
						 * there is no teacher walking the room from one stage to the
						 * next. So framing cannot be a stage of the session: making it
						 * one would strand everybody who arrived after it ended. It is
						 * a screen each person passes once, remembered per session on
						 * their own device.
						 */
						if (flow.framing && !framingSeen(sessionId)) {
							return m(SceneStage, {
								scenes: scenesOf(AgoraSceneKind.intro),
								storageKey: `agora_${sessionId}_framing`,
								onFinish: () => markFramingSeen(sessionId),
							});
						}

						/**
						 * Nobody enters the square without a side.
						 *
						 * A student who joined after the class placed itself — or whose
						 * teacher advanced straight past that stage — used to walk into
						 * the deliberation with no camp, and the game quietly stopped
						 * working for them: every rating they gave was dropped from the
						 * bridging half of the score (an unknown side cannot support a
						 * claim about reaching across the camps), so an author could be
						 * voted up by the whole class and still read "bridge power still
						 * 0 — it hasn't moved yet". One screen, once, and the square
						 * measures what it says it measures.
						 */
						//
						// Unless the event runs without sides at all, in which case
						// there is nothing to catch up on and the screen would be
						// asking a question the organizer deliberately removed.
						//
						// A civic square never asks either: a voyager's camp comes
						// from their island answers (the join callable seats them in
						// the centre when nothing is derivable), and being asked to
						// position themselves again reads as starting the voyage
						// over. A civic seat that still lacks a camp — created before
						// the centre fallback, entered without passing through join —
						// goes straight in; the next join heals the doc.
						if (
							flow.stances &&
							myParticipant.campPosition === undefined &&
							session.sessionMode !== AgoraSessionMode.civic
						) {
							return m(Positioning, { topic, myParticipant, catchUp: true });
						}

						return m(Deliberation, { session, myParticipant, userId, topic });
					}

					case AgoraStage.voting: {
						if (!myParticipant) return noSeatYet();
						listenToVoting(sessionId, session.challengeQuestionId, userId);

						return m(Voting, { session, myParticipant, userId });
					}

					case AgoraStage.results:
					case AgoraStage.ended: {
						/**
						 * The closing question, for an event scored on whether the room
						 * came together.
						 *
						 * It has to be asked before the results, because the results ARE
						 * the answer: the score is the distance between where people
						 * started and where they ended, and there is no second chance to
						 * collect the second half. Asked once per person — a participant
						 * who has already answered goes straight through, and so does
						 * anyone who arrived without a starting position to compare
						 * against.
						 */
						if (
							flow.scoreMode === 'convergence' &&
							myParticipant &&
							myParticipant.stanceBaseline &&
							!myParticipant.reratedAt &&
							!rerateDone(sessionId)
						) {
							return m(ReRate, {
								session,
								onDone: () => markRerateDone(sessionId),
							});
						}

						// myParticipant carries the student's own ledger — the game
						// announces every +1 and +2 during play and this is the only
						// screen allowed to total them up
						return m(Results, { session, topic, myParticipant });
					}

					default:
						return m('.shell', [
							m(
								'.shell__content.text-center',
								{ style: { justifyContent: 'center', gap: 'var(--space-lg)' } },
								[m('h2', t('lobby.get_ready')), m('p.lobby__status', session.stage)],
							),
						]);
				}
			})();

			// No world strip: the map lives only where it IS the content
			// (lobby, results) — in-game stages keep the screen for the work.
			// The journey strip is the compact "you are here" that replaces it.
			//
			// Except in the deliberation, which is a whole game of its own and
			// carries its own HUD. Stacking the journey strip on top of it put
			// two "you are here" bars in a row, and the outer one was frozen on
			// the same station for the entire stage — pure chrome.
			const inDeliberation = session.stage === AgoraStage.deliberation;

			return m('.game', [
				...overlays,
				inDeliberation ? null : m(JourneyStrip, { stage: session.stage }),
				stageView,
			]);
		},
	};
}
