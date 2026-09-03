import m from 'mithril';
import { t } from '../../lib/i18n';
import {
	AGORA_CHALLENGE,
	AGORA_VOTING,
	ChallengePhase,
	CutoffBy,
	ResultsBy,
	VotingGameState,
	VotingStageSettings,
} from '@freedi/shared-types';

/**
 * The teacher's voting cards, moved out of TeacherSession so the live console
 * can grow a Class tab and a Messages tab without becoming unreadable. Three
 * cards: how the vote WILL run (set during deliberation), the controls held
 * while it is open, and the challenge round's turn console.
 */

/** The ballot select's plain values → the shared enum; anything unknown is the default */
function votingCutoffFromSelectValue(value: string): CutoffBy {
	if (value === 'threshold') return CutoffBy.aboveThreshold;
	if (value === 'all') return CutoffBy.all;

	return CutoffBy.topOptions;
}

/**
 * How the vote will run, set while the class is still deliberating.
 *
 * Defaults are live even when the teacher never opens this card: an untouched
 * session votes on the top three by consensus, and the most-voted proposal
 * wins outright. Every control here only narrows that. A session with an
 * explicit plan owns its voting item outright, so the on/off switch is not
 * offered there — remove the stage from the plan instead.
 */
export function votingSettingsCard(
	settings: VotingStageSettings | undefined,
	saving: boolean,
	planOwnsVoting: boolean,
	onSave: (next: VotingStageSettings) => void,
): m.Children {
	const selection = settings?.selection;
	const enabled = planOwnsVoting || settings?.enabled !== false;
	const cutoffBy = selection?.cutoffBy ?? CutoffBy.topOptions;
	const byThreshold = cutoffBy === CutoffBy.aboveThreshold;
	const byAll = cutoffBy === CutoffBy.all;
	const topX = selection?.numberOfResults ?? AGORA_VOTING.DEFAULT_TOP_X;
	const cutoff = selection?.cutoffNumber ?? AGORA_VOTING.DEFAULT_CUTOFF_CP;
	const winThreshold = settings?.winningConsensusThreshold;
	const challengeGame = settings?.challengeGame === true;
	const maxTurns = settings?.challengeMaxTurns ?? AGORA_CHALLENGE.DEFAULT_MAX_TURNS;

	// Spread what is already stored first, so a control this card does not own
	// — the reveal and live-reorder switches the teacher flips from the live
	// panel during the vote — is never silently dropped by a save from here.
	const base = (): VotingStageSettings => ({
		...settings,
		...(planOwnsVoting ? {} : { enabled }),
		selection: {
			resultsBy: ResultsBy.consensus,
			cutoffBy,
			numberOfResults: topX,
			cutoffNumber: cutoff,
		},
		...(winThreshold !== undefined ? { winningConsensusThreshold: winThreshold } : {}),
	});
	const patch = (next: Partial<VotingStageSettings>): void => onSave({ ...base(), ...next });

	return m('.card.stack.voting-settings', [
		m('p.teacher__section-title', t('teacher.voting_settings')),

		planOwnsVoting
			? null
			: m('label.voting-settings__row', [
					m('input[type=checkbox]', {
						checked: enabled,
						disabled: saving,
						onchange: (event: Event) =>
							patch({ enabled: (event.target as HTMLInputElement).checked }),
					}),
					m('span', t('teacher.voting_enabled')),
				]),

		enabled
			? [
					m('p.voting-settings__hint', t('teacher.voting_manual_hint')),
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
											cutoffBy: votingCutoffFromSelectValue(
												(event.target as HTMLSelectElement).value,
											),
											numberOfResults: topX,
											cutoffNumber: cutoff,
										},
									}),
							},
							[
								m(
									'option',
									{ value: 'top', selected: !byThreshold && !byAll },
									t('teacher.voting_mode_top'),
								),
								m(
									'option',
									{ value: 'threshold', selected: byThreshold },
									t('teacher.voting_mode_threshold'),
								),
								m('option', { value: 'all', selected: byAll }, t('teacher.voting_mode_all')),
							],
						),
					]),

					byAll
						? null
						: byThreshold
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
								const rest = base();
								delete rest.winningConsensusThreshold;
								onSave(raw === '' ? rest : { ...rest, winningConsensusThreshold: Number(raw) });
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
export function votingLiveCard(
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
export function challengeTurnCard(
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
