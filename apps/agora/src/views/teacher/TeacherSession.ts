import m from 'mithril';
import { Icon } from '../../components/Icon';
import { t } from '../../lib/i18n';
import { ensureUser } from '../../lib/user';
import { listenToSession, stopListening, getSessionState } from '../../lib/session';
import { advanceStage } from '../../lib/callables';
import {
	getDeliberationState,
	listenToDeliberation,
	stopDeliberationListeners,
} from '../../lib/proposals';
import { Results } from '../Results';
import { Voting } from '../Voting';
import { TeacherInstructions } from './TeacherInstructions';
import { getTopicPackage, loadTopicPackage } from '../../lib/topic';
import { CountdownTimer } from '../../components/CountdownTimer';
import { QRShare } from '../../components/QRShare';
import {
	AgoraParticipant,
	AgoraStage,
	ChallengePhase,
	VotingGameState,
	VotingStageSettings,
	AGORA_CHALLENGE,
	AGORA_VOTING,
	CutoffBy,
	ResultsBy,
} from '@freedi/shared-types';
import { AgoraProposal } from '../../lib/proposals';
import { setVotingSettings } from '../../lib/teacher';
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

/**
 * Teacher live panel — projector-friendly: class progress, stage
 * instructions, join code + QR, and the "open the time tunnel" control.
 */
// valueIdentification removed from the flow (cognitive load) — enum kept
// for legacy sessions; see fn_agoraAdvanceStage STAGE_ORDER
const STAGE_ORDER: AgoraStage[] = [
	AgoraStage.lobby,
	AgoraStage.framing,
	AgoraStage.perspectives,
	AgoraStage.needs,
	AgoraStage.positioning,
	AgoraStage.deliberation,
	AgoraStage.voting,
	AgoraStage.results,
	AgoraStage.ended,
];

/** Stages where students move through self-paced sub-steps the teacher can't see on the projector */
const PROGRESS_STAGES = new Set<AgoraStage>([
	AgoraStage.framing,
	AgoraStage.perspectives,
	AgoraStage.needs,
	AgoraStage.positioning,
	AgoraStage.deliberation,
	AgoraStage.voting,
]);

/** One student's progress within the current stage: done flag + a compact label */
function participantProgress(
	participant: AgoraParticipant,
	stage: AgoraStage,
	proposals: readonly AgoraProposal[],
	voterUids: ReadonlySet<string>,
): { done: boolean; label: m.Children } {
	if (stage === AgoraStage.voting) {
		const done = voterUids.has(participant.userId);

		return { done, label: done ? m(Icon, { name: 'check', size: 16 }) : '—' };
	}
	if (stage === AgoraStage.positioning) {
		const done = participant.campPosition !== undefined;

		return { done, label: done ? m(Icon, { name: 'check', size: 16 }) : '—' };
	}
	if (stage === AgoraStage.deliberation) {
		const done = proposals.some((proposal) => proposal.creatorId === participant.userId);

		return { done, label: done ? m(Icon, { name: 'check', size: 16 }) : '—' };
	}
	const progress = participant.stageProgress;
	// Progress from an earlier stage says nothing about this one
	if (!progress || progress.stage !== stage) return { done: false, label: '—' };
	const done = progress.scenesDone >= progress.scenesTotal;

	return {
		done,
		label: done
			? m(Icon, { name: 'check', size: 16 })
			: `${progress.scenesDone}/${progress.scenesTotal}`,
	};
}

/** Who finished the current stage's self-paced steps — the "can I advance?" card */
function classProgressCard(
	stage: AgoraStage,
	participants: readonly AgoraParticipant[],
	proposals: readonly AgoraProposal[],
	voterUids: ReadonlySet<string>,
): m.Children {
	if (!PROGRESS_STAGES.has(stage) || participants.length === 0) return null;
	const entries = participants.map((participant) => ({
		participant,
		...participantProgress(participant, stage, proposals, voterUids),
	}));
	const doneCount = entries.filter((entry) => entry.done).length;
	const countKey =
		stage === AgoraStage.positioning
			? 'teacher.positioned_count'
			: stage === AgoraStage.voting
				? 'teacher.voted_count'
				: 'teacher.finished_count';

	return m('.card.class-progress', [
		m('.class-progress__head', [
			m('p.teacher__section-title', t('teacher.class_progress')),
			m(
				'span.class-progress__count',
				{ class: doneCount === entries.length ? 'class-progress__count--all' : undefined },
				t(countKey, { n: doneCount, total: entries.length }),
			),
		]),
		m(
			'.class-progress__chips',
			entries.map((entry) =>
				m(
					'span.class-progress__chip',
					{
						key: entry.participant.participantId,
						class: entry.done ? 'class-progress__chip--done' : undefined,
					},
					[
						m('span.class-progress__name', entry.participant.anonName),
						m('span.class-progress__state', entry.label),
					],
				),
			),
		),
	]);
}

/**
 * How the vote will run, set while the class is still deliberating.
 *
 * Defaults are live even when the teacher never opens this card: an untouched
 * session votes on the top three by consensus, and the most-voted proposal
 * wins outright. Every control here only narrows that.
 */
function votingSettingsCard(
	sessionId: string,
	settings: VotingStageSettings | undefined,
	saving: boolean,
	onSave: (next: VotingStageSettings) => void,
): m.Children {
	const selection = settings?.selection;
	const enabled = settings?.enabled !== false;
	const byThreshold = selection?.cutoffBy === CutoffBy.aboveThreshold;
	const topX = selection?.numberOfResults ?? AGORA_VOTING.DEFAULT_TOP_X;
	const cutoff = selection?.cutoffNumber ?? AGORA_VOTING.DEFAULT_CUTOFF_CP;
	const winThreshold = settings?.winningConsensusThreshold;
	const challengeGame = settings?.challengeGame === true;
	const maxTurns = settings?.challengeMaxTurns ?? AGORA_CHALLENGE.DEFAULT_MAX_TURNS;

	// Spread what is already stored first, so a control added here (or set from
	// the live panel during the vote) is never silently dropped by a save from
	// a card that predates it.
	const patch = (next: Partial<VotingStageSettings>): void =>
		onSave({
			...settings,
			enabled,
			selection: {
				resultsBy: ResultsBy.consensus,
				cutoffBy: byThreshold ? CutoffBy.aboveThreshold : CutoffBy.topOptions,
				numberOfResults: topX,
				cutoffNumber: cutoff,
			},
			...(winThreshold !== undefined ? { winningConsensusThreshold: winThreshold } : {}),
			...next,
		});

	return m('.card.stack.voting-settings', [
		m('p.teacher__section-title', t('teacher.voting_settings')),

		m('label.voting-settings__row', [
			m('input[type=checkbox]', {
				checked: enabled,
				disabled: saving,
				onchange: (event: Event) => patch({ enabled: (event.target as HTMLInputElement).checked }),
			}),
			m('span', t('teacher.voting_enabled')),
		]),

		enabled
			? [
					m('label.voting-settings__row', [
						m('span', t('teacher.voting_mode')),
						m(
							'select',
							{
								disabled: saving,
								onchange: (event: Event) =>
									patch({
										selection: {
											resultsBy: ResultsBy.consensus,
											cutoffBy:
												(event.target as HTMLSelectElement).value === 'threshold'
													? CutoffBy.aboveThreshold
													: CutoffBy.topOptions,
											numberOfResults: topX,
											cutoffNumber: cutoff,
										},
									}),
							},
							[
								m('option', { value: 'top', selected: !byThreshold }, t('teacher.voting_mode_top')),
								m(
									'option',
									{ value: 'threshold', selected: byThreshold },
									t('teacher.voting_mode_threshold'),
								),
							],
						),
					]),

					byThreshold
						? m('label.voting-settings__row', [
								m('span', t('teacher.voting_threshold')),
								m('input[type=number]', {
									value: cutoff,
									step: '0.05',
									min: '-1',
									max: '1',
									disabled: saving,
									onchange: (event: Event) =>
										patch({
											selection: {
												resultsBy: ResultsBy.consensus,
												cutoffBy: CutoffBy.aboveThreshold,
												numberOfResults: topX,
												cutoffNumber: Number((event.target as HTMLInputElement).value),
											},
										}),
								}),
							])
						: m('label.voting-settings__row', [
								m('span', t('teacher.voting_top_x')),
								m('input[type=number]', {
									value: topX,
									min: String(AGORA_VOTING.MIN_TOP_X),
									max: String(AGORA_VOTING.MAX_TOP_X),
									disabled: saving,
									onchange: (event: Event) =>
										patch({
											selection: {
												resultsBy: ResultsBy.consensus,
												cutoffBy: CutoffBy.topOptions,
												numberOfResults: Number((event.target as HTMLInputElement).value),
												cutoffNumber: cutoff,
											},
										}),
								}),
							]),

					// Blank means "the most-voted proposal wins, full stop"
					m('label.voting-settings__row', [
						m('span', t('teacher.voting_win_threshold')),
						m('input[type=number]', {
							value: winThreshold ?? '',
							step: '0.01',
							min: '-1',
							max: '1',
							placeholder: '—',
							disabled: saving,
							onchange: (event: Event) => {
								const raw = (event.target as HTMLInputElement).value;
								const next: VotingStageSettings = {
									enabled,
									selection: {
										resultsBy: ResultsBy.consensus,
										cutoffBy: byThreshold ? CutoffBy.aboveThreshold : CutoffBy.topOptions,
										numberOfResults: topX,
										cutoffNumber: cutoff,
									},
									...(raw === '' ? {} : { winningConsensusThreshold: Number(raw) }),
								};
								onSave(next);
							},
						}),
					]),
					m('p.voting-settings__hint', t('teacher.voting_win_threshold_hint')),

					// Whether the ballot can still change once the vote has started.
					// Off unless the teacher says otherwise: no class agreed in
					// advance to have its ballot rewritten mid-election.
					m('label.voting-settings__row', [
						m('input[type=checkbox]', {
							checked: challengeGame,
							disabled: saving,
							onchange: (event: Event) =>
								patch({ challengeGame: (event.target as HTMLInputElement).checked }),
						}),
						m('span', t('teacher.challenge_game')),
					]),
					m('p.voting-settings__hint', t('teacher.challenge_game_hint')),

					challengeGame
						? m('label.voting-settings__row', [
								m('span', t('teacher.challenge_max_turns')),
								m('input[type=number]', {
									value: maxTurns,
									min: String(AGORA_CHALLENGE.MIN_MAX_TURNS),
									max: String(AGORA_CHALLENGE.MAX_TURNS_CEILING),
									disabled: saving,
									onchange: (event: Event) =>
										patch({
											challengeMaxTurns: Number((event.target as HTMLInputElement).value),
										}),
								}),
							])
						: null,
					challengeGame
						? m('p.voting-settings__hint', t('teacher.challenge_max_turns_hint'))
						: null,
				]
			: null,
	]);
}

/**
 * The controls the teacher holds WHILE the vote is open.
 *
 * Two switches, both off by default. Revealing the tallies is a decision about
 * the room — a running count is an argument, and the leading option gathers
 * votes for leading — so it is the teacher's to make, usually at the close.
 * Live reorder is the flourish that goes with it, and is only offered once the
 * numbers are visible: sorting by a hidden count would leak it.
 *
 * The turnout — how many have voted — is not on this card, because it is never
 * hidden from anyone.
 */
function votingLiveCard(
	settings: VotingStageSettings | undefined,
	voted: number,
	classSize: number,
	saving: boolean,
	challengeLive: boolean,
	onSave: (next: VotingStageSettings) => void,
): m.Children {
	const showResults = settings?.showResults === true;
	const liveReorder = settings?.liveReorder === true;
	const patch = (next: Partial<VotingStageSettings>): void => onSave({ ...settings, ...next });

	return m('.card.stack.voting-settings', [
		m('.voting-settings__head', [
			m('p.teacher__section-title', t('voting.title')),
			m(
				'span.voting-settings__turnout',
				{
					class: voted >= classSize && classSize > 0 ? 'voting-settings__turnout--all' : undefined,
				},
				t('teacher.voted_count', { n: voted, total: classSize }),
			),
		]),

		m('label.voting-settings__row', [
			m('input[type=checkbox]', {
				checked: showResults,
				// A challenge is judged blind, so this switch does nothing while one
				// is standing. Disable it rather than let the teacher flip a
				// control and watch the room not change.
				disabled: saving || challengeLive,
				onchange: (event: Event) =>
					patch({ showResults: (event.target as HTMLInputElement).checked }),
			}),
			m('span', t('teacher.show_results')),
		]),
		challengeLive
			? m('p.voting-settings__hint', t('teacher.results_locked_during_challenge'))
			: null,

		m('label.voting-settings__row', [
			m('input[type=checkbox]', {
				checked: liveReorder,
				// Sorting by a number the class cannot see would leak it
				disabled: saving || !showResults,
				onchange: (event: Event) =>
					patch({ liveReorder: (event.target as HTMLInputElement).checked }),
			}),
			m('span', t('teacher.live_reorder')),
		]),

		m(
			'p.voting-settings__hint',
			t(showResults ? 'teacher.results_shown_hint' : 'teacher.results_hidden_hint'),
		),
	]);
}

export interface ChallengeActions {
	start(): void;
	openFloor(): void;
	openVote(): void;
	resolve(): void;
	skip(): void;
	next(): void;
	end(): void;
}

/**
 * How long the rest of the round will take, in minutes, at the pace this class
 * has actually kept.
 *
 * The rotation is the whole class and a turn costs a minute or two, so a
 * teacher who starts one without this number finds out how long it takes by
 * running out of lesson. Measured rather than assumed: a class that is flying
 * should not be told it is going slowly.
 */
function paceMinutes(game: VotingGameState): number | null {
	const done = game.turnIndex;
	if (done < 1) return null;
	const remaining = Math.min(game.order.length, game.maxTurns) - done;
	if (remaining <= 0) return 0;
	const perTurn = (Date.now() - game.startedAt) / done;

	return Math.max(1, Math.round((perTurn * remaining) / 60_000));
}

/**
 * The round, run from one card: one primary button that says what happens
 * next, and the ways out beside it.
 *
 * Skip and End sit on every phase on purpose. The failure this round is most
 * likely to meet is a student who has left the room, and recovering from that
 * must cost one tap rather than a decision.
 */
function challengeTurnCard(
	game: VotingGameState | null,
	saving: boolean,
	actions: ChallengeActions,
): m.Children {
	if (!game || game.phase === ChallengePhase.ended) {
		return m('.card.stack.challenge-turn', [
			m('p.teacher__section-title', t('teacher.challenge_title')),
			m(
				'p.voting-settings__hint',
				t(game ? 'teacher.challenge_over' : 'teacher.challenge_not_started'),
			),
			!game
				? m(
						'button.teacher__advance',
						{ disabled: saving, onclick: () => actions.start() },
						t('teacher.challenge_start'),
					)
				: null,
		]);
	}

	const speaker = game.speakerAnonName ?? '';
	const minutes = paceMinutes(game);
	const total = Math.min(game.order.length, game.maxTurns);
	const lastTurn = game.turnIndex + 1 >= total;

	const primary = ((): { label: string; run: () => void; disabled?: boolean } => {
		switch (game.phase) {
			case ChallengePhase.idle:
				return { label: t('teacher.open_floor', { name: speaker }), run: actions.openFloor };
			case ChallengePhase.floor:
				return {
					label: t('teacher.open_vote'),
					run: actions.openVote,
					// Nothing to vote on until the student has actually sent something
					disabled: !game.challengerStatementId,
				};
			case ChallengePhase.vote:
				return { label: t('teacher.close_resolve'), run: actions.resolve };
			default:
				return {
					label: t(lastTurn ? 'teacher.finish_round' : 'teacher.next_speaker'),
					run: actions.next,
				};
		}
	})();

	return m('.card.stack.challenge-turn', [
		m('.voting-settings__head', [
			m('p.teacher__section-title', t('teacher.challenge_title')),
			m(
				'span.voting-settings__turnout',
				t('teacher.challenge_pace_count', { n: game.turnIndex + 1, total }),
			),
		]),

		m('p.challenge-turn__speaker', t('teacher.challenge_speaker', { name: speaker })),

		game.phase === ChallengePhase.floor && !game.challengerStatementId
			? m('p.voting-settings__hint', t('teacher.challenge_waiting_pitch'))
			: null,

		m(
			'button.challenge-turn__primary',
			{ disabled: saving || primary.disabled === true, onclick: () => primary.run() },
			primary.label,
		),

		m('.challenge-turn__secondary', [
			game.phase === ChallengePhase.idle || game.phase === ChallengePhase.floor
				? m(
						'button.challenge-turn__minor',
						{ disabled: saving, onclick: () => actions.skip() },
						t('teacher.skip_speaker', { name: speaker }),
					)
				: null,
			m(
				'button.challenge-turn__minor',
				{ disabled: saving, onclick: () => actions.end() },
				t('teacher.end_round'),
			),
		]),

		minutes !== null
			? m('p.voting-settings__hint', t('teacher.challenge_pace', { minutes: String(minutes) }))
			: null,

		roster(game),
	]);
}

/** The rotation as the teacher reads it: done, now, passed, skipped, waiting. */
function roster(game: VotingGameState): m.Children {
	const shown = Math.min(game.order.length, game.maxTurns);
	const passed = new Set(game.passedUserIds);
	const skipped = new Set(game.skippedUserIds);

	return m(
		'.challenge__roster',
		game.order.slice(0, shown).map((uid, index) => {
			const now = index === game.turnIndex;
			const modifier = now
				? 'challenge__seat--now'
				: passed.has(uid)
					? 'challenge__seat--passed'
					: skipped.has(uid)
						? 'challenge__seat--skipped'
						: index < game.turnIndex
							? 'challenge__seat--done'
							: '';

			return m(
				'span.challenge__seat',
				{ key: uid, class: modifier || undefined },
				game.orderNames[index] ?? '',
			);
		}),
	);
}

export function TeacherSession(initialVnode: m.Vnode<{ id: string }>): m.Component<{ id: string }> {
	const sessionId = initialVnode.attrs.id;
	let advancing = false;
	let savingSettings = false;
	let challenging = false;
	let userId = '';

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

	function handleAdvance(nextStage: AgoraStage): void {
		if (advancing) return;
		advancing = true;
		advanceStage({ sessionId, stage: nextStage })
			.catch((error: unknown) => {
				console.error('[Teacher] Advance stage failed:', error);
			})
			.finally(() => {
				advancing = false;
				m.redraw();
			});
	}

	return {
		onremove() {
			stopListening();
			stopDeliberationListeners();
			stopVotingListeners();
		},

		view() {
			// Re-attach on every render (idempotent) — see GameController note.
			if (userId) listenToSession(sessionId, userId);

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
			// Legacy sessions on the removed valueIdentification stage advance
			// as if they were at needs (its old predecessor)
			const stageIndex =
				session.stage === AgoraStage.valueIdentification
					? STAGE_ORDER.indexOf(AgoraStage.needs)
					: STAGE_ORDER.indexOf(session.stage);
			const rawNextStage =
				stageIndex >= 0 && stageIndex < STAGE_ORDER.length - 1 ? STAGE_ORDER[stageIndex + 1] : null;
			// A teacher who turned the vote off never sees the button for it. The
			// server permits the jump — voting is a stage the class may skip —
			// so this is purely which door the panel offers.
			const nextStage =
				rawNextStage === AgoraStage.voting && session.votingSettings?.enabled === false
					? AgoraStage.results
					: rawNextStage;

			const inDeliberation = session.stage === AgoraStage.deliberation;
			if (inDeliberation && userId) listenToDeliberation(sessionId, userId);
			const { proposals } = getDeliberationState();

			const inVoting = session.stage === AgoraStage.voting;
			if (inVoting && userId) listenToVoting(sessionId, session.challengeQuestionId, userId);
			const { voterUids } = getVotingState();
			const challengePhase = getGame(session)?.phase;
			const challengeLive =
				challengePhase === ChallengePhase.vote || challengePhase === ChallengePhase.resolving;

			// Results/ended: the teacher projects the same transformed map + score
			if (session.stage === AgoraStage.results || session.stage === AgoraStage.ended) {
				const topic = getTopicPackage(session.topicPackageId);
				if (!topic) {
					loadTopicPackage(session.topicPackageId);

					return m(
						'.shell',
						m('.shell__content', { style: { justifyContent: 'center' } }, m('.spinner')),
					);
				}

				return m('.shell.shell--wide', [
					m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
						m(Results, { session, topic }),
						nextStage
							? m(
									'button.btn.btn--secondary.btn--full',
									{
										disabled: advancing,
										onclick: () => handleAdvance(nextStage),
									},
									t('teacher.advance', { stage: t(`stage.${nextStage}`) }),
								)
							: null,
					]),
				]);
			}

			// The instruction text students read for the current stage —
			// projected so the teacher can read along and lead a discussion
			const topic = getTopicPackage(session.topicPackageId);
			if (!topic) loadTopicPackage(session.topicPackageId);

			return m('.shell.shell--wide', [
				m('.shell__content', { style: { gap: 'var(--space-lg)' } }, [
					classProgressCard(session.stage, participants, proposals, voterUids),

					topic ? m(TeacherInstructions, { stage: session.stage, topic }) : null,

					// Set while the class still deliberates — by the time the ballot
					// is drawn up the settings have already been read.
					inDeliberation
						? votingSettingsCard(
								sessionId,
								session.votingSettings,
								savingSettings,
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
									alwaysShowResults: true,
									readOnly: true,
								}),
							]
						: null,

					// Students cycle propose→rate→help on their own; the teacher's
					// deliberation panel just shows progress (no round buttons)
					inDeliberation
						? m('.card.stack', [
								m('.delib__header', [
									session.roundEndsAt ? m(CountdownTimer, { endsAt: session.roundEndsAt }) : null,
									m('span.values__score', `${t('teacher.proposals_count')}: ${proposals.length}`),
								]),
							])
						: null,

					m('.card.teacher__code-panel', [
						// The join code stays on the board through EVERY stage, so a
						// latecomer can always join mid-lesson
						m('p.teacher__section-title', t('teacher.session_code')),
						m('.teacher__code', session.code),
						session.stage === AgoraStage.lobby
							? [m(QRShare, { url: joinUrl }), m('p.lobby__status', t('teacher.scan_to_join'))]
							: [
									m('p.teacher__section-title', t('teacher.current_stage')),
									m('h3', t(`stage.${session.stage}`)),
								],
						m('.text-center', [
							m('span.lobby__count', String(participants.length)),
							m('p.lobby__status', ` ${t('teacher.participants')}`),
						]),
						nextStage
							? m(
									'button.btn.btn--primary.btn--lg',
									{
										disabled: participants.length === 0 || advancing,
										onclick: () => handleAdvance(nextStage),
									},
									session.stage === AgoraStage.lobby
										? t('teacher.start_journey')
										: t('teacher.advance', { stage: t(`stage.${nextStage}`) }),
								)
							: m('p.lobby__status', t(`stage.${session.stage}`)),
					]),
				]),
			]);
		},
	};
}
