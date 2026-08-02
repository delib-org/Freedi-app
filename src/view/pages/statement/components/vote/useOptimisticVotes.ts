import { useCallback, useEffect, useMemo, useState } from 'react';
import { Statement } from '@freedi/shared-types';
import { setVoteToDB } from '@/controllers/db/vote/setVote';
import { useAppDispatch, useAppSelector } from '@/controllers/hooks/reduxHooks';
import { useAuthentication } from '@/controllers/hooks/useAuthentication';
import { parentVoteSelector, setVoteToStore } from '@/redux/vote/votesSlice';
import { TIME } from '@/constants/common';

/** Value stored in `statement.selections` / `vote.statementId` when nobody is chosen. */
export const NO_VOTE = 'none';

/**
 * How long an unconfirmed vote keeps its optimistic tally before the UI falls
 * back to the server numbers. Guards against a lost write leaving a phantom
 * vote on screen forever.
 */
const OPTIMISTIC_VOTE_TIMEOUT_MS = TIME.SECOND * 8;

interface PendingVote {
	/** Option the vote moved away from, or NO_VOTE. */
	fromId: string;
	/** Option the vote moved to, or NO_VOTE when withdrawn. */
	toId: string;
	/** `statement.selections` as the server reported it when the run started. */
	baseline: Record<string, number>;
}

export interface OptimisticVotes {
	/** Per-option tallies, already adjusted for an unconfirmed vote. */
	selectionsById: Record<string, number>;
	/** Sum of all tallies, adjusted the same way. */
	totalVotes: number;
	/** Option the user is currently on, or NO_VOTE. */
	votedOptionId: string;
	/** Toggles the vote for an option and writes it to the DB. */
	castVote: (option: Statement) => Promise<void>;
}

const sumSelections = (selections: Record<string, number>): number =>
	Object.values(selections).reduce((total, count) => total + (count || 0), 0);

/**
 * Vote tallies for a voting question that react to the user's click straight
 * away, then hand back to the server numbers as soon as they catch up.
 *
 * The tallies live on the parent statement (`statement.selections`) and are
 * aggregated server-side, so without this the bars only move after a full
 * round-trip. Holding the optimistic state here - rather than inside each bar -
 * is what lets the option being left shrink at the same moment the option being
 * chosen grows, and keeps the total in step with both.
 */
export function useOptimisticVotes(statement: Statement | undefined): OptimisticVotes {
	const dispatch = useAppDispatch();
	const { creator } = useAuthentication();
	const vote = useAppSelector(parentVoteSelector(statement?.statementId));
	const [pending, setPending] = useState<PendingVote | null>(null);

	const serverSelections = statement?.selections;

	// Server tallies, minus the 'none' bucket which is not a real option.
	const confirmedSelections = useMemo(() => {
		const selections: Record<string, number> = { ...(serverSelections ?? {}) };
		delete selections[NO_VOTE];

		return selections;
	}, [serverSelections]);

	// The write has landed once any option we touched moved off its baseline.
	const isAwaitingServer = useMemo(() => {
		if (!pending) return false;

		return [pending.fromId, pending.toId].every(
			(optionId) =>
				optionId === NO_VOTE ||
				(confirmedSelections[optionId] ?? 0) === (pending.baseline[optionId] ?? 0),
		);
	}, [pending, confirmedSelections]);

	useEffect(() => {
		if (pending && !isAwaitingServer) setPending(null);
	}, [pending, isAwaitingServer]);

	useEffect(() => {
		if (!pending) return;
		const timer = setTimeout(() => setPending(null), OPTIMISTIC_VOTE_TIMEOUT_MS);

		return () => clearTimeout(timer);
	}, [pending]);

	const selectionsById = useMemo(() => {
		if (!pending || !isAwaitingServer) return confirmedSelections;

		const optimistic = { ...confirmedSelections };
		if (pending.toId !== NO_VOTE) {
			optimistic[pending.toId] = (optimistic[pending.toId] ?? 0) + 1;
		}
		if (pending.fromId !== NO_VOTE) {
			optimistic[pending.fromId] = Math.max(0, (optimistic[pending.fromId] ?? 0) - 1);
		}

		return optimistic;
	}, [confirmedSelections, pending, isAwaitingServer]);

	const votedOptionId = vote?.statementId ?? NO_VOTE;

	const castVote = useCallback(
		async (option: Statement) => {
			if (!creator || !statement) return;

			const currentId = vote?.statementId ?? NO_VOTE;
			const nextId = currentId === option.statementId ? NO_VOTE : option.statementId;

			// Keep the original baseline across rapid clicks so the deltas stay
			// measured against what the server last told us.
			setPending((previous) => ({
				fromId: previous?.fromId ?? currentId,
				toId: nextId,
				baseline: previous?.baseline ?? { ...(statement.selections ?? {}) },
			}));

			dispatch(
				setVoteToStore({
					parentId: statement.statementId,
					optionId: nextId,
					userId: creator.uid,
				}),
			);

			await setVoteToDB(option, creator);
		},
		[creator, statement, vote?.statementId, dispatch],
	);

	return {
		selectionsById,
		totalVotes: sumSelections(selectionsById),
		votedOptionId,
		castVote,
	};
}
