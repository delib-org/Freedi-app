import m from 'mithril';
import { t } from '../lib/i18n';
import { ensureUser } from '../lib/user';
import {
	listenToSession,
	stopListening,
	getSessionState,
	reportStageProgress,
} from '../lib/session';
import { getTopicPackage, loadTopicPackage } from '../lib/topic';
import { stopValueAnswerListeners } from '../lib/values';
import { listenToNotifications, stopNotifications } from '../lib/notifications';
import { stopDeliberationListeners } from '../lib/proposals';
import { ToastStack } from '../components/Toast';
import { NeedsBoard } from '../components/NeedsBoard';
import { CelebrationOverlay } from '../components/Celebration';
import { JourneyStrip } from '../components/JourneyStrip';
import { StageTransition, hasStageTransition } from '../components/StageTransition';
import { Lobby } from './Lobby';
import { SceneStage } from './SceneStage';
import { ValueIdentification } from './ValueIdentification';
import { Positioning } from './Positioning';
import { Deliberation } from './Deliberation';
import { Results } from './Results';
import { AgoraSceneKind, AgoraStage } from '@freedi/shared-types';

/**
 * Student game controller — routes the current view from the session doc's
 * stage (single source of truth). Scene stages are student-paced within
 * the teacher-controlled session stage.
 */
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

					case AgoraStage.deliberation:
						return myParticipant
							? m(Deliberation, { session, myParticipant, userId, topic })
							: noSeatYet();

					case AgoraStage.results:
					case AgoraStage.ended:
						// myParticipant carries the student's own ledger — the game
						// announces every +1 and +2 during play and this is the only
						// screen allowed to total them up
						return m(Results, { session, topic, myParticipant });

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
			return m('.game', [...overlays, m(JourneyStrip, { stage: session.stage }), stageView]);
		},
	};
}
