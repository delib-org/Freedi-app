import { sessionVillageMode, sessionJoinUrl } from '../../lib/flows/sessionLinks';
import m from 'mithril';
import { Icon } from '../../components/Icon';
import { t } from '../../lib/i18n';
import { ensureUser } from '../../lib/user';
import {
	listenToSession,
	stopListening,
	getSessionState,
	getStagePlan,
	getCurrentPlanIndex,
} from '../../lib/session';
import { advanceStage, setBallotGoalOnly, updateStagePlan } from '../../lib/callables';
import { activeHandSize } from '../../lib/hands';
import {
	getDeliberationState,
	listenToDeliberation,
	stopDeliberationListeners,
} from '../../lib/proposals';
import { Results } from '../Results';
import { Voting } from '../Voting';
import { TeacherInstructions } from './TeacherInstructions';
import { StagePlanEditor } from './StagePlanEditor';
import { TeacherNav, type TeacherNavMenuItem } from '../../components/TeacherNav';
import { Collapsible } from '../../components/Collapsible';
import { TeacherStrip, type StripAction } from './TeacherStrip';
import { nowCard } from './NowCard';
import { TeacherPanel } from './TeacherPanel';
import { ClassView } from './ClassView';
import { MoveClassSheet } from './MoveClassSheet';
import { classProgress } from '../../lib/flows/classProgress';
import type { VillageCallPlace } from '../../lib/flows/villageRoute';
import {
	ADVANCE_TIMEOUT_MS,
	INITIAL_ADVANCE_LATCH,
	QUIET_LINE_MS,
	advanceReduce,
	type AdvanceEvent,
} from '../../lib/flows/advanceLatch';
import { countedSteps, teacherStepLabel } from '../../lib/teacherSteps';
import { loadTeacherNav, navClass } from '../../lib/teacherNav';
import { DeviceRoleSheet } from './DeviceRoleSheet';
import { getDeviceRole, setDeviceRole } from '../../lib/deviceRole';
import {
	ARM_MS,
	decideDeviceRole,
	nextNeedsArming,
	type DeviceRole,
} from '../../lib/flows/deviceRole';
import { getTopicPackage, loadTopicPackage } from '../../lib/topic';
import { CountdownTimer } from '../../components/CountdownTimer';
import { LookPicker } from '../../components/LookPicker';
import { classLooks } from '../../lib/looks';
import {
	roundSpecOf,
	AgoraSessionMode,
	AgoraStage,
	AgoraThemeChoice,
	resolveAgoraTheme,
	AgoraStagePlanItem,
	ChallengePhase,
	VotingStageSettings,
} from '@freedi/shared-types';
import {
	callVillage,
	classLabel,
	setSessionTheme,
	setVillageNavigation,
	setVotingSettings,
} from '../../lib/teacher';
import { getVotingState, listenToVoting, stopVotingListeners } from '../../lib/voting';
import {
	endRound,
	getGame,
	nextSpeaker,
	openChallengeVote,
	openFloor,
	resolveChallengeTurn,
	skipSpeaker,
	startRound,
} from '../../lib/votingGame';
import {
	challengeTurnCard,
	votingLiveCard,
	votingSettingsCard,
	type ChallengeActions,
} from './VotingCards';
import { questionPanel, roundPanel, triggerLine } from './DeliberationCards';
import { liveWeighings } from '../../lib/flows/liveTally';
import { ClassPanel, progressFacts } from './ClassPanel';
import { MessagesPanel } from './MessagesPanel';
import { StudentThreadDrawer } from './StudentThreadDrawer';
import {
	listenToTeacherConsole,
	realNameOf,
	stopTeacherConsole,
	unreadRepliesTotal,
} from '../../lib/teacherConsole';

/** The console's side panels: the class, what the class wrote, the settings, the move-class sheet */
type Panel = 'class' | 'texts' | 'settings' | 'move';

/** The board, or the room as the students see it */
type ConsoleView = 'board' | 'class';

/** Which view this device opened last — a phone in hand tends to want the class view, a laptop the board */
const VIEW_KEY = 'agora.teacher.view';

function rememberedView(): ConsoleView | null {
	try {
		const view = localStorage.getItem(VIEW_KEY);

		return view === 'class' || view === 'board' ? view : null;
	} catch {
		return null;
	}
}

function rememberView(view: ConsoleView): void {
	try {
		localStorage.setItem(VIEW_KEY, view);
	} catch {
		// A forgotten preference costs one tap next time
	}
}

/**
 * The teacher's console — one screen.
 *
 * The header carries the join code; a strip under it says which step the
 * room is on and holds the one button that opens the next; the board below
 * is what is happening now (who has finished, who has not), the stage's own
 * card, and — folded away — the words the students are reading. The class
 * list, the texts and the settings open as a panel over the board, so the
 * button never leaves the screen while the teacher answers a student.
 *
 * Which stage is next comes from the session's resolved plan — the same
 * array the advance callable walks — so the button offered is always one the
 * server will open.
 */

export function TeacherSession(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
	const sessionId = initialVnode.attrs.id;
	/**
	 * NEXT's state, for a teacher holding two devices: a press in flight, a
	 * refusal, or a move the other hand made (the quiet line, not an alert).
	 */
	let latch = INITIAL_ADVANCE_LATCH;
	let advanceTimer: number | undefined;
	let quietTimer: number | undefined;
	/** The last call stamp this device has seen on the session doc */
	let seenCallAt: number | undefined;
	/** A call the teacher's other device made — the strip's quiet line, in the teacher's words */
	let calledElsewhere = '';
	let savingSettings = false;
	let challenging = false;
	let savingLook = false;
	let savingNavigation = false;
	let goalOnlyError = '';
	let callingVillage = false;
	let villageCallSent = false;
	let userId = '';
	/** A wall asked to show names: the confirm is open */
	let roleConfirm = false;
	/** On a wall NEXT is armed by its first tap until this clock, and fires on the second */
	let armedUntil = 0;
	let armTimer: number | undefined;
	const coarsePointer = window.matchMedia('(pointer: coarse)');

	function chooseRole(role: DeviceRole): void {
		setDeviceRole(role);
		roleConfirm = false;
		m.redraw();
	}
	let editingPlan: AgoraStagePlanItem[] | null = null;
	/** Which panel is over the board, if any — one at a time */
	let panel: Panel | null = null;
	/** What opened the panel, so closing it hands focus back */
	let panelOpener: HTMLElement | null = null;
	/** The students' own words, folded away; unfolds per stage, refolds on the next */
	let peekOpen = false;
	let peekStage: string | null = null;
	let savingPlan = false;
	let planSaveFailed = false;
	/** The student whose private thread is open beside the console, and which text it is about */
	let drawerUid: string | null = null;
	let drawerAbout: string | undefined;
	let projectorLinkCopied = false;
	/** The class view: the same console, the same listeners, the room as the students see it */
	const boardRoute = `/teach/session/${sessionId}`;
	const classRoute = `${boardRoute}/class`;
	/** ≤600px the strip is a director row inside the village's bar, not the fixed bottom bar */
	const phoneQuery = window.matchMedia('(max-width: 600px)');
	let phone = phoneQuery.matches;
	const onPhoneChange = (event: MediaQueryListEvent): void => {
		phone = event.matches;
		m.redraw();
	};
	phoneQuery.addEventListener('change', onPhoneChange);

	function inClassView(): boolean {
		return m.route.get().split('?')[0] === classRoute;
	}

	/** Flip the view. Both routes render this same keyed component, so the listeners survive. */
	function showView(view: ConsoleView): void {
		rememberView(view);
		m.route.set(view === 'class' ? classRoute : boardRoute);
	}

	function openDrawer(studentUid: string, aboutStatementId?: string): void {
		drawerUid = studentUid;
		drawerAbout = aboutStatementId;
	}

	function openPanel(next: Panel, opener?: EventTarget | null): void {
		if (panel === next) {
			closePanel();

			return;
		}
		panel = next;
		panelOpener = opener instanceof HTMLElement ? opener : null;
	}

	function closePanel(): void {
		panel = null;
		const opener = panelOpener;
		panelOpener = null;
		// After Mithril has removed the panel, not before
		window.setTimeout(() => opener?.focus(), 0);
	}

	function copyProjectorLink(): void {
		void navigator.clipboard?.writeText(projectorUrl()).then(() => {
			projectorLinkCopied = true;
			m.redraw();
			window.setTimeout(() => {
				projectorLinkCopied = false;
				m.redraw();
			}, 2000);
		});
	}

	function openProjector(): void {
		window.open(projectorUrl(), '_blank', 'noopener');
	}

	/** The projector: a second tab (or a classroom PC) showing what the students see */
	function projectorUrl(): string {
		return `${window.location.origin}/#!/teach/screen/${sessionId}`;
	}

	/** The goal switch during the vote — the server redraws the ballot and withdraws orphaned votes */
	function setGoalOnlyLive(next: boolean): void {
		if (savingSettings) return;
		savingSettings = true;
		goalOnlyError = '';
		setBallotGoalOnly({ sessionId, goalZoneOnly: next })
			.catch((error: unknown) => {
				console.error('[Teacher] Redrawing the ballot from the goal failed:', error);
				const message = error instanceof Error ? error.message : '';
				goalOnlyError = t(
					message.includes('no-goal-proposals') ? 'teacher.voting_goal_only_empty' : 'common.error',
				);
			})
			.finally(() => {
				savingSettings = false;
				m.redraw();
			});
	}

	function saveVotingSettings(next: VotingStageSettings): void {
		if (savingSettings) return;
		savingSettings = true;
		setVotingSettings(sessionId, next)
			.catch((error: unknown) => {
				console.error('[Teacher] Saving the voting settings failed:', error);
			})
			.finally(() => {
				savingSettings = false;
				m.redraw();
			});
	}

	function saveVillageNavigation(mode: 'teacher' | 'free'): void {
		if (savingNavigation) return;
		savingNavigation = true;
		setVillageNavigation(sessionId, mode)
			.catch((error: unknown) => {
				console.error('[Teacher] Saving the village navigation failed:', error);
			})
			.finally(() => {
				savingNavigation = false;
				m.redraw();
			});
	}

	/** The stamp of the last call THIS device made — a newer one came from the teacher's other device */
	let sentCallAt: number | undefined;
	/** Where the class was last called, in the teacher's words — the sheet's status line */
	let lastCalledLabel = '';
	/** Where the class view is standing (the board always stands with the class) */
	let watchViewing: number | null = null;
	/** Bumped to walk the class view back to the class's station */
	let walkRequest = 0;

	/** Every student's village walks to one place — the room's station, the council, any opened station */
	function callClass(place: VillageCallPlace, label = ''): void {
		if (callingVillage) return;
		callingVillage = true;
		lastCalledLabel = label;
		callVillage(sessionId, place)
			.then((at) => {
				sentCallAt = at;
				villageCallSent = true;
				window.setTimeout(() => {
					villageCallSent = false;
					m.redraw();
				}, 2500);
			})
			.catch((error: unknown) => {
				console.error('[Teacher] Calling the class failed:', error);
			})
			.finally(() => {
				callingVillage = false;
				m.redraw();
			});
	}

	function saveLook(choice: AgoraThemeChoice): void {
		if (savingLook) return;
		savingLook = true;
		setSessionTheme(sessionId, choice)
			.catch((error: unknown) => {
				console.error('[Teacher] Saving the class look failed:', error);
			})
			.finally(() => {
				savingLook = false;
				m.redraw();
			});
	}

	void ensureUser().then((user) => {
		userId = user.uid;
		listenToSession(sessionId, user.uid);
		// The one screen that pays for the bar's list up front: this is where a
		// teacher switches lessons mid-period, and it is also the only way the
		// bar can name the class a game belongs to (the session doc holds the
		// id, not the name).
		if (!user.isAnonymous) loadTeacherNav();
		// Macrotask redraw — see GameController note.
		setTimeout(() => m.redraw(), 0);
	});

	/**
	 * Every challenge move shares one in-flight latch, because they are one
	 * button that changes its mind — two of them cannot be pressed at once, and
	 * the server would refuse the second anyway.
	 */
	function runChallenge(move: () => Promise<unknown>): void {
		if (challenging) return;
		challenging = true;
		move()
			.catch((error: unknown) => {
				console.error('[Teacher] Challenge turn failed:', error);
			})
			.finally(() => {
				challenging = false;
				m.redraw();
			});
	}

	const challengeActions: ChallengeActions = {
		start: () => runChallenge(() => startRound(sessionId)),
		openFloor: () => runChallenge(() => openFloor(sessionId)),
		openVote: () => runChallenge(() => openChallengeVote(sessionId)),
		resolve: () => runChallenge(() => resolveChallengeTurn(sessionId)),
		skip: () => runChallenge(() => skipSpeaker(sessionId)),
		next: () => runChallenge(() => nextSpeaker(sessionId)),
		end: () => runChallenge(() => endRound(sessionId)),
	};

	/** The quiet "moved from your other device" line stays long enough to be read, then goes */
	function dispatchLatch(event: AdvanceEvent): void {
		const next = advanceReduce(latch, event);
		if (next === latch) return;
		if (next.movedElsewhere && !latch.movedElsewhere) {
			calledElsewhere = '';
			window.clearTimeout(quietTimer);
			quietTimer = window.setTimeout(() => {
				dispatchLatch({ kind: 'dismiss' });
				m.redraw();
			}, QUIET_LINE_MS);
		}
		latch = next;
	}

	function handleAdvance(toIndex: number): void {
		if (latch.advancing) return;
		dispatchLatch({ kind: 'press', toIndex, now: Date.now() });
		window.clearTimeout(advanceTimer);
		advanceTimer = window.setTimeout(() => {
			dispatchLatch({ kind: 'tick', now: Date.now() });
			m.redraw();
		}, ADVANCE_TIMEOUT_MS);
		advanceStage({ sessionId, toIndex })
			.then(() => dispatchLatch({ kind: 'ok' }))
			.catch((error: unknown) => {
				// `stale` (failed-precondition) means the room already moved on —
				// the teacher's other device pressed first — unless the room is
				// still behind, which is a real refusal the strip must say.
				const code = (error as { code?: string } | null)?.code;
				if (code === 'functions/failed-precondition') {
					dispatchLatch({ kind: 'stale', stageIndex: getCurrentPlanIndex() });
				} else {
					dispatchLatch({ kind: 'error' });
					console.error('[Teacher] Advance stage failed:', error);
				}
			})
			.finally(() => {
				window.clearTimeout(advanceTimer);
				m.redraw();
			});
	}

	function savePlan(): void {
		if (!editingPlan || savingPlan) return;
		savingPlan = true;
		planSaveFailed = false;
		updateStagePlan({ sessionId, stagePlan: editingPlan })
			.then(() => {
				editingPlan = null;
			})
			.catch((error: unknown) => {
				planSaveFailed = true;
				console.error('[Teacher] Saving the stage plan failed:', error);
			})
			.finally(() => {
				savingPlan = false;
				m.redraw();
			});
	}

	return {
		onremove() {
			window.clearTimeout(advanceTimer);
			window.clearTimeout(quietTimer);
			window.clearTimeout(armTimer);
			phoneQuery.removeEventListener('change', onPhoneChange);
			stopListening();
			stopDeliberationListeners();
			stopVotingListeners();
			stopTeacherConsole();
		},

		view() {
			// Re-attach on every render (idempotent) — see GameController note.
			if (userId) {
				listenToSession(sessionId, userId);
				// Every stage: the Messages tab reads answers and threads from the
				// lobby on, and the results recap projects the same board
				listenToDeliberation(sessionId, userId);
			}

			const { session, participants, loading, error } = getSessionState();

			// Which of the teacher's screens this is. Decided every render (it is
			// pure and cheap) so the answer to the sheet takes effect at once; a
			// wall — including an unanswered laptop — never subscribes to the names.
			const namesCollected =
				!!session &&
				session.sessionMode !== AgoraSessionMode.civic &&
				session.collectRealNames !== false;
			const roleDecision = decideDeviceRole({
				stored: getDeviceRole(),
				coarsePointer: coarsePointer.matches,
				viewportWidth: window.innerWidth,
				namesCollected,
			});
			const role: DeviceRole = roleDecision.role;
			const privateDevice = role === 'private';
			if (userId && session) {
				listenToTeacherConsole(sessionId, userId, {
					identities: privateDevice,
					threads: privateDevice,
				});
			}

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
						m(
							'button.btn.btn--secondary',
							{ onclick: () => m.route.set('/teach') },
							t('common.back'),
						),
					]),
				);
			}

			const joinUrl = sessionJoinUrl(
				window.location.origin,
				session.code,
				sessionVillageMode(session.world, window.location.search),
			);
			const plan = getStagePlan();
			const currentIndex = getCurrentPlanIndex();
			const current = plan[currentIndex];
			const next = plan[currentIndex + 1] ?? null;
			// Every snapshot feeds the latch: a pointer that moved without this
			// device pressing moved from the teacher's other device
			dispatchLatch({ kind: 'snapshot', stageIndex: currentIndex });
			// The same for a call: a stamp this device did not write
			const liveCall = session.villageCall;
			if (liveCall && liveCall.at !== seenCallAt) {
				const first = seenCallAt === undefined;
				seenCallAt = liveCall.at;
				if (!first && liveCall.at !== sentCallAt) {
					// The newer event is the one to say; the quiet move line yields
					dispatchLatch({ kind: 'dismiss' });
					const boothItem = plan.find((item) => `booth:${item.itemId}` === liveCall.place);
					calledElsewhere =
						liveCall.place === 'council'
							? t('village.call_council')
							: liveCall.place === 'current' || !boothItem
								? current.title?.trim() || teacherStepLabel(current)
								: boothItem.title?.trim() || teacherStepLabel(boothItem);
					window.clearTimeout(quietTimer);
					quietTimer = window.setTimeout(() => {
						calledElsewhere = '';
						m.redraw();
					}, QUIET_LINE_MS);
				}
			}
			const nextIndex = currentIndex + 1;
			const planOwnsVoting = Boolean(session.stagePlan && session.stagePlan.length > 0);
			const topic = getTopicPackage(session.topicPackageId);
			if (!topic) loadTopicPackage(session.topicPackageId);
			const hasCharacters = topic ? topic.kind !== 'quick' : true;
			const steps = countedSteps(plan);
			const stepIndex = Math.min(currentIndex, steps.length - 1);

			// A new stage refolds the students' words
			if (peekStage !== current.itemId) {
				peekStage = current.itemId;
				peekOpen = false;
			}

			const inDeliberation = current.stage === AgoraStage.deliberation;
			const inQuestion = current.stage === AgoraStage.question;
			const { proposals, answersByQuestion, studentEvalTimes } = getDeliberationState();
			const answers =
				inQuestion && current.statementId ? (answersByQuestion[current.statementId] ?? []) : [];

			const inVoting = current.stage === AgoraStage.voting;
			if (inVoting && userId) listenToVoting(sessionId, session.challengeQuestionId, userId);
			const { voterUids } = getVotingState();
			const challengePhase = getGame(session)?.phase;
			const challengeLive =
				challengePhase === ChallengePhase.vote || challengePhase === ChallengePhase.resolving;

			// How many texts each student weighed — from the anonymous timeline the
			// square already streams (evaluator ids only, never values)
			const ratingsByUid = new Map<string, number>();
			for (const raters of Object.values(studentEvalTimes)) {
				for (const rater of raters) {
					ratingsByUid.set(rater.evaluatorId, (ratingsByUid.get(rater.evaluatorId) ?? 0) + 1);
				}
			}
			// Who has weighed each text, straight off the timeline. The teacher's
			// figures are server-written and lag by a trigger round-trip; this
			// says whether the silence is the class or the count (see liveTally).
			const liveWeighed = liveWeighings(
				studentEvalTimes,
				answers.map((answer) => answer.statementId),
			);

			// The same count, restricted to THIS round's texts — a round is done
			// when the dealt sample is read, not when the square was
			const answerIds = new Set(answers.map((answer) => answer.statementId));
			const roundRatedByUid = new Map<string, number>();
			for (const [statementId, raters] of Object.entries(studentEvalTimes)) {
				if (!answerIds.has(statementId)) continue;
				for (const rater of raters) {
					roundRatedByUid.set(rater.evaluatorId, (roundRatedByUid.get(rater.evaluatorId) ?? 0) + 1);
				}
			}
			const facts = progressFacts(proposals, answers, voterUids, roundRatedByUid, activeHandSize());
			const unread = unreadRepliesTotal();
			const ended = current.stage === AgoraStage.ended;
			const atResults = current.stage === AgoraStage.results || ended;
			const classView = inClassView();
			// The console opens in the view this device used last. Checked on
			// render, not at construction: the bare route reached from the class
			// route re-renders this same keyed instance and constructs nothing.
			// Choosing the board stores "board" first, so there is no loop.
			if (!classView && rememberedView() === 'class') {
				m.route.set(classRoute, undefined, { replace: true });
			}

			// Board ⇄ Class view: on the bar at every width, never folded into ≡
			const viewButton = (view: ConsoleView, icon: 'square' | 'watch', label: string): m.Children =>
				m(
					'button.teacher-nav__view-btn',
					{
						type: 'button',
						'aria-pressed': String(classView === (view === 'class')),
						'data-view': view,
						title: label,
						onclick: () => {
							if ((view === 'class') !== classView) showView(view);
						},
					},
					[m(Icon, { name: icon, size: 18 }), m('span.teacher-nav__view-label', label)],
				);
			const segment = m(
				'.teacher-nav__view',
				{ role: 'group', 'aria-label': t('teacher.view.switch_aria') },
				[
					viewButton('board', 'square', t('teacher.view.board')),
					viewButton('class', 'watch', t('teacher.view.class')),
				],
			);

			// The header: the lesson's name, the class, the code — and on a phone
			// the projector and the cog fold into the menu, where they still fit
			const menuItems: TeacherNavMenuItem[] = [
				{ icon: 'flag', label: t('teacher.menu.move_class'), onSelect: () => openPanel('move') },
				{ icon: 'era', label: t('teacher.open_projector'), onSelect: openProjector },
				{ icon: 'cog', label: t('teacher.settings_title'), onSelect: () => openPanel('settings') },
			];
			const navBar = m(TeacherNav, {
				title: topic?.title ?? t('teacher.title'),
				subtitle: (() => {
					const agoraClass = navClass(session.classId);

					return agoraClass ? classLabel(agoraClass) : undefined;
				})(),
				onBack: () => m.route.set(session.classId ? `/teach/class/${session.classId}` : '/teach'),
				code: session.code,
				menuItems,
				segment,
				trailing: [
					// The device's role, always visible: a wall must be unmistakable.
					// Private → wall is one tap; wall → private asks first.
					namesCollected
						? m(
								'button.teacher-nav__role',
								{
									type: 'button',
									class: privateDevice ? 'teacher-nav__role--private' : 'teacher-nav__role--wall',
									'data-role': role,
									title: t(
										privateDevice ? 'teacher.device.private_chip' : 'teacher.device.wall_chip',
									),
									'aria-label': t(
										privateDevice ? 'teacher.device.private_chip' : 'teacher.device.wall_chip',
									),
									onclick: () => {
										if (privateDevice) chooseRole('wall');
										else roleConfirm = true;
									},
								},
								[
									m(Icon, { name: privateDevice ? 'people' : 'era', size: 16 }),
									m(
										'span.teacher-nav__role-text',
										t(privateDevice ? 'teacher.device.private_chip' : 'teacher.device.wall_chip'),
									),
								],
							)
						: null,
					m(
						'button.btn.btn--secondary.btn--sm.teacher-nav__projector',
						{ type: 'button', title: t('teacher.projector_hint'), onclick: openProjector },
						[m(Icon, { name: 'era', size: 20 }), m('span', ` ${t('teacher.open_projector')}`)],
					),
					atResults
						? null
						: m(
								'button.teacher-nav__cog',
								{
									type: 'button',
									'aria-label': t('teacher.settings_title'),
									title: t('teacher.settings_title'),
									'aria-expanded': String(panel === 'settings'),
									'aria-controls': 'teacher-settings',
									class: panel === 'settings' ? 'teacher-nav__cog--on' : undefined,
									onclick: (event: MouseEvent) => openPanel('settings', event.currentTarget),
								},
								m(Icon, { name: 'cog', size: 20 }),
							),
				],
			});

			// The one button. Its label says what it opens, in the teacher's words.
			// On a wall the first tap arms NEXT and the second opens — a stray
			// touch on a projected laptop must not move the whole class
			const armed = nextNeedsArming(role) && Date.now() < armedUntil;
			const nextLabel =
				current.stage === AgoraStage.lobby
					? t('teacher.start_journey')
					: !next || next.stage === AgoraStage.ended
						? t('teacher.end_game')
						: t('teacher.open_next', { stage: teacherStepLabel(next) });
			const pressNext = (): void => {
				if (!nextNeedsArming(role) || armed) {
					armedUntil = 0;
					window.clearTimeout(armTimer);
					handleAdvance(nextIndex);

					return;
				}
				armedUntil = Date.now() + ARM_MS;
				window.clearTimeout(armTimer);
				armTimer = window.setTimeout(() => {
					armedUntil = 0;
					m.redraw();
				}, ARM_MS);
			};
			const action: StripAction | null = ended
				? null
				: {
						label: armed ? t('teacher.bar.confirm_next', { label: nextLabel }) : nextLabel,
						onclick: pressNext,
						disabled: !next || (current.stage === AgoraStage.lobby && participants.length === 0),
						busy: latch.advancing,
					};
			// The pennant: where the class is, in the teacher's words, and the
			// door to moving it. The sheet lists the lesson's stations.
			const stationLabel = (item: AgoraStagePlanItem): string =>
				item.title?.trim() || teacherStepLabel(item);
			const stripAttrs = {
				steps,
				currentIndex: stepIndex,
				action,
				reportRoute: `/teach/report/${sessionId}`,
				failed: latch.failed,
				onRetry: () => handleAdvance(nextIndex),
				status: calledElsewhere
					? t('teacher.bar.called_elsewhere', { place: calledElsewhere })
					: latch.movedElsewhere
						? t('teacher.bar.moved_elsewhere')
						: undefined,
				pennant: ended
					? undefined
					: {
							label: stationLabel(current),
							open: panel === 'move',
							onOpen: () => openPanel('move'),
						},
			};
			// On a phone in the class view the strip rides inside the village's
			// bar as the director row; anywhere else it is the strip it always was
			const directorRow = classView && phone;
			const strip = directorRow ? null : m(TeacherStrip, stripAttrs);
			const director = directorRow ? m(TeacherStrip, { ...stripAttrs, director: true }) : undefined;

			// The two doors beside the board: who is here, and what they wrote
			const chip = (
				which: Panel,
				icon: 'people' | 'talk',
				label: string,
				count: number,
			): m.Children =>
				m(
					'button.teacher-panels__chip',
					{
						type: 'button',
						'aria-expanded': String(panel === which),
						'aria-controls': `teacher-panel-${which}`,
						class: panel === which ? 'teacher-panels__chip--open' : undefined,
						onclick: (event: MouseEvent) => openPanel(which, event.currentTarget),
					},
					[
						m(Icon, { name: icon, size: 20 }),
						m('span', label),
						m('span.teacher-panels__count', ` · ${count}`),
						which === 'texts' && unread > 0
							? m(
									'span.teacher-panels__badge',
									{ 'aria-label': t('teacher.unread_n', { n: unread }) },
									String(unread),
								)
							: null,
					],
				);
			const panelChips = m('.teacher-panels', [
				chip('class', 'people', t('teacher.panel_class'), participants.length),
				chip(
					'texts',
					'talk',
					t('teacher.panel_texts'),
					getDeliberationState().proposals.length + answers.length,
				),
			]);

			// The students' own words, quoted and folded: a teacher reads along
			// when they want to, and the board stays about the room otherwise
			const peek = topic
				? m('.card.teacher-peek', [
						m(
							'button.teacher-peek__summary',
							{
								type: 'button',
								'aria-expanded': String(peekOpen),
								'aria-controls': 'teacher-peek-body',
								onclick: () => {
									peekOpen = !peekOpen;
								},
							},
							[
								m(Icon, { name: 'watch', size: 20 }),
								m('span.teacher-peek__label', t('teacher.student_instructions')),
								m(
									'span.teacher-peek__chevron',
									{ class: peekOpen ? 'teacher-peek__chevron--open' : undefined },
									m(Icon, { name: 'arrow', size: 16 }),
								),
							],
						),
						peekOpen
							? m(
									Collapsible,
									m('#teacher-peek-body', [
										m(TeacherInstructions, {
											stage: current.stage,
											topic,
											questionTitle: current.title,
											questionExplanation: current.explanation,
											questionKind: current.kind,
											// The one edit an opened stage takes: the words, when the
											// room did not understand them.
											reword: { sessionId, itemId: current.itemId },
										}),
									]),
								)
							: null,
					])
				: null;

			// Behind the cog: the upcoming steps, how the vote opens, the room's
			// colours, the projector link. A sheet, so the board never moves.
			const villageNav = session.villageNavigation ?? 'teacher';
			const navChoice = (mode: 'teacher' | 'free', label: string): m.Children =>
				m(
					'button.btn.village-nav__choice',
					{
						type: 'button',
						role: 'radio',
						'aria-checked': String(villageNav === mode),
						'data-nav': mode,
						class: villageNav === mode ? 'btn--primary' : 'btn--secondary',
						disabled: savingNavigation,
						onclick: () => saveVillageNavigation(mode),
					},
					label,
				);
			const settingsBody = m('.stack', { style: { gap: 'var(--space-lg)' } }, [
				// The village: who walks the class between stations, and the two
				// places the teacher can call everyone to at any moment.
				sessionVillageMode(session.world, window.location.search)
					? m('section.teacher-panel__section.stack.village-nav', [
							m('p.teacher__section-title', t('village.nav_title')),
							m(
								'.teacher__mode-row',
								{ role: 'radiogroup', 'aria-label': t('village.nav_title') },
								[
									navChoice('teacher', t('village.nav_teacher')),
									navChoice('free', t('village.nav_free')),
								],
							),
							m(
								'p.home-explanation.home-explanation--start',
								t(villageNav === 'free' ? 'village.nav_free_hint' : 'village.nav_teacher_hint'),
							),
							m('p.teacher__section-title', t('village.call_title')),
							m('.teacher__mode-row', [
								m(
									'button.btn.btn--secondary.village-nav__call.village-nav__call--current',
									{ type: 'button', disabled: callingVillage, onclick: () => callClass('current') },
									t('village.call_current'),
								),
								m(
									'button.btn.btn--secondary.village-nav__call.village-nav__call--council',
									{ type: 'button', disabled: callingVillage, onclick: () => callClass('council') },
									t('village.call_council'),
								),
							]),
							villageCallSent
								? m('p.lobby__status', { role: 'status' }, t('village.call_sent'))
								: null,
						])
					: null,
				m('section.teacher-panel__section.stack', [
					m('p.teacher__section-title', t('teacher.edit_plan')),
					editingPlan
						? m('.stack', [
								m(StagePlanEditor, {
									items: editingPlan,
									hasCharacters,
									frozenCount: currentIndex + 1,
									onChange: (items) => {
										editingPlan = items;
									},
								}),
								planSaveFailed ? m('p.join__error', t('teacher.plan_save_failed')) : null,
								m('.teacher__mode-row', [
									m(
										'button.btn.btn--primary',
										{ disabled: savingPlan, onclick: savePlan },
										savingPlan ? t('teacher.saving') : t('teacher.save_plan'),
									),
									m(
										'button.btn.btn--secondary',
										{
											disabled: savingPlan,
											onclick: () => {
												editingPlan = null;
												planSaveFailed = false;
											},
										},
										t('teacher.cancel_plan'),
									),
								]),
							])
						: next && next.stage !== AgoraStage.ended
							? m(
									'button.btn.btn--secondary',
									{
										type: 'button',
										onclick: () => {
											editingPlan = plan
												.filter((item) => item.stage !== AgoraStage.ended)
												.map((item) => ({ ...item }));
										},
									},
									t('teacher.edit_plan'),
								)
							: m('p.lobby__status', t('teacher.plan_locked')),
				]),

				// How the vote opens — set while the class still deliberates; by the
				// time the ballot is drawn up the settings have already been read.
				inDeliberation && (next?.stage === AgoraStage.voting || !planOwnsVoting)
					? m(
							'section.teacher-panel__section.stack',
							votingSettingsCard(
								session.votingSettings,
								savingSettings,
								planOwnsVoting,
								saveVotingSettings,
							),
						)
					: null,

				// The room's colours: the two presets and whatever the class has
				// built so far. A civic square wears Odyssey's and is not asked.
				session.sessionMode !== AgoraSessionMode.civic
					? m('section.teacher-panel__section.stack.teacher-look', [
							m('p.teacher__section-title', t('teacher.look_title')),
							m('p.home-explanation.home-explanation--start', t('teacher.look_hint')),
							m(LookPicker, {
								current: resolveAgoraTheme(session, null),
								classLooks: classLooks(participants, undefined),
								onWear: (choice) => {
									if (choice) saveLook(choice);
								},
							}),
						])
					: null,

				m('section.teacher-panel__section.stack', [
					m('p.teacher__section-title', t('teacher.open_projector')),
					m('p.home-explanation.home-explanation--start', t('teacher.projector_hint')),
					m(
						'button.btn.btn--secondary.btn--full',
						{ type: 'button', onclick: copyProjectorLink },
						t(
							projectorLinkCopied ? 'teacher.projector_link_copied' : 'teacher.copy_projector_link',
						),
					),
				]),
			]);

			const sidePanel =
				panel === 'class'
					? m(
							TeacherPanel,
							{
								id: 'teacher-panel-class',
								title: t('teacher.panel_class'),
								count: participants.length,
								onClose: closePanel,
							},
							m(ClassPanel, {
								plan,
								currentIndex,
								participants,
								facts,
								ratingsByUid,
								onMessage: openDrawer,
								namesHidden: !privateDevice,
							}),
						)
					: panel === 'texts'
						? m(
								TeacherPanel,
								{
									id: 'teacher-panel-texts',
									title: t('teacher.panel_texts'),
									onClose: closePanel,
								},
								// The students' private words do not belong on a wall
								privateDevice
									? m(MessagesPanel, { session, participants, onMessage: openDrawer })
									: m('p.home-explanation.teacher-panel__wall', t('teacher.device.open_on_phone')),
							)
						: panel === 'settings'
							? m(
									TeacherPanel,
									{
										id: 'teacher-settings',
										title: t('teacher.settings_title'),
										wide: true,
										onClose: closePanel,
									},
									settingsBody,
								)
							: panel === 'move'
								? m(MoveClassSheet, {
										plan,
										currentIndex,
										viewingIndex: classView && watchViewing !== null ? watchViewing : currentIndex,
										currentProgress: {
											done: classProgress(current, participants, facts).doneCount,
											total: participants.length,
										},
										navigation: session.villageNavigation ?? 'teacher',
										savingNavigation,
										onNavigation: saveVillageNavigation,
										onWalkMe: () => {
											walkRequest++;
										},
										onGather: (place) =>
											callClass(
												place,
												place === 'council'
													? t('village.call_council')
													: place === 'current'
														? stationLabel(current)
														: stationLabel(
																plan.find((item) => `booth:${item.itemId}` === place) ??
																	plan[currentIndex],
															),
											),
										onAdvance: handleAdvance,
										calling: callingVillage,
										advancing: latch.advancing,
										status: villageCallSent
											? t('teacher.move.gathered', { station: lastCalledLabel })
											: undefined,
										onClose: closePanel,
									})
								: null;

			const drawerParticipant = drawerUid
				? participants.find((participant) => participant.userId === drawerUid)
				: undefined;
			const drawer =
				drawerUid && drawerParticipant
					? m(StudentThreadDrawer, {
							sessionId,
							studentUid: drawerUid,
							anonName: drawerParticipant.anonName,
							realName: realNameOf(drawerUid),
							languageStrikes: drawerParticipant.languageStrikes,
							aboutStatementId: drawerAbout,
							onClose: () => {
								drawerUid = null;
								drawerAbout = undefined;
							},
						})
					: null;

			// "Where is this screen?" — before anything with a name on it; and the
			// confirm when a wall asks to show names after all
			const roleSheet =
				roleDecision.ask || roleConfirm
					? m(DeviceRoleSheet, {
							mode: roleConfirm ? 'confirm' : 'ask',
							onChoose: chooseRole,
							onKeep: () => {
								roleConfirm = false;
							},
						})
					: null;
			const wallClass = privateDevice ? '' : '.teacher-console--wall';

			// The class view: the room as the students see it, under the same bar
			// and strip, with the same panels and drawer over it
			if (classView) {
				return m(`.shell.shell--wide.teacher-console.teacher-console--watch${wallClass}`, [
					navBar,
					strip,
					m(
						'.teacher-watch',
						m(ClassView, {
							sessionId,
							userId,
							session,
							topic,
							participants,
							director,
							messages: { unread, onOpen: () => openPanel('texts') },
							nameOf: privateDevice ? realNameOf : undefined,
							onAuthor: (uid: string) => openDrawer(uid),
							onViewing: (index: number) => {
								watchViewing = index;
							},
							walkRequest,
						}),
					),
					sidePanel,
					drawer,
					roleSheet,
				]);
			}

			// Results/ended: the teacher projects the same transformed map + score
			if (atResults) {
				if (!topic) {
					return m(
						'.shell',
						m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
					);
				}

				return m(`.shell.shell--wide.teacher-console${wallClass}`, [
					navBar,
					strip,
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						panelChips,
						m(Results, { session, topic }),
					]),
					sidePanel,
					drawer,
					roleSheet,
				]);
			}

			return m(`.shell.shell--wide.teacher-console${wallClass}`, [
				// On a phone the strip is the last thing in tab order; a keyboard
				// or switch user gets a door straight to it
				m('a.skip-link', { href: '#teacher-next' }, t('teacher.skip_to_next')),
				navBar,
				strip,
				m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
					panelChips,

					nowCard({
						item: current,
						participants,
						facts,
						joinUrl,
						code: session.code,
						onMessage: openDrawer,
						now: Date.now(),
						nameOf: privateDevice ? realNameOf : undefined,
					}),

					inQuestion
						? roundSpecOf(current)
							? roundPanel(session, current, answers, liveWeighed)
							: questionPanel(session, current, answers, liveWeighed)
						: null,

					// While the vote is open the teacher holds the reveal, and always
					// sees the tallies themselves — they cannot decide when to show
					// the room something they cannot see.
					inVoting
						? [
								m('p.home-explanation.home-explanation--start', t('teacher.hint_voting')),
								// The round runs above the ballot: what the teacher taps
								// next, and who it is waiting on.
								session.votingSettings?.challengeGame === true
									? challengeTurnCard(getGame(session), challenging, challengeActions)
									: null,
								votingLiveCard(
									session.votingSettings,
									voterUids.size,
									participants.length,
									savingSettings,
									challengeLive,
									saveVotingSettings,
									setGoalOnlyLive,
									goalOnlyError,
								),
								m(Voting, {
									session,
									myParticipant: participants[0],
									userId,
									board: true,
								}),
							]
						: null,

					// Students cycle propose→rate→help on their own; the teacher's
					// deliberation card shows the count and how the vote will open
					inDeliberation
						? m('.card.stack', [
								m('.delib__header', [
									session.roundEndsAt ? m(CountdownTimer, { endsAt: session.roundEndsAt }) : null,
									m('span.values__score', `${t('teacher.proposals_count')}: ${proposals.length}`),
								]),
								triggerLine(current, next?.stage === AgoraStage.voting),
							])
						: null,

					peek,
				]),
				sidePanel,
				drawer,
				roleSheet,
			]);
		},
	};
}
