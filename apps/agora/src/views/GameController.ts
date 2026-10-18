import { isProposalConfirmed } from '../lib/proposals';
import type { CouncilModel } from '../lib/flows/villageCouncil';
import {
	councilModelFor,
	councilNeedsVotes,
	papersFor,
	stationPapersFor,
} from '../lib/flows/villageModel';
import { getVotingState } from '../lib/voting';
import { readStoredNav, storeNav } from '../lib/stageNavStore';
import { sessionVillageMode } from '../lib/flows/sessionLinks';
import { villagePlace } from '../lib/flows/villageRoute';
import {
	TYPING_GRACE_MS,
	callTargetIndex,
	callTargetPlace,
	resolveSummons,
	type VillageCall,
} from '../lib/flows/summons';
import { readHandledCall, storeHandledCall } from '../lib/summonsStore';
import { callPlaceLabel } from '../components/VillageShell';
import { CallBanner } from '../components/CallBanner';
import { addInboxItem } from '../lib/inbox';
import { registerPlaceNavigator, unregisterPlaceNavigator } from '../lib/helpedFocus';
import m from 'mithril';
import { ExplainHint } from '../components/ExplainHint';
import { iconLabel } from '../components/Icon';
import { canWriteStage } from '../lib/flows/stageAccess';
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
	reportWhereabouts,
} from '../lib/session';
import { getTopicPackage, loadTopicPackage } from '../lib/topic';
import { stopValueAnswerListeners } from '../lib/values';
import { listenToNotifications, stopNotifications } from '../lib/notifications';
import {
	hasTeacherThread,
	listenToTeacherThread,
	markTeacherThreadSeen,
	stopTeacherThread,
	teacherThreadUnread,
} from '../lib/teacherThread';
import { registerTeacherNavigator, unregisterTeacherNavigator } from '../lib/helpedFocus';
import { initInbox } from '../lib/inbox';
import { TeacherThreadSheet } from '../components/TeacherThreadSheet';
import {
	getDeliberationState,
	listenToDeliberation,
	stopDeliberationListeners,
} from '../lib/proposals';
import { listenToVoting, stopVotingListeners } from '../lib/voting';
import {
	INITIAL_STAGE_NAV,
	effectiveIndex,
	stageNavReduce,
	type StageNavEvent,
	type StageNavState,
} from '../lib/flows/stageNav';
import { ToastStack } from '../components/Toast';
import { NeedsBoard } from '../components/NeedsBoard';
import { CelebrationOverlay } from '../components/Celebration';
import { StageNav, planItemLabel } from '../components/StageNav';
import { VillageMoreSheet } from '../components/VillageMoreSheet';
import {
	isLightWorld,
	isVillageSoundOn,
	setLightWorld,
	setVillagePalette,
	setVillageSound,
	villagePalette,
	setVillageViewPreference,
	villageViewPreference,
	type VillageView,
} from '../lib/villagePrefs';
import { CarriedContext } from '../components/CarriedContext';
import { ResultsBoard } from '../components/ResultsBoard';
import { StageTransition, hasStageTransition } from '../components/StageTransition';
import { prefetchFilm } from '../components/OpeningFilm';
import { openingFilmOf, playsOpeningFilm, type OpeningFilm } from '../lib/flows/openingFilm';
import { needsQuestionOf, planHasCast, scenarioCast } from '../lib/flows/scenarioCast';
import { councilVoices } from '../lib/flows/councilVoices';
import { LookSheet } from '../components/LookSheet';
import { seedsOf } from '../components/LookPicker';
import { buildLook, classLooks, wearLook } from '../lib/looks';
import { Lobby } from './Lobby';
import { SceneStage } from './SceneStage';
import { isLibraryVideoLive } from '../lib/flows/libraryVideo';
import { ValueIdentification } from './ValueIdentification';
import { Positioning } from './Positioning';
import { Deliberation } from './Deliberation';
import { QuestionStage } from './QuestionStage';
import { RoundStage } from './RoundStage';
import { liveNoteNews } from '../components/VillageCommunity';
import { visibleStationNotes } from '../lib/hands';
import { boardNews } from '../lib/flows/noteNews';
import { VillageShell } from '../components/VillageShell';
import { Voting } from './Voting';
import { Results } from './Results';
import { RemovedScreen } from './RemovedScreen';
import { ReRate } from './ReRate';
import {
	AgoraSceneKind,
	AgoraSessionMode,
	AgoraStage,
	removalOf,
	resolveAgoraTheme,
	roundSpecOf,
	type AgoraStagePlanItem,
} from '@freedi/shared-types';

/**
 * Student game controller — renders the stage the player is looking at.
 *
 * The room's position comes from the session doc (single source of truth,
 * moved only by the advance callable). The player's position is their own:
 * `stageNav` lets them step back to any stage already opened and catch up.
 * Earlier questions remain writable until the session finishes;
 * their carried summaries remain the record made when the class moved on.
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
	let villageWriteRequest = 0;
	/**
	 * This device's world, when it chose one: the 3D village or the simple
	 * view. Remembered per device (`villagePrefs`), so a refresh keeps the
	 * choice — and the way back to the village is always on the simple view,
	 * the lobby included; a world that failed to load is retried on that
	 * press and, failing again, says so instead of trapping anyone.
	 */
	const savedView = villageViewPreference();
	let villageOverride: boolean | undefined =
		savedView === null ? undefined : savedView === 'village';
	/** How many times the world was asked for on this screen — a retry wears a plainer notice */
	let villageAttempts = 0;

	function chooseView(view: VillageView): void {
		villageOverride = view === 'village';
		setVillageViewPreference(view);
		if (view === 'village') villageAttempts++;
	}
	let userId = '';
	/** Last plan position rendered — a change plays the travel interstitial */
	let lastIndex: number | null = null;
	let transitionItem: AgoraStagePlanItem | null = null;
	let transitionLeaving = false;
	let transitionTimer: number | undefined;
	let transitionLeaveTimer: number | undefined;
	/** The opening film, while it is the travel card: it ends itself, or someone skips it */
	let transitionFilm: OpeningFilm | null = null;
	let nav: StageNavState = INITIAL_STAGE_NAV;
	let navRestored = false;
	/** This device was showing the removed screen: a missing seat now means "on its way back" */
	let wasRemoved = false;
	/** The style sheet is open — a modal over whatever stage is on screen */
	let lookOpen = false;
	/** The village's gear sheet: style, sounds, world quality, the flat view */
	let moreOpen = false;
	/** The teacher's thread is open — reachable from every stage, toast or not */
	let teacherOpen = false;

	function openTeacherThread(): void {
		teacherOpen = true;
		markTeacherThreadSeen();
		m.redraw();
	}

	registerTeacherNavigator(openTeacherThread);

	/**
	 * The teacher's call (`lib/flows/summons.ts`). The newest stamp this
	 * device answered is kept per session, so a reload never walks twice and
	 * a call met late — a locked phone, a background tab, a late joiner — is
	 * still an order. The walk itself is one `act()`: the called item comes on
	 * screen at once in either world (the 3D walk is the picture of it, never
	 * the condition for it), the travel card says who is calling and where,
	 * and the phone reports its whereabouts so the teacher sees arrivals.
	 */
	let handledAt: number | undefined = readHandledCall(sessionId);
	/** The call the village is walking — handed to the shell, once per stamp */
	let activeCall: VillageCall | undefined;
	/** A call held for a student mid-sentence: the bar counts down to the walk */
	let pendingCall: { call: VillageCall; until: number; extended: boolean } | null = null;
	let pendingTimer: number | undefined;
	/** The card over the screen while the class is called somewhere */
	let callCard: { place: string; item: AgoraStagePlanItem } | null = null;

	/** A student with words in the box that are not sent yet */
	function isTypingAnswer(): boolean {
		const active = document.activeElement;

		return active instanceof HTMLTextAreaElement && active.value.trim().length > 0;
	}

	function markHandled(at: number): void {
		if (handledAt !== undefined && at <= handledAt) return;
		handledAt = at;
		storeHandledCall(sessionId, at);
	}

	function stopPending(): void {
		window.clearInterval(pendingTimer);
		pendingTimer = undefined;
		pendingCall = null;
	}

	/** Walk now: the item on screen, the card, the whereabouts, the village's walk */
	function act(call: VillageCall): void {
		stopPending();
		markHandled(call.at);
		const plan = getStagePlan();
		const currentIndex = getCurrentPlanIndex();
		const place = callTargetPlace(call.place, plan, currentIndex);
		const index = callTargetIndex(call.place, plan, currentIndex);
		if (index >= 0) {
			dispatchNav({ kind: 'select', itemId: plan[index].itemId });
			beginStageTransition(plan[index]);
			callCard = { place, item: plan[index] };
		}
		activeCall = { place, at: call.at };
		if (userId) reportWhereabouts(sessionId, userId, place, call.at);
		m.redraw();
	}

	/** Hold the walk for a student mid-sentence; the bar counts the grace down */
	function hold(call: VillageCall): void {
		pendingCall = { call, until: Date.now() + TYPING_GRACE_MS, extended: false };
		window.clearInterval(pendingTimer);
		pendingTimer = window.setInterval(() => {
			if (!pendingCall) return;
			if (Date.now() >= pendingCall.until) act(pendingCall.call);
			else m.redraw();
		}, 1000);
	}

	/** A call tapped in the post box: walk there again, as a call of its own */
	function goToPlace(place: string): void {
		act({ place, at: Date.now() });
	}

	registerPlaceNavigator(goToPlace);

	// A phone that comes back — the screen unlocked, the tab in front, the
	// network up — re-reads the room at once instead of at its next tap
	const wake = (): void => {
		m.redraw();
	};
	document.addEventListener('visibilitychange', wake);
	window.addEventListener('online', wake);
	window.addEventListener('pageshow', wake);

	/** Fade the travel card out, then take it away */
	function endStageTransition(): void {
		window.clearTimeout(transitionTimer);
		window.clearTimeout(transitionLeaveTimer);
		transitionLeaving = true;
		m.redraw();
		transitionLeaveTimer = window.setTimeout(() => {
			transitionItem = null;
			transitionFilm = null;
			m.redraw();
		}, 400);
	}

	/**
	 * The travel card between journey legs. Into the story it is the scenario's
	 * opening film (when it has one): full screen, until it ends or is skipped.
	 */
	function beginStageTransition(item: AgoraStagePlanItem, film: OpeningFilm | null = null): void {
		const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		transitionItem = item;
		transitionFilm = film;
		transitionLeaving = false;
		window.clearTimeout(transitionTimer);
		window.clearTimeout(transitionLeaveTimer);
		if (film) return;
		transitionTimer = window.setTimeout(endStageTransition, reduced ? 900 : 1900);
	}

	/** The film for a stage the teacher just opened, if this scenario has one */
	function filmFor(item: AgoraStagePlanItem): OpeningFilm | null {
		if (!playsOpeningFilm(item.stage)) return null;

		return openingFilmOf(
			getTopicPackage(getSessionState().session?.topicPackageId ?? '') ?? undefined,
		);
	}

	/** The library shelf's "watch again": the film, on demand, over the village */
	function replayFilm(): void {
		const item = getStagePlan().find((candidate) => playsOpeningFilm(candidate.stage));
		const film = item ? filmFor(item) : null;
		if (item && film) beginStageTransition(item, film);
		m.redraw();
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
			stopPending();
			document.removeEventListener('visibilitychange', wake);
			window.removeEventListener('online', wake);
			window.removeEventListener('pageshow', wake);
			stopListening();
			stopTeacherThread();
			unregisterTeacherNavigator(openTeacherThread);
			unregisterPlaceNavigator(goToPlace);
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
				// The teacher may write on any stage, and the post box must already
				// be bound to the session when their first note is filed
				listenToTeacherThread(sessionId, userId);
				initInbox(sessionId);
			}

			const { session, participants, myParticipant, participantsLoaded, loading, error } =
				getSessionState();
			const villageMode = sessionVillageMode(
				session?.world,
				window.location.search,
				villageOverride,
			);
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

			// The teacher took this login out of the lesson. A calm screen, not
			// an error: no stage renders behind it, so nothing on this device
			// tries to write (the rules would refuse it anyway). It is also where
			// the student waits after knocking, and where the teacher's "yes"
			// lands: the entry leaves the session and the seat comes back.
			const removal = removalOf(session, userId);
			if (removal) {
				wasRemoved = true;

				return m(RemovedScreen, {
					removal,
					onAsk: () => m.route.set(`/join/${session.code}`),
					onLeave: () => m.route.set('/'),
				});
			}
			// Let back in: the entry left with the session snapshot, the seat
			// arrives with the participants one — wait for it, never flash "no seat"
			if (wasRemoved && !myParticipant) {
				return m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
			}

			const plan = getStagePlan();
			const currentIndex = getCurrentPlanIndex();

			if (!navRestored) {
				navRestored = true;
				dispatchNav({ kind: 'restore', raw: readStoredNav(sessionId) });
			}

			// Who moves the class: the teacher (the room walks as one) or, in a
			// free lesson, each student between the stations the room has opened
			const led = (session.villageNavigation ?? 'teacher') === 'teacher';

			// A stage change is a journey leg — play the travel card over the
			// incoming stage. Led, everyone goes, a student who had stepped back
			// included; free, a student catching up keeps their station. Keyed on
			// the plan POSITION, not the kind: two question stages in a row are
			// two journeys. Never on first render: a refresh lands directly where
			// the class already is.
			if (currentIndex !== lastIndex) {
				if (lastIndex !== null) {
					dispatchNav({ kind: 'session-advanced', led });
					const item = plan[currentIndex];
					if (nav.viewingItemId === null && item && hasStageTransition(item.stage))
						beginStageTransition(item, filmFor(item));
					// A call held for a typist is over once the class moved on
					if (pendingCall) stopPending();
				}
				lastIndex = currentIndex;
			}

			// The teacher's call: a standing order until a newer one or a new
			// station supersedes it. Judged by stamps this device remembers,
			// never by the call's age — the students a call is for are exactly
			// the ones who meet it late. It lands in the post box too, so the
			// way back is one tap after any detour.
			const liveCall = session.villageCall;
			const summons = resolveSummons({
				call: liveCall,
				currentOpenedAt: session.stageState?.[plan[currentIndex]?.itemId ?? '']?.openedAt,
				handledAt,
			});
			if (summons?.kind === 'retire') markHandled(summons.at);
			if (summons?.kind === 'walk' && pendingCall?.call.at !== summons.at) {
				const place = callTargetPlace(summons.place, plan, currentIndex);
				addInboxItem({
					id: `call-${summons.at}`,
					trigger: 'agora_called_to',
					target: { kind: 'place', place },
					detail: callPlaceLabel(place, plan, currentIndex),
				});
				if (isTypingAnswer()) hold({ place: summons.place, at: summons.at });
				else act({ place: summons.place, at: summons.at });
			}
			const call = activeCall;

			const viewingIndex = effectiveIndex(plan, currentIndex, nav.viewingItemId);
			const item = plan[viewingIndex] ?? plan[currentIndex];
			const live = viewingIndex === currentIndex;
			const writable = canWriteStage(session, item.itemId);
			// Where this screen stands, for the teacher's "who has arrived" —
			// once per station; a call's own report carries its stamp
			if (userId && myParticipant && item.stage !== AgoraStage.lobby) {
				reportWhereabouts(
					sessionId,
					userId,
					villagePlace(item),
					activeCall && activeCall.place === villagePlace(item) ? activeCall.at : undefined,
				);
			}

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
								? {
										name: myParticipant.builtTheme.name,
										seeds: myParticipant.builtTheme.seeds,
										font: myParticipant.builtTheme.font,
									}
								: undefined,
							onWear: (choice) => void wearLook(choice),
							onBuild: (name, seeds, font) => void buildLook(name, seeds, font),
							onClose: () => {
								lookOpen = false;
							},
						})
					: null;

			const overlays = [
				m(ToastStack),
				m(CelebrationOverlay),
				lookSheet,
				moreOpen && villageMode
					? m(VillageMoreSheet, {
							look: lookDoor,
							sound: isVillageSoundOn(),
							onSound: (on: boolean) => {
								setVillageSound(on);
							},
							lightMode: isLightWorld(),
							onLightMode: (on: boolean) => {
								setLightWorld(on);
							},
							palette: villagePalette(),
							onPalette: (palette) => {
								setVillagePalette(palette);
							},
							onSimpleView: () => {
								chooseView('flat');
							},
							onClose: () => {
								moreOpen = false;
							},
						})
					: null,
				teacherOpen
					? m(TeacherThreadSheet, {
							sessionId,
							onClose: () => {
								teacherOpen = false;
								markTeacherThreadSeen();
							},
						})
					: null,
				transitionItem !== null
					? m(StageTransition, {
							stage: transitionItem.stage,
							title:
								transitionItem.stage === AgoraStage.question
									? planItemLabel(transitionItem)
									: undefined,
							leaving: transitionLeaving,
							film: transitionFilm
								? { film: transitionFilm, wall: false, onDone: endStageTransition }
								: undefined,
							call:
								callCard && callCard.item === transitionItem
									? {
											kicker: t('call.card_kicker'),
											line: t('village.called_to', {
												place: callPlaceLabel(callCard.place, plan, currentIndex),
											}),
										}
									: undefined,
						})
					: null,
				pendingCall
					? m(CallBanner, {
							place: callPlaceLabel(
								callTargetPlace(pendingCall.call.place, plan, currentIndex),
								plan,
								currentIndex,
							),
							secondsLeft: Math.max(0, Math.ceil((pendingCall.until - Date.now()) / 1000)),
							onGo: () => act(pendingCall?.call ?? { place: 'current', at: Date.now() }),
							onMoreTime: pendingCall.extended
								? undefined
								: () => {
										if (!pendingCall) return;
										pendingCall = {
											...pendingCall,
											until: Date.now() + TYPING_GRACE_MS,
											extended: true,
										};
									},
						})
					: null,
			];

			const stageNav = m(StageNav, {
				plan,
				currentIndex,
				viewingIndex,
				onSelect: (itemId: string) => dispatchNav({ kind: 'select', itemId }),
				compact: item.stage === AgoraStage.deliberation && live,
				// One door at the end of the strip, not three. In the village the
				// gear holds the style, and the teacher's post is in the envelope
				// with the rest of the mail.
				look: villageMode ? undefined : lookDoor,
				menu: villageMode
					? {
							onOpen: () => {
								moreOpen = true;
							},
							label: t('village.more.open'),
							open: moreOpen,
						}
					: undefined,
				mail:
					!villageMode && hasTeacherThread()
						? {
								unread: teacherThreadUnread(),
								onOpen: openTeacherThread,
								label: t('teacherThread.open'),
							}
						: undefined,
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

			// The simple view's door back to the village — on every screen the
			// simple view has, the lobby included. In the village the way to the
			// simple view is a row in the gear sheet, so this slot is an empty
			// hole there: the SAME five children in every branch, or the 3D world
			// remounts and the walker jumps back to the fountain.
			const viewToggle = villageMode
				? null
				: m(
						'button.btn.btn--secondary.btn--sm.village-mode-toggle',
						{
							onclick: () => {
								chooseView('village');
							},
							'aria-pressed': 'false',
						},
						t('village.enter_3d'),
					);

			if (item.stage === AgoraStage.lobby) {
				// The village's first station needs the topic: fetch it while the class
				// waits, so moving on does not swap the 3D world for a loading spinner.
				// (The opening film is warmed up in the same wait, so it starts on a frame.)
				loadTopicPackage(session.topicPackageId, session.sessionId);
				const lobbyFilm = openingFilmOf(getTopicPackage(session.topicPackageId) ?? undefined);
				if (lobbyFilm) prefetchFilm(lobbyFilm.url);

				// The same slots as the stage screens below — overlays as ONE slot, and
				// an empty one where they carry the view toggle — so the village sits in
				// the same place and survives the move from the lobby. Mithril matches
				// unkeyed children by position: a shifted village is a new village, and
				// its 3D world reloads (the walker jumps back to the fountain).
				return m('.game', [
					overlays,
					stageNav,
					pastNotice,
					viewToggle,
					villageMode
						? m(
								VillageShell,
								{
									plan,
									currentIndex,
									viewingIndex,
									writable,
									papers: [],
									navigation: session.villageNavigation ?? 'teacher',
									call,
									retry: villageAttempts > 0,
								},
								m(Lobby, { participants, myParticipant, onOpenLook: lookDoor?.onOpen }),
							)
						: m(Lobby, { participants, myParticipant, onOpenLook: lookDoor?.onOpen }),
				]);
			}

			// Every stage past the lobby needs the topic package
			const topic = getTopicPackage(session.topicPackageId);
			if (!topic) {
				loadTopicPackage(session.topicPackageId, session.sessionId);
				const spinner = m(
					'.shell',
					m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
				);
				// In the village the world keeps standing, in its slot, while the topic loads.
				if (villageMode) {
					return m('.game', [
						overlays,
						stageNav,
						pastNotice,
						null,
						m(
							VillageShell,
							{
								plan,
								currentIndex,
								viewingIndex,
								writable,
								papers: [],
								navigation: session.villageNavigation ?? 'teacher',
								call,
								retry: villageAttempts > 0,
							},
							spinner,
						),
					]);
				}

				return spinner;
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
							m('.hint-line', [
								m('p.lobby__status.hint-line__text', iconLabel('lock', t('game.no_seat_body'), 18)),
								m(ExplainHint, { text: t('game.no_seat_why') }),
							]),
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

			// A stale start (an old stamp) is history: it never auto-plays on a late phone
			const liveLibraryVideo = isLibraryVideoLive(session.libraryVideo, Date.now())
				? session.libraryVideo
				: undefined;
			const materialsRef = { topicPackageId: session.topicPackageId, sessionId, userId };
			// The scenario's two characters stand in the village; with them there,
			// the study house reports what the class has heard, not the shelf's books
			const openingFilm = openingFilmOf(topic);
			const cast = villageMode && planHasCast(plan) ? scenarioCast(topic) : [];
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
			const sceneProgress = cast.length > 0 ? undefined : onProgress;

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
							allowReplay: villageMode,
							scenes: scenesOf(
								AgoraSceneKind.intro,
								AgoraSceneKind.timeTunnel,
								AgoraSceneKind.periodExplainer,
							),
							storageKey: `agora_${sessionId}_framing`,
							onProgress,
							classVideo: liveLibraryVideo,
							materials: materialsRef,
						});

					case AgoraStage.perspectives:
						return m(SceneStage, {
							allowReplay: villageMode,
							scenes: scenesOf(AgoraSceneKind.perspectiveA, AgoraSceneKind.perspectiveB),
							storageKey: `agora_${sessionId}_perspectives`,
							onProgress: sceneProgress,
							classVideo: liveLibraryVideo,
							materials: materialsRef,
						});

					case AgoraStage.needs:
						return m(SceneStage, {
							allowReplay: villageMode,
							scenes: scenesOf(
								AgoraSceneKind.needsQuestion,
								AgoraSceneKind.needsA,
								AgoraSceneKind.needsB,
							),
							storageKey: `agora_${sessionId}_needs`,
							// Both sides' needs stay on screen for re-reading while
							// the class finishes the scenes
							epilogue: m(NeedsBoard, { topic }),
							onProgress: sceneProgress,
							classVideo: liveLibraryVideo,
							materials: materialsRef,
						});

					case AgoraStage.valueIdentification:
						return m(ValueIdentification, { sessionId, userId, topic });

					case AgoraStage.positioning:
						return myParticipant ? m(Positioning, { topic, myParticipant }) : noSeatYet();

					case AgoraStage.question: {
						if (!myParticipant) return noSeatYet();

						return m(roundSpecOf(item) ? RoundStage : QuestionStage, {
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
								allowReplay: villageMode,
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

						return m(Deliberation, {
							session,
							myParticipant,
							userId,
							topic,
							writeRequest: villageWriteRequest,
							inVillage: villageMode,
						});
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

			/**
			 * What the council's wooden scoreboard shows: the class map while the
			 * room writes and rates, the ballot with its bars once the vote is
			 * open, the closed ballot after. It follows the ROOM's stage, not the
			 * one the player stepped back to — the board stands in the village.
			 */
			const council = ((): CouncilModel | undefined => {
				if (!villageMode) return undefined;
				if (councilNeedsVotes(plan, currentIndex) && userId) {
					listenToVoting(sessionId, session.challengeQuestionId, userId);
				}
				const votes = getVotingState();
				const { proposals, scores, characterReviews } = getDeliberationState();

				return councilModelFor({
					plan,
					currentIndex,
					session,
					votes: {
						selections: votes.selections,
						myVoteStatementId: votes.myVoteStatementId,
						votedCount: votes.voterUids.size,
					},
					proposals,
					scores,
					userId,
					classSize: participants.length,
					leftLabel: topic.positioningScale.leftLabel,
					rightLabel: topic.positioningScale.rightLabel,
					// The characters' existing verdicts, two portrait tiles per proposal
					voicesOf:
						cast.length > 0
							? (statementId: string) => councilVoices(statementId, cast, characterReviews)
							: undefined,
				});
			})();

			// Same slots as the lobby above (overlays as one slot): the village keeps its place.
			return m('.game', [
				overlays,
				stageNav,
				pastNotice,
				// In the village the way back to the flat view is a row in the gear
				// sheet, so this slot is an empty hole — the SAME five children as
				// the lobby branch above, or the 3D world remounts and the walker
				// jumps back to the fountain.
				viewToggle,
				villageMode
					? m(
							VillageShell,
							{
								plan,
								currentIndex,
								viewingIndex,
								writable,
								council,
								navigation: session.villageNavigation ?? 'teacher',
								call,
								retry: villageAttempts > 0,
								// The replies to my note and the owners' answers to mine both
								// live behind the board door, so that is the door that lights
								news: myParticipant
									? { board: boardNews(liveNoteNews, visibleStationNotes(item), userId) }
									: undefined,
								community: myParticipant
									? {
											session,
											userId,
											anonName: myParticipant.anonName,
											points: myParticipant.points.total,
											teacher: hasTeacherThread()
												? {
														label: t('teacherThread.open'),
														unread: teacherThreadUnread(),
														onOpen: openTeacherThread,
													}
												: undefined,
											scoreboard: {
												topic,
												leadStatementId: session.classScore?.leadStatementId,
												goalOnly: session.votingSettings?.goalZoneOnly === true,
											},
										}
									: undefined,
								cast,
								castQuestion: needsQuestionOf(topic),
								castStorageKey: `agora_${sessionId}_cast`,
								onCastProgress: onProgress,
								film: openingFilm ? { title: openingFilm.title, onReplay: replayFilm } : undefined,
								onLeaveVillage: () => {
									chooseView('flat');
								},
								onWrite: () => {
									villageWriteRequest++;
								},
								onSelectBook: (itemId: string) => dispatchNav({ kind: 'select', itemId }),
								papers: papersFor(visibleStationNotes(item), userId, isProposalConfirmed),
								stationPapers: stationPapersFor(plan, currentIndex, visibleStationNotes, userId),
							},
							stageView,
						)
					: stageView,
			]);
		},
	};
}
