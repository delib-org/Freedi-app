import m from 'mithril';
import { t } from '../lib/i18n';
import { ensureUser } from '../lib/user';
import {
	listenToSession,
	stopListening,
	getSessionState,
	getSessionFlow,
	getStagePlan,
	getCurrentPlanIndex,
	getConsensusPool,
	reportStageProgress,
} from '../lib/session';
import { getTopicPackage, loadTopicPackage } from '../lib/topic';
import { stopValueAnswerListeners } from '../lib/values';
import { listenToNotifications, stopNotifications } from '../lib/notifications';
import {
	getDeliberationState,
	listenToDeliberation,
	stopDeliberationListeners,
} from '../lib/proposals';
import { listenToVoting, stopVotingListeners } from '../lib/voting';
import {
	INITIAL_STAGE_NAV,
	effectiveIndex,
	serializeStageNav,
	stageNavReduce,
	type StageNavEvent,
	type StageNavState,
} from '../lib/flows/stageNav';
import { ToastStack } from '../components/Toast';
import { NeedsBoard } from '../components/NeedsBoard';
import { CelebrationOverlay } from '../components/Celebration';
import { InstallHint } from '../components/InstallHint';
import { StageNav, planItemLabel } from '../components/StageNav';
import { CarriedContext } from '../components/CarriedContext';
import { ResultsBoard } from '../components/ResultsBoard';
import { StageTransition, hasStageTransition } from '../components/StageTransition';
import { LookSheet } from '../components/LookSheet';
import { seedsOf } from '../components/LookPicker';
import { buildLook, classLooks, wearLook } from '../lib/looks';
import { Lobby } from './Lobby';
import { SceneStage } from './SceneStage';
import { ValueIdentification } from './ValueIdentification';
import { Positioning } from './Positioning';
import { Deliberation } from './Deliberation';
import { QuestionStage } from './QuestionStage';
import { Voting } from './Voting';
import { Results } from './Results';
import { ReRate } from './ReRate';
import {
	AgoraSceneKind,
	AgoraSessionMode,
	AgoraStage,
	resolveAgoraTheme,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';

/**
 * Student game controller — renders the stage the player is looking at.
 *
 * The room's position comes from the session doc (single source of truth,
 * moved only by the advance callable). The player's position is their own:
 * `stageNav` lets them step back to any stage already opened and re-read it,
 * and is carried forward the moment the room advances. A stage that is not
 * the room's current one renders read-only — its outcome is already written.
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

function navKey(sessionId: string): string {
	return `agora_${sessionId}_viewing`;
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

function readStoredNav(sessionId: string): string | null {
	try {
		return sessionStorage.getItem(navKey(sessionId));
	} catch {
		return null;
	}
}

function storeNav(sessionId: string, state: StageNavState): void {
	try {
		sessionStorage.setItem(navKey(sessionId), serializeStageNav(state));
	} catch {
		// Storage refused: a refresh lands on the current stage, which is fine.
	}
}

export function GameController(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
	const sessionId = initialVnode.attrs.id;
	let userId = '';
	/** Last plan position rendered — a change plays the travel interstitial */
	let lastIndex: number | null = null;
	let transitionItem: AgoraStagePlanItem | null = null;
	let transitionLeaving = false;
	let transitionTimer: number | undefined;
	let transitionLeaveTimer: number | undefined;
	let nav: StageNavState = INITIAL_STAGE_NAV;
	let navRestored = false;
	/** The style sheet is open — a modal over whatever stage is on screen */
	let lookOpen = false;

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

	function dispatchNav(event: StageNavEvent): void {
		const next = stageNavReduce(nav, event, getStagePlan(), getCurrentPlanIndex());
		if (next !== nav) {
			nav = next;
			storeNav(sessionId, nav);
		}
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

			// A newer server opened a stage this bundle has never heard of. Not
			// a broken game — a stale tab; one reload and it knows the stage.
			if (error === 'outdated') {
				return m(
					'.shell',
					m(
						'.shell__content.text-center',
						{ style: { justifyContent: 'center', gap: 'var(--space-lg)' } },
						[
							m('h2', t('game.refresh_needed')),
							m(
								'button.btn.btn--primary.btn--lg',
								{ onclick: () => window.location.reload() },
								t('game.refresh_action'),
							),
						],
					),
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

			const plan = getStagePlan();
			const currentIndex = getCurrentPlanIndex();

			if (!navRestored) {
				navRestored = true;
				dispatchNav({ kind: 'restore', raw: readStoredNav(sessionId) });
			}

			// A stage change is a journey leg — play the travel card over the
			// incoming stage instead of hard-cutting, and carry the player to it
			// wherever they were looking. Keyed on the plan POSITION, not the
			// kind: two question stages in a row are two journeys. Never on
			// first render: a refresh lands directly where the class already is.
			if (currentIndex !== lastIndex) {
				if (lastIndex !== null) {
					dispatchNav({ kind: 'session-advanced' });
					const item = plan[currentIndex];
					if (item && hasStageTransition(item.stage)) beginStageTransition(item);
				}
				lastIndex = currentIndex;
			}

			const viewingIndex = effectiveIndex(plan, currentIndex, nav.viewingItemId);
			const item = plan[viewingIndex] ?? plan[currentIndex];
			const live = viewingIndex === currentIndex;

			// The look this screen wears, and the door to change it. A civic
			// square has no door: it wears Odyssey's colours by contract.
			const currentLook = resolveAgoraTheme(session, myParticipant);
			const canPickLook = session.sessionMode !== AgoraSessionMode.civic && myParticipant !== null;
			const lookDoor = canPickLook
				? {
						seeds: seedsOf(currentLook),
						label: t('look.open'),
						onOpen: () => {
							lookOpen = true;
						},
					}
				: undefined;
			const lookSheet =
				lookOpen && canPickLook
					? m(LookSheet, {
							current: currentLook,
							roomLook: resolveAgoraTheme(session, null),
							following: !myParticipant?.theme,
							classLooks: classLooks(participants, userId),
							myLook: myParticipant?.builtTheme
								? { name: myParticipant.builtTheme.name, seeds: myParticipant.builtTheme.seeds }
								: undefined,
							onWear: (choice) => void wearLook(choice),
							onBuild: (name, seeds) => void buildLook(name, seeds),
							onClose: () => {
								lookOpen = false;
							},
						})
					: null;

			const overlays = [
				m(ToastStack),
				m(CelebrationOverlay),
				m(InstallHint),
				lookSheet,
				transitionItem !== null
					? m(StageTransition, {
							stage: transitionItem.stage,
							title:
								transitionItem.stage === AgoraStage.question ? transitionItem.title : undefined,
							leaving: transitionLeaving,
						})
					: null,
			];

			const stageNav = m(StageNav, {
				plan,
				currentIndex,
				viewingIndex,
				onSelect: (itemId: string) => dispatchNav({ kind: 'select', itemId }),
				compact: item.stage === AgoraStage.deliberation && live,
				look: lookDoor,
			});

			const pastNotice = live
				? null
				: m('.stage-nav__past', [
						m('span', t('stagenav.past')),
						m(
							'button.btn.btn--sm.btn--secondary',
							{ onclick: () => dispatchNav({ kind: 'select', itemId: plan[currentIndex].itemId }) },
							t('stagenav.back_to_current', { stage: planItemLabel(plan[currentIndex]) }),
						),
					]);

			if (item.stage === AgoraStage.lobby) {
				return m('.game', [
					...overlays,
					stageNav,
					pastNotice,
					m(Lobby, {
						participants,
						myParticipant,
						onOpenLook: lookDoor?.onOpen,
					}),
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
			// who finished and when to advance — only for the stage the room is on
			const onProgress = (scenesDone: number, scenesTotal: number) => {
				if (userId && live) {
					reportStageProgress(sessionId, userId, item.stage, scenesDone, scenesTotal);
				}
			};

			/** A past deliberation, re-read: the board as it stood, no pen */
			const deliberationRecord = (): m.Children => {
				listenToDeliberation(sessionId, userId);
				const { proposals, scores } = getDeliberationState();

				return m('.shell', [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						m(CarriedContext, { session, beforeIndex: viewingIndex, defaultOpen: false }),
						m('.card.stack', [
							m(ResultsBoard, {
								sessionId: session.sessionId,
								topic,
								proposals,
								scores,
								census: getConsensusPool(),
								userId: myParticipant?.userId,
								finale: false,
							}),
						]),
					]),
				]);
			};

			const stageView = ((): m.Children => {
				switch (item.stage) {
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

					case AgoraStage.question: {
						if (!myParticipant) return noSeatYet();

						return m(QuestionStage, {
							session,
							item,
							planIndex: viewingIndex,
							myParticipant,
							userId,
							live,
						});
					}

					case AgoraStage.deliberation: {
						if (!myParticipant) return noSeatYet();
						if (!live) return deliberationRecord();

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
						 * Nobody enters the square without a side — unless the event
						 * runs without sides at all, or is a civic square whose camps
						 * come from the island (the join callable seats those).
						 */
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

						return m(Voting, { session, myParticipant, userId, readOnly: !live });
					}

					case AgoraStage.results:
					case AgoraStage.ended: {
						/**
						 * The closing question, for an event scored on whether the room
						 * came together — asked before the results, because the results
						 * ARE the answer. Once per person.
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
								[m('h2', t('lobby.get_ready')), m('p.lobby__status', String(item.stage))],
							),
						]);
				}
			})();

			return m('.game', [...overlays, stageNav, pastNotice, stageView]);
		},
	};
}
