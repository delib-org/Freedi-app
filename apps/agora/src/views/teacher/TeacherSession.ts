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
import { advanceStage, updateStagePlan } from '../../lib/callables';
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
import { countedSteps, teacherStepLabel } from '../../lib/teacherSteps';
import { loadTeacherNav, navClass } from '../../lib/teacherNav';
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
import { classLabel, setSessionTheme, setVotingSettings } from '../../lib/teacher';
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

/** The console's side panels: the class, what the class wrote, the settings */
type Panel = 'class' | 'texts' | 'settings';

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
	let advancing = false;
	/** The server refused (or never received) the last advance — say so on the panel */
	let advanceFailed = false;
	let savingSettings = false;
	let challenging = false;
	let savingLook = false;
	let userId = '';
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

	function handleAdvance(toIndex: number): void {
		if (advancing) return;
		advancing = true;
		advanceFailed = false;
		advanceStage({ sessionId, toIndex })
			.then(() => {
				advanceFailed = false;
			})
			.catch((error: unknown) => {
				// A rejection swallowed into the console leaves the teacher
				// pressing a button that does nothing — the panel must say it.
				advanceFailed = true;
				console.error('[Teacher] Advance stage failed:', error);
			})
			.finally(() => {
				advancing = false;
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
				listenToTeacherConsole(sessionId, userId);
			}

			const { session, participants, loading, error } = getSessionState();

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
			const facts = progressFacts(proposals, answers, voterUids, roundRatedByUid);
			const unread = unreadRepliesTotal();
			const ended = current.stage === AgoraStage.ended;
			const atResults = current.stage === AgoraStage.results || ended;

			// The header: the lesson's name, the class, the code — and on a phone
			// the projector and the cog fold into the menu, where they still fit
			const menuItems: TeacherNavMenuItem[] = [
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
				trailing: [
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
			const action: StripAction | null = ended
				? null
				: {
						label:
							current.stage === AgoraStage.lobby
								? t('teacher.start_journey')
								: !next || next.stage === AgoraStage.ended
									? t('teacher.end_game')
									: t('teacher.open_next', { stage: teacherStepLabel(next) }),
						onclick: () => handleAdvance(nextIndex),
						disabled: !next || (current.stage === AgoraStage.lobby && participants.length === 0),
						busy: advancing,
					};
			const strip = m(TeacherStrip, {
				steps,
				currentIndex: stepIndex,
				action,
				reportRoute: `/teach/report/${sessionId}`,
				failed: advanceFailed,
				onRetry: () => handleAdvance(nextIndex),
			});

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
			const settingsBody = m('.stack', { style: { gap: 'var(--space-lg)' } }, [
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
								m(MessagesPanel, { session, participants, onMessage: openDrawer }),
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
							aboutStatementId: drawerAbout,
							onClose: () => {
								drawerUid = null;
								drawerAbout = undefined;
							},
						})
					: null;

			// Results/ended: the teacher projects the same transformed map + score
			if (atResults) {
				if (!topic) {
					return m(
						'.shell',
						m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
					);
				}

				return m('.shell.shell--wide.teacher-console', [
					navBar,
					strip,
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						panelChips,
						m(Results, { session, topic }),
					]),
					sidePanel,
					drawer,
				]);
			}

			return m('.shell.shell--wide.teacher-console', [
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
			]);
		},
	};
}
