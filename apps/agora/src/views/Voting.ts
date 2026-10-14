import m from 'mithril';
import { t } from '../lib/i18n';
import { stalledBanner } from '../components/StalledBanner';
import { CarriedContext } from '../components/CarriedContext';
import { ChallengeCards } from '../components/ChallengeCards';
import { standingBar } from '../components/StandingBar';
import { castVote, getVotingState, totalVotes } from '../lib/voting';
import { createBallotSender, type BallotChoice } from '../lib/flows/ballotTap';
import {
	ballotStatus,
	followFrozenOrder,
	REORDER_RESUME_MS,
	REORDER_SLIDE_MS,
} from '../lib/flows/ballotView';
import { logError } from '@freedi/shared-utils';
import { getCurrentPlanIndex, getSessionState } from '../lib/session';
import { challengerCandidate, getGame, passTurn, pitchChallenger } from '../lib/votingGame';
import {
	ChallengePhase,
	VOTE_AGAINST,
	type AgoraParticipant,
	type AgoraSession,
	type VotingCandidate,
} from '@freedi/shared-types';

export interface VotingAttrs {
	session: AgoraSession;
	/** Absent on the projector, which has no seat */
	myParticipant?: AgoraParticipant;
	userId: string;
	/** The vote is over (or the player stepped back to it): tallies only */
	readOnly?: boolean;
	/**
	 * The teacher's projector copy of the ballot.
	 *
	 * It is not a ballot: nobody votes from it, it is one card on a page that
	 * already has a frame, and it renders the tallies whatever the class
	 * setting says — the teacher is the one deciding when to reveal them, and
	 * they cannot decide blind.
	 */
	board?: boolean;
	/**
	 * The classroom projector: the board's read-only layout, but the reveal
	 * follows the class setting — this screen is what the STUDENTS see, so it
	 * must not show a count the teacher has not yet revealed.
	 */
	projector?: boolean;
}

/**
 * The ballot.
 *
 * Candidates come from `session.voting` — the snapshot taken when the stage
 * opened — and never from the question's live `results`, which the shared
 * selector keeps rewriting as ratings arrive. A class must not watch the
 * ballot change while it votes.
 *
 * Two shapes. Several candidates: pick one. ONE candidate: the question is
 * not "which" but "do we adopt this?" — for or against, the against side
 * counted under its own sentinel in the same vote doc.
 *
 * One vote each, changeable until the teacher closes the stage: tapping
 * another option moves the vote, tapping your own withdraws it. Counts are the
 * server's, so the projector and the phones cannot disagree.
 *
 * By default voters do NOT see the tallies while the vote is open. A running
 * count is an argument — the leading option would gather votes for leading —
 * so the teacher reveals them deliberately. What is never hidden is how many
 * people have voted: that is the room's own progress, and it belongs to
 * everyone.
 */
export function Voting(): m.Component<VotingAttrs> {
	/** A challenge-round move in the air (pitch / pass) */
	let saving = false;
	/** The session of the latest render — what the ballot's writes go to */
	let currentSession: AgoraSession | null = null;

	/**
	 * The ballot's own taps: shown the moment the finger lifts, written one at
	 * a time, last tap wins (see flows/ballotTap.ts). The options are never
	 * disabled while a write is in the air — on a slow connection that was a
	 * ballot that ignored the student and then, much later, "suddenly" voted.
	 */
	const ballot = createBallotSender({
		send: (choice: BallotChoice) => {
			if (!currentSession) return Promise.reject(new Error('No session'));

			return castVote(currentSession, choice);
		},
		onChange: () => m.redraw(),
		onError: (error: unknown, choice: BallotChoice) =>
			logError(error, {
				operation: 'agora.voting.castVote',
				statementId: currentSession?.challengeQuestionId,
				metadata: { sessionId: currentSession?.sessionId, choice },
			}),
	});

	const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
	/** statementId → where its row last sat, for the FLIP move */
	const rowOffsets = new Map<string, number>();
	/** The order last rendered, and whether this render actually changed it */
	let orderKey = '';
	let resorted = false;
	/** The classroom projector keeps the spring; a phone's list must not overshoot */
	let springy = false;
	/**
	 * A finger is on the list: the order it was pressed in. Rows never reorder
	 * under a thumb — the row slid out from under the tap that was aiming at it.
	 */
	let frozenOrder: string[] | null = null;
	let releaseTimer: ReturnType<typeof setTimeout> | undefined;

	function releaseFinger(): void {
		window.removeEventListener('pointerup', releaseFinger);
		window.removeEventListener('pointercancel', releaseFinger);
		clearTimeout(releaseTimer);
		// After the click that belongs to this press, not before it
		releaseTimer = setTimeout(() => {
			frozenOrder = null;
			m.redraw();
		}, REORDER_RESUME_MS);
	}

	function pressFinger(): void {
		clearTimeout(releaseTimer);
		frozenOrder = orderKey === '' ? null : orderKey.split('|');
		window.addEventListener('pointerup', releaseFinger);
		window.addEventListener('pointercancel', releaseFinger);
	}

	/**
	 * A proposal overtaking another is the whole point of live reorder, so the
	 * overtake has to be visible: FLIP puts the row back where the eye left it
	 * and lets it slide to its new place. A row that teleports says nothing —
	 * the class sees a different list, not a proposal winning.
	 *
	 * `offsetTop`, not `getBoundingClientRect`: on a projector someone is always
	 * scrolling, and scrolling must never read as motion.
	 *
	 * Only when the ORDER changed. Rows also shift when the reveal adds the
	 * count column and every row grows — animating that displacement would fling
	 * the whole list at the moment the teacher is trying to show it something.
	 *
	 * The Web Animations API rather than an inline transform, so the row's own
	 * hover transition and the bar's fill are never fought with.
	 */
	function flipRow(dom: HTMLElement, id: string): void {
		const now = dom.offsetTop;
		const before = rowOffsets.get(id);
		rowOffsets.set(id, now);
		if (before === undefined || reducedMotion || !resorted) return;
		const delta = before - now;
		if (Math.abs(delta) < 2 || typeof dom.animate !== 'function') return;
		dom.animate([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
			duration: springy ? 600 : REORDER_SLIDE_MS,
			// --ease-camera: no overshoot on a phone, the spring on the projector
			easing: springy ? 'cubic-bezier(0.34, 1.56, 0.64, 1)' : 'cubic-bezier(0.22, 1, 0.36, 1)',
		});
	}

	return {
		view(vnode) {
			const { session, userId, board = false, projector = false } = vnode.attrs;
			currentSession = session;
			springy = projector;
			// The projector is never a ballot, whatever the caller said
			const readOnly = board || vnode.attrs.readOnly === true;
			const candidates: VotingCandidate[] = session.voting?.candidates ?? [];
			const { selections, voterUids, loaded } = getVotingState();
			// What the student sees as their vote: the tap they just made, until
			// the server has it, and the server's copy from then on.
			const confirmedVote = getVotingState().myVoteStatementId;
			const myVoteStatementId = board ? null : ballot.displayed(confirmedVote);
			const voteSaving = !board && ballot.isSaving();
			const failedWrite = !board && !readOnly && ballot.hasFailed();
			const total = totalVotes();

			const settings = session.votingSettings;
			const game = getGame(session);
			// A challenge is being judged: the board is N+1 and the newcomer is
			// pinned on top of it.
			const challengeLive =
				game?.phase === ChallengePhase.vote || game?.phase === ChallengePhase.resolving;
			const challenger = challengeLive ? challengerCandidate(session) : null;
			// A motion is a motion only while it stands alone. The moment a
			// challenger is pinned beside it the question stops being "do we adopt
			// this?" and becomes "which of these?" — and rendering the for/against
			// pair would leave the class no way to vote for the challenge at all.
			const single = candidates.length === 1 && !challenger;

			/**
			 * A challenge is decided blind, whatever the class setting says.
			 *
			 * The teacher may already have revealed the standing ballot, and
			 * leaving it revealed here would hand the incumbents the argument the
			 * challenger is trying to make: a student can see which option is
			 * about to fall and vote to save it rather than for what they want.
			 * The teacher's own board is exempt — they decide when to reveal, and
			 * cannot decide blind.
			 */
			const showResults =
				(!projector && (board || readOnly)) || (settings?.showResults === true && !challengeLive);
			// Once the counts are on screen the ballot follows them, sliding each
			// overtake into place (flipRow) — on unless the teacher switched it off.
			// While the counts are hidden it never moves: reordering by a hidden
			// number would leak it.
			const liveReorder = showResults && settings?.liveReorder !== false;

			// Everyone always knows how much of the class has spoken
			const classSize = getSessionState().participants.length;
			const votedCount = voterUids.size;

			/**
			 * The student's ballot IS the page, so it wears the shell. The
			 * teacher's copy is one card among several on a page that already has
			 * one — and `.shell` is `min-height: 100dvh`, so nesting it opened a
			 * screen-height hole between the ballot and the join code.
			 */
			const frame = (children: m.Children): m.Children =>
				board
					? m('.voting.voting--board', children)
					: m('.shell', m('.shell__content.voting', children));

			/**
			 * The challenge round's own cards: the desk, the wait, the curtain,
			 * the reveal. The teacher gets none of them — their console runs the
			 * round, and a second copy of the same state would be one more thing
			 * to disagree with itself.
			 */
			const challengeCards = (): m.Children =>
				!readOnly && game
					? m(ChallengeCards, {
							game,
							userId,
							saving,
							onPitch: (text: string) => runTurn(() => pitchChallenger(session.sessionId, text)),
							onPass: () => runTurn(() => passTurn(session.sessionId)),
						})
					: null;

			// A class that rated nothing has an empty ballot. Say so — the
			// alternative is a screen that looks broken while the teacher works
			// out what happened. A challenge can still stand on an empty board,
			// so the round's own cards outrank the empty notice.
			if (candidates.length === 0 && !challenger) {
				return frame([
					m('h2.voting__title', t('voting.title')),
					challengeCards() ?? m('p.voting__waiting', t('voting.waiting')),
				]);
			}

			function vote(statementId: string): void {
				if (readOnly) return;
				ballot.tap(statementId, confirmedVote);
			}

			/** A move in the challenge round, with the same in-flight latch as a vote. */
			function runTurn(move: () => Promise<unknown>): void {
				if (saving) return;
				saving = true;
				move()
					.catch((error: unknown) => {
						logError(error, {
							operation: 'agora.voting.runTurn',
							statementId: currentSession?.challengeQuestionId,
							metadata: { sessionId: currentSession?.sessionId },
						});
					})
					.finally(() => {
						saving = false;
						m.redraw();
					});
			}

			const option = (
				statementId: string,
				label: m.Children,
				number: string | null,
				extraClass?: string,
				numberClass?: string,
			): m.Children => {
				const count = selections[statementId] ?? 0;
				// The projector has no vote of its own to mark
				const mine = !board && myVoteStatementId === statementId;
				const pending = mine && voteSaving;
				const unsaved = mine && failedWrite;
				// Before the first snapshot every bar would read 0% — show
				// no bar at all rather than a confident wrong number.
				const share = loaded && total > 0 ? Math.round((count / total) * 100) : 0;

				return m(
					board ? 'div.voting__option.voting__option--static' : 'button.voting__option',
					{
						key: statementId,
						type: board ? undefined : 'button',
						class:
							[
								mine ? 'voting__option--mine' : '',
								pending ? 'voting__option--saving' : '',
								unsaved ? 'voting__option--unsaved' : '',
								extraClass ?? '',
							]
								.join(' ')
								.trim() || undefined,
						'aria-pressed': board ? undefined : mine ? 'true' : 'false',
						'aria-busy': pending ? 'true' : undefined,
						disabled: board ? undefined : readOnly,
						onclick: board ? undefined : () => vote(statementId),
						oncreate: (node: m.VnodeDOM) =>
							rowOffsets.set(statementId, (node.dom as HTMLElement).offsetTop),
						onupdate: (node: m.VnodeDOM) => flipRow(node.dom as HTMLElement, statementId),
					},
					[
						// The fill sits behind the text; the number beside it is
						// what a student actually reads. Only once there is
						// something to fill: a 0% bar still paints its mint
						// leading edge, and an empty row must be EMPTY.
						showResults && share > 0
							? m('span.voting__bar', {
									style: { inlineSize: `${share}%` },
									'aria-hidden': 'true',
								})
							: null,
						m('span.voting__body', [
							// The number is the proposal's identity on the ballot, so
							// it stays with the proposal even when the list re-sorts.
							number ? m('span.voting__number', { class: numberClass }, number) : null,
							m('span.voting__label', label),
						]),
						showResults
							? m('span.voting__count', [
									m('span.voting__votes', String(count)),
									loaded && total > 0 ? m('span.voting__share', `${share}%`) : null,
								])
							: null,
						// Always rendered, so the row teaches "pick one" before any tap
						// and "mine" never rests on colour alone. The row's own
						// aria-pressed carries it for a screen reader.
						board
							? null
							: m('span.voting__radio', { 'aria-hidden': 'true' }, mine ? '\u2713' : null),
					],
				);
			};

			/**
			 * One side of a motion, as a standing column: the pillar rises from
			 * the floor as the side gathers votes, and the two stand side by side
			 * so the room compares heights, not rows.
			 */
			const standingOption = (
				statementId: string,
				label: string,
				tone: 'for' | 'against',
			): m.Children => {
				const count = selections[statementId] ?? 0;
				const mine = !board && myVoteStatementId === statementId;
				const pending = mine && voteSaving;
				const share = loaded && total > 0 ? Math.round((count / total) * 100) : 0;

				return m(
					board ? 'div.voting__option.voting__option--static' : 'button.voting__option',
					{
						key: statementId,
						type: board ? undefined : 'button',
						class: [
							'voting__option--standing',
							`voting__option--${tone}`,
							mine ? 'voting__option--mine' : '',
							pending ? 'voting__option--saving' : '',
						]
							.join(' ')
							.trim(),
						'aria-pressed': board ? undefined : mine ? 'true' : 'false',
						'aria-busy': pending ? 'true' : undefined,
						disabled: board ? undefined : readOnly,
						onclick: board ? undefined : () => vote(statementId),
					},
					standingBar({ label, count, share, showCount: showResults && loaded }),
				);
			};

			// The ballot's own order is the agreement order it was drawn in. Under
			// live reorder it follows the count instead — ties keep the original
			// order so the list cannot jitter between equal options.
			//
			// A one-candidate ballot has no order to change: for and against are
			// a fixed pair, not a ranking.
			let ordered = candidates.map((candidate, index) => ({
				id: candidate.statementId,
				candidate,
				index,
				pinned: false,
			}));
			// Reordering is suspended while a challenge stands: the pin is
			// absolute, and nothing may sort past the option the room is judging.
			if (liveReorder && !single && !challengeLive) {
				ordered.sort((a, b) => {
					const byVotes =
						(selections[b.candidate.statementId] ?? 0) - (selections[a.candidate.statementId] ?? 0);

					return byVotes !== 0 ? byVotes : a.index - b.index;
				});
			}
			if (challenger) {
				// Numbered 0 and rendered as ★ — it has no place in the ballot's
				// numbering until it has earned one.
				ordered.unshift({
					id: challenger.statementId,
					candidate: challenger,
					index: -1,
					pinned: true,
				});
			}
			// A finger is down: the list stays as it was when it landed
			if (frozenOrder && !board) ordered = followFrozenOrder(ordered, frozenOrder);

			// Did the ORDER change this render, or did the rows merely move?
			// Only the first is a FLIP (see flipRow).
			const key = ordered.map((entry) => entry.candidate.statementId).join('|');
			resorted = orderKey !== '' && key !== orderKey;
			orderKey = key;

			// A student on a phone gets the new ballot: one task line, one status
			// strip. The projector and the teacher's board keep their own frame —
			// they are read from across a room, not tapped.
			const phone = !board && !projector;
			const status = ballotStatus({
				readOnly,
				hasVote: myVoteStatementId !== null,
				saving: voteSaving,
				failed: failedWrite,
			});

			const turnoutText =
				classSize > 0
					? t(phone ? 'voting.turnout_short' : 'voting.turnout', {
							n: String(votedCount),
							total: String(classSize),
						})
					: t('voting.total_votes', { n: String(votedCount) });
			// Participation, not support: while the counts are hidden the meter is
			// grey so it cannot be read as a result. Mint returns with the reveal.
			const turnoutMeter = (): m.Children =>
				classSize > 0
					? m(
							'.voting__turnout-track',
							{ 'aria-hidden': 'true' },
							m('.voting__turnout-fill', {
								class: showResults ? undefined : 'voting__turnout-fill--neutral',
								style: { inlineSize: `${Math.round((votedCount / classSize) * 100)}%` },
							}),
						)
					: null;

			const taskKey = ((): string => {
				if (single) return 'voting.task_motion';
				if (readOnly) return showResults ? 'voting.closed' : 'voting.task_waiting';

				return showResults && myVoteStatementId ? 'voting.task_revealed' : 'voting.task';
			})();

			const taskBlock = (): m.Children => [
				m('h3.voting__task', t(taskKey)),
				// The rules where the finger is: change until it closes, and the
				// tap-again withdraw, said out loud instead of left to be found.
				readOnly ? null : m('p.voting__task-sub', t('voting.task_sub')),
				liveReorder && !single ? m('p.voting__sorted', t('voting.sorted_by_votes')) : null,
			];

			// The ONE live region: the chip. Every state change is a sentence here.
			const statusStrip = (): m.Children =>
				m('.voting__status', [
					m('.voting__status-main', [
						m(
							'span.voting__chip',
							{ class: `voting__chip--${status}`, role: 'status', 'aria-live': 'polite' },
							[
								status === 'voted' || status === 'closed'
									? m('span.voting__chip-mark', { 'aria-hidden': 'true' }, '✓')
									: null,
								t(`voting.status.${status}`),
							],
						),
						status === 'failed'
							? m(
									'button.btn.btn--secondary.btn--sm.voting__retry',
									{ type: 'button', onclick: () => ballot.retry() },
									t('voting.retry'),
								)
							: null,
					]),
					m('.voting__status-turnout', [
						turnoutMeter(),
						m('span.voting__turnout-text', turnoutText),
					]),
				]);

			return frame([
				phone ? null : m('h2.voting__title', t('voting.title')),
				phone
					? taskBlock()
					: m(
							'p.voting__instruction',
							t(
								board
									? 'voting.teacher_hint'
									: readOnly
										? 'voting.closed'
										: single
											? 'voting.single_instruction'
											: 'voting.instruction',
							),
						),
				phone ? statusStrip() : null,

				// A ballot disabled by a vote that never lands looks broken with
				// no explanation — this screen has no HUD, so the stalled-write
				// line has to live here itself.
				readOnly ? null : stalledBanner(),

				// The round runs above the ballot: the desk, the wait, the reveal.
				challengeCards(),

				single
					? [
							m('.card.voting__motion', [m('p.voting__motion-text', candidates[0].statement)]),
							m('.voting__list.voting__list--binary', [
								standingOption(candidates[0].statementId, t('voting.for'), 'for'),
								standingOption(VOTE_AGAINST, t('voting.against'), 'against'),
							]),
						]
					: m(
							'.voting__list',
							{ onpointerdown: phone && liveReorder ? pressFinger : undefined },
							ordered.map(({ candidate, index, pinned }) =>
								option(
									candidate.statementId,
									candidate.statement,
									pinned ? '★' : `${index + 1}`,
									pinned ? 'voting__option--challenger' : undefined,
									pinned ? 'voting__number--challenger' : undefined,
								),
							),
						),

				// The projector and the teacher's board have no strip: how much of
				// the room has spoken sits under the list, as it always did.
				phone
					? null
					: m('.voting__turnout', [turnoutMeter(), m('p.voting__turnout-text', turnoutText)]),
				!showResults ? m('p.voting__hint', t('voting.results_hidden')) : null,

				// The ballot is the page: what the room said earlier is still
				// reachable, but it no longer competes for first position.
				phone
					? m(CarriedContext, { session, beforeIndex: getCurrentPlanIndex(), defaultOpen: false })
					: null,
			]);
		},
	};
}
