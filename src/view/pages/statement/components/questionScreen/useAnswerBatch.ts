import { useEffect, useMemo, useRef, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { Statement, isAnswerBatchQuestion } from '@freedi/shared-types';
import { fetchAnswerBatch } from '@/controllers/db/statements/answerBatch';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { evaluationsParentSelector } from '@/redux/evaluations/evaluationsSlice';
import { statementOptionsSelector } from '@/redux/statements/statementsSlice';
import {
	dropRatedFromBatch,
	rateBatchSelector,
	setRateBatch,
	fallBackToPlainList,
} from '@/redux/answerViews/answerViewsSlice';
import { logError } from '@/utils/errorHandling';

export interface AnswerBatchState {
	answers: Statement[];
	isLoading: boolean;
	/** Nothing is left to rate for now. */
	isFinished: boolean;
}

/**
 * The answers on the Rate view. A rated card stays until the whole batch is
 * rated, so the person sees it land; then the next batch is asked for. Answers
 * rated somewhere else (the full list) are dropped when the view opens.
 */
export function useAnswerBatch(questionId: string | undefined, active: boolean): AnswerBatchState {
	const dispatch = useDispatch();
	const creator = useSelector(creatorSelector);
	const uid = creator?.uid;
	const entrySelect = useMemo(() => rateBatchSelector(questionId), [questionId]);
	const entry = useSelector(entrySelect);
	const optionsSelect = useMemo(() => statementOptionsSelector(questionId), [questionId]);
	const options = useSelector(optionsSelect);
	const evaluationsSelect = useMemo(() => evaluationsParentSelector(questionId), [questionId]);
	const evaluations = useSelector(evaluationsSelect, shallowEqual);
	const [isLoading, setIsLoading] = useState(false);
	const inFlightRef = useRef(false);
	/** How many ratings the last request knew of; null until this view has asked once. */
	const askedAtRatingsRef = useRef<number | null>(null);

	const ratedIds = useMemo(
		() =>
			new Set<string>(
				evaluations
					.filter((evaluation) => evaluation.evaluatorId === uid)
					.map((evaluation) => evaluation.statementId),
			),
		[evaluations, uid],
	);
	const ratedRef = useRef(ratedIds);
	ratedRef.current = ratedIds;

	useEffect(() => {
		askedAtRatingsRef.current = null;
		if (active && questionId) {
			dispatch(dropRatedFromBatch({ questionId, ratedIds: [...ratedRef.current] }));
		}
	}, [active, questionId, dispatch]);

	useEffect(() => {
		if (!active || !questionId || !uid || inFlightRef.current) return;
		if (entry && !entry.ids.every((id) => ratedIds.has(id))) return;
		const asked = askedAtRatingsRef.current;
		if (asked !== null && (!entry?.hasMore || asked === ratedIds.size)) return;

		inFlightRef.current = true;
		askedAtRatingsRef.current = ratedIds.size;
		setIsLoading(true);
		fetchAnswerBatch(questionId)
			.then(({ ids, hasMore, remaining, totalAnswers }) => {
				if (!isAnswerBatchQuestion(totalAnswers)) {
					dispatch(fallBackToPlainList(questionId));

					return;
				}
				dispatch(
					setRateBatch({
						questionId,
						entry: { ids: ids.filter((id) => !ratedRef.current.has(id)), hasMore, remaining },
					}),
				);
			})
			.catch((error) => {
				logError(error, {
					operation: 'useAnswerBatch.fetchAnswerBatch',
					userId: uid,
					statementId: questionId,
				});
				dispatch(fallBackToPlainList(questionId));
			})
			.finally(() => {
				inFlightRef.current = false;
				setIsLoading(false);
			});
	}, [active, questionId, uid, entry, ratedIds, dispatch]);

	const answers = useMemo(() => {
		if (!entry) return [];
		const byId = new Map(options.map((option) => [option.statementId, option]));

		return entry.ids.flatMap((id) => {
			const answer = byId.get(id);

			return answer ? [answer] : [];
		});
	}, [entry, options]);

	return {
		answers,
		isLoading,
		isFinished:
			!!entry && !isLoading && !entry.hasMore && entry.ids.every((id) => ratedIds.has(id)),
	};
}
