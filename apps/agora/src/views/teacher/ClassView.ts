import m from 'mithril';
import { t } from '../../lib/i18n';
import { getStagePlan, getCurrentPlanIndex } from '../../lib/session';
import { loadTopicPackage } from '../../lib/topic';
import {
	getDeliberationState,
	isProposalConfirmed,
	listenToDeliberation,
} from '../../lib/proposals';
import { getVotingState, listenToVoting } from '../../lib/voting';
import { sessionVillageMode } from '../../lib/flows/sessionLinks';
import {
	INITIAL_STAGE_NAV,
	effectiveIndex,
	stageNavReduce,
	type StageNavEvent,
	type StageNavState,
} from '../../lib/flows/stageNav';
import { readStoredNav, storeNav } from '../../lib/stageNavStore';
import {
	councilModelFor,
	councilNeedsVotes,
	papersFor,
	stationPapersFor,
} from '../../lib/flows/villageModel';
import { villageDesk } from '../../lib/flows/villageRoute';
import {
	isLightWorld,
	isVillageSoundOn,
	setLightWorld,
	setVillagePalette,
	setVillageSound,
	villagePalette,
} from '../../lib/villagePrefs';
import { StageNav, planItemLabel } from '../../components/StageNav';
import { StageTransition, hasStageTransition } from '../../components/StageTransition';
import { VillageMoreSheet } from '../../components/VillageMoreSheet';
import { VillageShell } from '../../components/VillageShell';
import { stationNotes } from '../../components/VillageCommunity';
import { Lobby } from '../Lobby';
import { watchStageBody, watcherDeskCard } from './watchBodies';
import {
	AgoraStage,
	type AgoraParticipant,
	type AgoraSession,
	type AgoraStagePlanItem,
	type AgoraTopicPackage,
} from '@freedi/shared-types';

/**
 * The teacher's class view: the room exactly as a student sees it — the 3D
 * village or the flat view, the stations strip, the one bar with four doors,
 * the guide's bubble — with no seat behind it.
 *
 * Not a copy of the student controller and not a seat for the teacher. A
 * seat would be counted: "3 of 4 finished", the ballot, the class score and
 * the voting thresholds all read `participants.length`, and every function
 * would need a "not the teacher" carve-out. So this is the seatless render
 * the projector already proved, under the student chrome: the desk shows
 * the prompt without a pen, the board is read and never rated, the ballot is
 * the class's. Nothing here writes — `classViewImports.test.ts` pins that no
 * write path is even imported.
 *
 * The teacher has a viewing position of their own, like a student's: they
 * walk opened stations freely and never ahead of the class. The console
 * shell owns every listener and is the only one to stop them; this view
 * only re-attaches the idempotent ones it reads.
 */
export interface ClassViewAttrs {
	sessionId: string;
	userId: string;
	session: AgoraSession;
	/** Absent while it loads; the lobby needs none */
	topic: AgoraTopicPackage | null;
	participants: readonly AgoraParticipant[];
	/** The phone's director row (pennant + NEXT), carried inside the place bar's wrap */
	director?: m.Children;
	/** The teacher's post box: the Messages panel, in the envelope's slot */
	messages?: { unread: number; onOpen: () => void };
	/** A private device only: a student's real name beside their pseudonym */
	nameOf?: (uid: string) => string | undefined;
	/** The teacher opens a student's private thread from their note */
	onAuthor?: (uid: string, anonName: string) => void;
	/** Where the teacher is looking, so the shell can say "walk me to the class" */
	onViewing?: (viewingIndex: number) => void;
	/** Bumped by the shell: walk back to the class's station */
	walkRequest?: number;
}

export function ClassView(initialVnode: m.Vnode<ClassViewAttrs>): m.Component<ClassViewAttrs> {
	const { sessionId } = initialVnode.attrs;
	let nav: StageNavState = INITIAL_STAGE_NAV;
	let navRestored = false;
	let lastIndex: number | null = null;
	let lastViewing: number | null = null;
	let lastWalk = 0;
	let villageOverride: boolean | undefined;
	let moreOpen = false;
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

	function dispatchNav(event: StageNavEvent): void {
		const next = stageNavReduce(nav, event, getStagePlan(), getCurrentPlanIndex());
		if (next !== nav) {
			nav = next;
			storeNav(sessionId, nav);
		}
	}

	const spinner = (): m.Children =>
		m('.shell', m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')));

	return {
		onremove() {
			// Only the timers. The listeners are the console's: stopping them
			// here would blind the board the teacher flips back to.
			window.clearTimeout(transitionTimer);
			window.clearTimeout(transitionLeaveTimer);
		},

		view({ attrs }) {
			const { userId, session, topic, participants } = attrs;
			const plan = getStagePlan();
			const currentIndex = getCurrentPlanIndex();

			if (!navRestored) {
				navRestored = true;
				dispatchNav({ kind: 'restore', raw: readStoredNav(sessionId) });
			}

			// The same journey card the students get when the class moves on,
			// and the same rule: never on first render, never for a watcher who
			// stepped back to read an earlier station.
			if (currentIndex !== lastIndex) {
				if (lastIndex !== null) {
					dispatchNav({ kind: 'session-advanced' });
					const item = plan[currentIndex];
					if (nav.viewingItemId === null && item && hasStageTransition(item.stage))
						beginStageTransition(item);
				}
				lastIndex = currentIndex;
			}

			// "Walk me to the class": the sheet's first row when the teacher is reading elsewhere
			if (attrs.walkRequest !== undefined && attrs.walkRequest !== lastWalk) {
				lastWalk = attrs.walkRequest;
				const room = plan[currentIndex];
				if (room) dispatchNav({ kind: 'select', itemId: room.itemId });
			}

			const viewingIndex = effectiveIndex(plan, currentIndex, nav.viewingItemId);
			const item = plan[viewingIndex] ?? plan[currentIndex];
			const live = viewingIndex === currentIndex;
			if (viewingIndex !== lastViewing) {
				lastViewing = viewingIndex;
				attrs.onViewing?.(viewingIndex);
			}

			const villageMode = sessionVillageMode(
				session.world,
				window.location.search,
				villageOverride,
			);

			// The reads this view needs, re-attached idempotently like every
			// screen does — the console shell already holds the deliberation
			// listener on every stage; the ballot's is per stage.
			const needsData =
				item.stage === AgoraStage.question ||
				item.stage === AgoraStage.deliberation ||
				item.stage === AgoraStage.voting ||
				item.stage === AgoraStage.results ||
				item.stage === AgoraStage.ended;
			if (needsData && userId) listenToDeliberation(sessionId, userId);
			if ((item.stage === AgoraStage.voting || councilNeedsVotes(plan, currentIndex)) && userId) {
				listenToVoting(sessionId, session.challengeQuestionId, userId);
			}

			const overlays = [
				moreOpen && villageMode
					? m(VillageMoreSheet, {
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
								villageOverride = false;
							},
							onClose: () => {
								moreOpen = false;
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
						})
					: null,
			];

			const stageNav = m(StageNav, {
				plan,
				currentIndex,
				viewingIndex,
				onSelect: (itemId: string) => dispatchNav({ kind: 'select', itemId }),
				menu: villageMode
					? {
							onOpen: () => {
								moreOpen = true;
							},
							label: t('village.more.open'),
							open: moreOpen,
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

			// Every stage past the lobby needs the topic package
			if (!topic && item.stage !== AgoraStage.lobby) loadTopicPackage(session.topicPackageId);
			if (villageMode && item.stage === AgoraStage.lobby && !topic) {
				loadTopicPackage(session.topicPackageId);
			}

			const stageView: m.Children =
				item.stage === AgoraStage.lobby
					? m(Lobby, { participants: [...participants], myParticipant: null })
					: !topic
						? spinner()
						: villageMode && villageDesk(item)
							? watcherDeskCard(item)
							: watchStageBody({ session, item, topic, participants, userId });

			const council =
				villageMode && topic
					? (() => {
							const votes = getVotingState();
							const { proposals, scores } = getDeliberationState();

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
							});
						})()
					: undefined;

			// The SAME five children in every branch — Mithril matches unkeyed
			// children by position, and a shifted village is a new village: its
			// 3D world reloads and the walker jumps back to the fountain.
			return m('.game.teacher-watch__game', [
				overlays,
				stageNav,
				pastNotice,
				villageMode
					? null
					: m(
							'button.btn.btn--secondary.btn--sm.village-mode-toggle',
							{
								onclick: () => {
									villageOverride = true;
								},
								'aria-pressed': 'false',
							},
							t('village.enter_3d'),
						),
				villageMode
					? m(
							VillageShell,
							{
								plan,
								currentIndex,
								viewingIndex,
								writable: false,
								watcher: true,
								barLead: attrs.director,
								council,
								navigation: session.villageNavigation ?? 'teacher',
								call: session.villageCall,
								community: topic
									? {
											session,
											userId,
											anonName: '',
											readOnly: true,
											teacher: attrs.messages
												? {
														label: t('teacher.panel_texts'),
														unread: attrs.messages.unread,
														onOpen: attrs.messages.onOpen,
													}
												: undefined,
											scoreboard: {
												topic,
												leadStatementId: session.classScore?.leadStatementId,
												goalOnly: session.votingSettings?.goalZoneOnly === true,
											},
											authorName: attrs.nameOf,
											onAuthor: attrs.onAuthor,
										}
									: undefined,
								onLeaveVillage: () => {
									villageOverride = false;
								},
								onSelectBook: (itemId: string) => dispatchNav({ kind: 'select', itemId }),
								papers: papersFor(stationNotes(item), userId, isProposalConfirmed),
								stationPapers: stationPapersFor(plan, currentIndex, stationNotes, userId),
							},
							stageView,
						)
					: m(
							'.shell.teacher-watch__flat',
							m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
								m('p.sr-only', t('teacher.view.watching')),
								stageView,
							]),
						),
			]);
		},
	};
}
