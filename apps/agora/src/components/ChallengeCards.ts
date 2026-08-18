import m from 'mithril';
import { t } from '../lib/i18n';
import {
	AGORA_LIMITS,
	ChallengePhase,
	ChallengeResolvedBy,
	VotingGameState,
} from '@freedi/shared-types';

/**
 * The cards that sit above the ballot while the challenge round runs.
 *
 * Everything here is props in, vnodes out — the writes belong to the view, and
 * the rules to the server. The one piece of state it keeps is the draft in the
 * desk, which is the student's own typing and belongs to nobody else.
 */

export interface ChallengeCardsAttrs {
	game: VotingGameState;
	userId: string;
	saving: boolean;
	onPitch(text: string): void;
	onPass(): void;
}

/** Who is up, who has been, and who passed — the round made legible. */
function roster(game: VotingGameState): m.Children {
	const shown = Math.min(game.order.length, game.maxTurns);
	const passed = new Set(game.passedUserIds);
	const skipped = new Set(game.skippedUserIds);

	return m(
		'.challenge__roster',
		{ 'aria-label': t('challenge.roster_label') },
		game.order.slice(0, shown).map((userId, index) => {
			const done = index < game.turnIndex;
			const now = index === game.turnIndex && game.phase !== ChallengePhase.ended;
			const modifier = now
				? 'challenge__seat--now'
				: passed.has(userId)
					? 'challenge__seat--passed'
					: skipped.has(userId)
						? 'challenge__seat--skipped'
						: done
							? 'challenge__seat--done'
							: '';

			return m(
				'span.challenge__seat',
				{ key: userId, class: modifier || undefined },
				game.orderNames[index] ?? '',
			);
		}),
	);
}

export function ChallengeCards(): m.Component<ChallengeCardsAttrs> {
	let draft = '';

	return {
		view(vnode) {
			const { game, userId, saving, onPitch, onPass } = vnode.attrs;
			const speaker = game.speakerAnonName ?? '';
			const mine = game.speakerUserId === userId;

			if (game.phase === ChallengePhase.ended) return null;

			if (game.phase === ChallengePhase.resolved) {
				const outcome = game.lastOutcome;
				if (!outcome) return null;

				// A pass and a skip are not defeats. They get one quiet line, and
				// none of the language of losing.
				if (outcome.by !== ChallengeResolvedBy.vote) {
					return m('.challenge.challenge__outcome.challenge__outcome--quiet', [
						m(
							'p.challenge__line',
							t(
								outcome.by === ChallengeResolvedBy.pass
									? 'challenge.outcome_passed'
									: 'challenge.outcome_skipped',
								{ name: outcome.speakerAnonName },
							),
						),
					]);
				}

				return m(
					'.challenge.challenge__outcome',
					{
						class: outcome.survived ? 'challenge__outcome--survived' : 'challenge__outcome--failed',
						role: 'status',
					},
					[
						m(
							'h3.challenge__outcome-title',
							t(outcome.survived ? 'challenge.outcome_survived' : 'challenge.outcome_failed', {
								name: outcome.speakerAnonName,
							}),
						),
						m('p.challenge__quote', outcome.challengerStatement ?? ''),
						m(
							'p.challenge__line',
							t('challenge.outcome_votes', { n: String(outcome.challengerVotes) }),
						),
						outcome.survived && outcome.evictedStatement
							? m(
									'p.challenge__evicted',
									t('challenge.evicted', { statement: outcome.evictedStatement }),
								)
							: null,
						!outcome.survived ? m('p.challenge__line', t('challenge.board_stands')) : null,
						mine && outcome.pointsAwarded > 0
							? m(
									'p.challenge__points',
									t('challenge.points', { n: String(outcome.pointsAwarded) }),
								)
							: null,
					],
				);
			}

			if (game.phase === ChallengePhase.vote || game.phase === ChallengePhase.resolving) {
				return m('.challenge.challenge__curtain', [
					m('h3.challenge__title', t('challenge.on_the_board', { name: speaker })),
					m('p.challenge__line', t('challenge.move_your_vote')),
					// The counts are hidden, and saying so is the point: silence
					// about a number reads as a broken screen, a sentence about it
					// reads as a rule.
					m('p.challenge__blind', t('challenge.blind')),
				]);
			}

			// idle | floor
			if (mine && game.phase === ChallengePhase.floor) {
				const length = draft.trim().length;
				const tooShort = length < AGORA_LIMITS.MIN_PROPOSAL_LENGTH;

				return m('.challenge.challenge__desk', [
					m('h3.challenge__title', t('challenge.desk_title')),
					m('p.challenge__rule', t('challenge.rule')),
					m('textarea.challenge__input', {
						value: draft,
						// Readonly, never disabled: a disabled textarea drops focus
						// and the caret, and a student mid-sentence loses their place.
						readonly: saving,
						maxlength: AGORA_LIMITS.MAX_PROPOSAL_LENGTH,
						placeholder: t('challenge.desk_placeholder'),
						'aria-label': t('challenge.desk_title'),
						oninput: (event: Event) => {
							draft = (event.target as HTMLTextAreaElement).value;
						},
					}),
					m('p.challenge__count', `${length} / ${AGORA_LIMITS.MAX_PROPOSAL_LENGTH}`),
					m('.challenge__actions', [
						m(
							'button.challenge__send',
							{
								disabled: saving || tooShort,
								onclick: () => {
									onPitch(draft.trim());
									draft = '';
								},
							},
							t('challenge.send'),
						),
						m(
							'button.challenge__pass',
							{ disabled: saving, onclick: () => onPass() },
							t('challenge.pass'),
						),
					]),
					tooShort && length > 0 ? m('p.challenge__hint', t('challenge.too_short')) : null,
					roster(game),
				]);
			}

			if (mine && game.phase === ChallengePhase.idle) {
				return m('.challenge.challenge__next', [
					m('h3.challenge__title', t('challenge.your_turn')),
					m('p.challenge__line', t('challenge.your_turn_hint')),
					roster(game),
				]);
			}

			// Somebody else's turn. Name them: a room that knows who is thinking
			// waits differently from a room watching a spinner.
			return m('.challenge.challenge__waiting', [
				m(
					'p.challenge__line',
					t(
						game.phase === ChallengePhase.floor
							? 'challenge.waiting_writer'
							: 'challenge.waiting_next',
						{ name: speaker },
					),
				),
				game.challengerStatementId && game.phase === ChallengePhase.floor
					? m('p.challenge__hint', t('challenge.ready_to_vote'))
					: null,
				roster(game),
			]);
		},
	};
}
