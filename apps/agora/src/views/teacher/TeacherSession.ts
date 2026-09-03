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
import { planItemLabel } from '../../components/StageNav';
import { getTopicPackage, loadTopicPackage } from '../../lib/topic';
import { CountdownTimer } from '../../components/CountdownTimer';
import { QRShare } from '../../components/QRShare';
import { LookPicker } from '../../components/LookPicker';
import { classLooks } from '../../lib/looks';
import {
	AgoraSessionMode,
	AgoraStage,
	AgoraThemeChoice,
	resolveAgoraTheme,
	AgoraStagePlanItem,
	ChallengePhase,
	VotingStageSettings,
} from '@freedi/shared-types';
import { setSessionTheme, setVotingSettings } from '../../lib/teacher';
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
import { questionPanel, triggerLine } from './DeliberationCards';
import { ClassPanel, classProgressCard, progressFacts } from './ClassPanel';
import { MessagesPanel } from './MessagesPanel';
import { StudentThreadDrawer } from './StudentThreadDrawer';
import {
	listenToTeacherConsole,
	realNameOf,
	stopTeacherConsole,
	unreadRepliesTotal,
} from '../../lib/teacherConsole';

/** The console's three faces: the board, the class, and what the class wrote */
type ConsoleTab = 'live' | 'class' | 'messages';
const TABS: readonly ConsoleTab[] = ['live', 'class', 'messages'];

/**
 * Teacher live panel — projector-friendly: the stage rail, class progress,
 * stage instructions, the per-stage panel (answers, the auto-vote rule, the
 * ballot), join code + QR, and the one button that opens the next stage.
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
	let savingPlan = false;
	let planSaveFailed = false;
	let tab: ConsoleTab = 'live';
	/** The student whose private thread is open beside the console, and which text it is about */
	let drawerUid: string | null = null;
	let drawerAbout: string | undefined;
	let projectorLinkCopied = false;

	function openDrawer(studentUid: string, aboutStatementId?: string): void {
		drawerUid = studentUid;
		drawerAbout = aboutStatementId;
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

	/** The visible line under the advance button when the server said no */
	function advanceErrorLine(): m.Children {
		return advanceFailed ? m('p.join__error', t('teacher.advance_failed')) : null;
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

			const joinUrl = `${window.location.origin}/join/${session.code}`;
			const plan = getStagePlan();
			const currentIndex = getCurrentPlanIndex();
			const current = plan[currentIndex];
			const next = plan[currentIndex + 1] ?? null;
			const nextIndex = currentIndex + 1;
			const planOwnsVoting = Boolean(session.stagePlan && session.stagePlan.length > 0);
			const topic = getTopicPackage(session.topicPackageId);
			if (!topic) loadTopicPackage(session.topicPackageId);
			const hasCharacters = topic ? topic.kind !== 'quick' : true;

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

			const facts = progressFacts(proposals, answers, voterUids);
			// How many texts each student weighed — from the anonymous timeline the
			// square already streams (evaluator ids only, never values)
			const ratingsByUid = new Map<string, number>();
			for (const raters of Object.values(studentEvalTimes)) {
				for (const rater of raters) {
					ratingsByUid.set(rater.evaluatorId, (ratingsByUid.get(rater.evaluatorId) ?? 0) + 1);
				}
			}
			const unread = unreadRepliesTotal();

			const tabStrip = m(
				'.teacher-tabs',
				{ role: 'tablist' },
				TABS.map((name) =>
					m(
						'button.teacher-tabs__tab',
						{
							key: name,
							type: 'button',
							role: 'tab',
							'aria-selected': String(tab === name),
							class: tab === name ? 'teacher-tabs__tab--on' : undefined,
							onclick: () => {
								tab = name;
							},
						},
						[
							t(`teacher.tab_${name}`),
							name !== 'live' && unread > 0
								? m('span.class-panel__badge', { 'aria-hidden': 'true' }, String(unread))
								: null,
						],
					),
				),
			);

			const tabPanel =
				tab === 'class'
					? m(ClassPanel, {
							plan,
							currentIndex,
							participants,
							facts,
							ratingsByUid,
							onMessage: openDrawer,
						})
					: m(MessagesPanel, { session, participants, onMessage: openDrawer });

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

			const projectorRow = m('.teacher__mode-row.teacher__projector', [
				m(
					'button.btn.btn--secondary.btn--sm',
					{ type: 'button', onclick: () => window.open(projectorUrl(), '_blank', 'noopener') },
					[m(Icon, { name: 'era', size: 16 }), ` ${t('teacher.open_projector')}`],
				),
				m(
					'button.btn.btn--ghost.btn--sm',
					{
						type: 'button',
						onclick: () => {
							void navigator.clipboard?.writeText(projectorUrl()).then(() => {
								projectorLinkCopied = true;
								m.redraw();
								window.setTimeout(() => {
									projectorLinkCopied = false;
									m.redraw();
								}, 2000);
							});
						},
					},
					t(projectorLinkCopied ? 'teacher.projector_link_copied' : 'teacher.copy_projector_link'),
				),
			]);

			const advanceButton = (primary: boolean): m.Children =>
				next
					? m(
							primary ? 'button.btn.btn--primary.btn--lg' : 'button.btn.btn--secondary.btn--full',
							{
								disabled: (primary && participants.length === 0) || advancing,
								onclick: () => handleAdvance(nextIndex),
							},
							current.stage === AgoraStage.lobby
								? t('teacher.start_journey')
								: next.stage === AgoraStage.ended
									? t('teacher.end_game')
									: t('teacher.open_next', { stage: planItemLabel(next) }),
						)
					: null;

			// The stage rail: every item, the current one lit, the closed ones ticked
			const planRail = m('.card.stack.teacher-plan', [
				m('.class-progress__head', [
					m('p.teacher__section-title', t('teacher.plan_title')),
					next && next.stage !== AgoraStage.ended && !editingPlan
						? m(
								'button.btn.btn--sm.btn--ghost',
								{
									onclick: () => {
										editingPlan = plan
											.filter((item) => item.stage !== AgoraStage.ended)
											.map((item) => ({ ...item }));
									},
								},
								t('teacher.edit_plan'),
							)
						: null,
				]),
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
									savingPlan ? t('teacher.creating') : t('teacher.save_plan'),
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
					: m(
							'ol.teacher-plan__list',
							plan
								.filter((item) => item.stage !== AgoraStage.ended)
								.map((item, index) =>
									m(
										'li.teacher-plan__item',
										{
											key: item.itemId,
											class:
												index < currentIndex
													? 'teacher-plan__item--done'
													: index === currentIndex
														? 'teacher-plan__item--current'
														: undefined,
											'aria-current': index === currentIndex ? 'step' : undefined,
										},
										[
											m(
												'span.teacher-plan__mark',
												index < currentIndex
													? m(Icon, { name: 'check', size: 14 })
													: String(index + 1),
											),
											m('span.teacher-plan__label', planItemLabel(item)),
											item.stage === AgoraStage.voting && session.stageState?.[item.itemId]?.trigger
												? m(
														'span.teacher-plan__note',
														t(`teacher.trigger_fired_${session.stageState[item.itemId].trigger}`),
													)
												: null,
										],
									),
								),
						),
			]);

			// Results/ended: the teacher projects the same transformed map + score
			if (current.stage === AgoraStage.results || current.stage === AgoraStage.ended) {
				if (!topic) {
					return m(
						'.shell',
						m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
					);
				}

				return m('.shell.shell--wide', [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						tabStrip,
						tab === 'live' ? m(Results, { session, topic }) : tabPanel,
						projectorRow,
						advanceErrorLine(),
						advanceButton(false),
					]),
					drawer,
				]);
			}

			return m('.shell.shell--wide', [
				m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
					planRail,
					tabStrip,

					...(tab !== 'live'
						? [tabPanel]
						: [
								classProgressCard(current, participants, facts),

								topic
									? m(TeacherInstructions, {
											stage: current.stage,
											topic,
											questionTitle: current.title,
											questionExplanation: current.explanation,
										})
									: null,

								inQuestion ? questionPanel(session, current, answers) : null,

								// Set while the class still deliberates — by the time the ballot
								// is drawn up the settings have already been read.
								inDeliberation && (next?.stage === AgoraStage.voting || !planOwnsVoting)
									? votingSettingsCard(
											session.votingSettings,
											savingSettings,
											planOwnsVoting,
											saveVotingSettings,
										)
									: null,

								// While the vote is open the teacher holds the reveal, and always
								// sees the tallies themselves — they cannot decide when to show
								// the room something they cannot see.
								inVoting
									? [
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
								// deliberation panel shows progress and the auto-vote rule's state
								inDeliberation
									? m('.card.stack', [
											m('.delib__header', [
												session.roundEndsAt
													? m(CountdownTimer, { endsAt: session.roundEndsAt })
													: null,
												m(
													'span.values__score',
													`${t('teacher.proposals_count')}: ${proposals.length}`,
												),
											]),
											triggerLine(current, next?.stage === AgoraStage.voting),
										])
									: null,

								// The room's look: the two presets and whatever the class has
								// built so far. Every phone that has not chosen its own follows
								// this; the teacher can also crown a student's creation as the
								// class look. A civic square wears Odyssey's and is not asked.
								session.sessionMode !== AgoraSessionMode.civic
									? m('.card.stack.teacher-look', [
											m('p.teacher__section-title', t('teacher.look_title')),
											m('p.teacher-look__hint', t('teacher.look_hint')),
											m(LookPicker, {
												current: resolveAgoraTheme(session, null),
												classLooks: classLooks(participants, undefined),
												onWear: (choice) => {
													if (choice) saveLook(choice);
												},
											}),
										])
									: null,
							]),

					m('.card.teacher__code-panel', [
						// The join code stays on the board through EVERY stage, so a
						// latecomer can always join mid-lesson
						m('p.teacher__section-title', t('teacher.session_code')),
						m('.teacher__code', session.code),
						projectorRow,
						current.stage === AgoraStage.lobby
							? [m(QRShare, { url: joinUrl }), m('p.lobby__status', t('teacher.scan_to_join'))]
							: [
									m('p.teacher__section-title', t('teacher.current_stage')),
									m('h3', planItemLabel(current)),
								],
						m('.text-center', [
							m('span.lobby__count', String(participants.length)),
							m('p.lobby__status', ` ${t('teacher.participants')}`),
						]),
						advanceErrorLine(),
						advanceButton(true) ?? m('p.lobby__status', planItemLabel(current)),
					]),
				]),
				drawer,
			]);
		},
	};
}
