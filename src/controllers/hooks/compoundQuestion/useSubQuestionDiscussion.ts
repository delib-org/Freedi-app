import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import { Statement, SimpleStatement } from '@freedi/shared-types';
import { statementSelector } from '@/redux/statements/statementsSlice';
import { promoteOptionToSubQuestion } from '@/controllers/db/compoundQuestion/promoteOptionToSubQuestion';

/**
 * Module-level set: performance optimization to avoid redundant Firestore writes
 * within a single browser session. This is NOT the correctness guard -- idempotency
 * is guaranteed by deterministic sub-question IDs in promoteOptionToSubQuestion().
 *
 * Keys are `${optionId}__${parentId}` to scope correctly when the same option
 * could theoretically appear in multiple compound questions.
 */
const promotedInSession = new Set<string>();

interface UseSubQuestionDiscussionReturn {
	discussionId: string | undefined;
	hasDiscussion: boolean;
	results: SimpleStatement[];
	promotedCount: number;
}

export function useSubQuestionDiscussion(
	parentStatement: Statement | undefined,
): UseSubQuestionDiscussionReturn {
	const compoundSettings = parentStatement?.questionSettings?.compoundSettings;
	const discussionId = compoundSettings?.subQuestionDiscussionId;
	const promotedOptionIds = compoundSettings?.promotedOptionIds ?? [];

	const discussion = useSelector(statementSelector(discussionId));
	const results: SimpleStatement[] = useMemo(
		() => discussion?.results ?? [],
		[discussion?.results],
	);

	// Track in-flight promotions to avoid firing the same request twice
	// within a single render cycle (covers rapid effect re-triggers).
	const inFlightRef = useRef(new Set<string>());

	useEffect(() => {
		if (!parentStatement || !discussion || results.length === 0) return;

		const parentId = parentStatement.statementId;
		const alreadyPromoted = new Set(promotedOptionIds);

		for (const result of results) {
			const optionId = result.statementId;
			const dedupKey = `${optionId}__${parentId}`;

			// Guard 1: Already recorded in Firestore (authoritative)
			if (alreadyPromoted.has(optionId)) continue;

			// Guard 2: Already attempted in this session (performance optimization)
			if (promotedInSession.has(dedupKey)) continue;

			// Guard 3: Currently in-flight from this component instance
			if (inFlightRef.current.has(dedupKey)) continue;

			// Mark in both guards before the async call
			promotedInSession.add(dedupKey);
			inFlightRef.current.add(dedupKey);

			const resultAsStatement = {
				...result,
				topParentId: discussion.topParentId || discussion.parentId,
				parentId: discussion.statementId,
			} as Statement;

			promoteOptionToSubQuestion(resultAsStatement, parentStatement)
				.catch(() => {
					// Allow retry on failure
					promotedInSession.delete(dedupKey);
				})
				.finally(() => {
					inFlightRef.current.delete(dedupKey);
				});
		}
	}, [results, promotedOptionIds, parentStatement, discussion]);

	return {
		discussionId,
		hasDiscussion: !!discussionId,
		results,
		promotedCount: promotedOptionIds.length,
	};
}
