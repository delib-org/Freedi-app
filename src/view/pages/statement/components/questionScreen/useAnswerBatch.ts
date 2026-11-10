import { useEffect, useMemo, useRef, useState } from 'react';
import { shallowEqual, useDispatch, useSelector } from 'react-redux';
import { Statement, isAnswerBatchQuestion } from '@freedi/shared-types';
import { fetchAnswerBatch, listenToBatchAnswers } from '@/controllers/db/statements/answerBatch';
import { RATE_VIEW } from '@/constants/common';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { evaluationsParentSelector } from '@/redux/evaluations/evaluationsSlice';
import { statementOptionsSelector } from '@/redux/statements/statementsSlice';
import {
	clearRateBatchFailure,
	dropRatedFromBatch,
	fallBackToPlainList,
	rateBatchFailureSelector,
	rateBatchSelector,
	recordRateBatchFailure,
	setRateBatch,
} from '@/redux/answerViews/answerViewsSlice';
import { logError } from '@/utils/errorHandling';
import { decideBatchRequest, failureBackoffMs, LastAsk } from './answerBatchRequests';

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
 *
 * `active` includes a view waiting to retry after a failure: it shows the list
 * meanwhile, and comes back here when a retry succeeds.
 */
export function useAnswerBatch(
	questionId: string | undefined,
	active: boolean,
	answerCount: number,
): AnswerBatchState {
	const dispatch = useDispatch();
	const creator = useSelector(creatorSelector);
	const uid = creator?.uid;
	const entrySelect = useMemo(() => rateBatchSelector(questionId), [questionId]);
	const entry = useSelector(entrySelect);
	const failureSelect = useMemo(() => rateBatchFailureSelector(questionId), [questionId]);
	const failure = useSelector(failureSelect);
	const optionsSelect = useMemo(() => statementOptionsSelector(questionId), [questionId]);
	const options = useSelector(optionsSelect);
	const evaluationsSelect = useMemo(() => evaluationsParentSelector(questionId), [questionId]);
	const evaluations = useSelector(evaluationsSelect, shallowEqual);
	const [isLoading, setIsLoading] = useState(false);
	const [wakeCount, setWakeCount] = useState(0);
	const inFlightRef = useRef(false);
	const lastAskRef = useRef<LastAsk | null>(null);
	const emptyAnswersRef = useRef(0);
	const finishedSpreadRef = useRef(Math.random() * RATE_VIEW.FINISHED_REFRESH_SPREAD_MS);
	const answerCountRef = useRef(answerCount);
	answerCountRef.current = answerCount;

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

	const answers = useMemo(() => {
		if (!entry) return [];
		const byId = new Map(options.map((option) => [option.statementId, option]));

		return entry.ids.flatMap((id) => {
			const answer = byId.get(id);

			return answer && !answer.hide ? [answer] : [];
		});
	}, [entry, options]);
	// A removed or hidden answer is no longer in `answers`, so it cannot hold the batch open.
	const unratedShown = answers.filter((answer) => !ratedIds.has(answer.statementId)).length;

	useEffect(() => {
		lastAskRef.current = null;
		emptyAnswersRef.current = 0;
		if (active && questionId) {
			dispatch(dropRatedFromBatch({ questionId, ratedIds: [...ratedRef.current] }));
		}
	}, [active, questionId, dispatch]);

	// Coming back to the tab counts as reopening the view.
	useEffect(() => {
		if (!active) return;
		const onVisibility = (): void => {
			if (document.visibilityState !== 'visible') return;
			lastAskRef.current = null;
			setWakeCount((count) => count + 1);
		};
		document.addEventListener('visibilitychange', onVisibility);

		return () => document.removeEventListener('visibilitychange', onVisibility);
	}, [active]);

	const onScreenKey = active && !failure ? (entry?.ids.join(',') ?? '') : '';
	useEffect(() => {
		if (!questionId || !onScreenKey) return;

		return listenToBatchAnswers(questionId, onScreenKey.split(','));
	}, [questionId, onScreenKey]);

	useEffect(() => {
		if (!active || !questionId || !uid || inFlightRef.current) return;
		const decision = decideBatchRequest({
			entry,
			unratedShown,
			ratings: ratedIds.size,
			answerCount,
			lastAsk: lastAskRef.current,
			failure,
			now: Date.now(),
			finishedSpreadMs: finishedSpreadRef.current,
		});
		if (decision.kind === 'wait') return;
		if (decision.kind === 'ask-later') {
			const timer = window.setTimeout(() => setWakeCount((count) => count + 1), decision.delayMs);

			return () => window.clearTimeout(timer);
		}

		inFlightRef.current = true;
		lastAskRef.current = { ratings: ratedIds.size, answers: answerCount, at: Date.now() };
		setIsLoading(true);
		fetchAnswerBatch(questionId)
			.then(({ ids, hasMore, remaining, totalAnswers }) => {
				dispatch(clearRateBatchFailure(questionId));
				if (!isAnswerBatchQuestion(totalAnswers)) {
					dispatch(fallBackToPlainList(questionId));

					return;
				}
				const fresh = ids.filter((id) => !ratedRef.current.has(id));
				if (fresh.length > 0 || !hasMore) emptyAnswersRef.current = 0;
				else emptyAnswersRef.current += 1;
				const tries = emptyAnswersRef.current;
				const giveUp = tries > RATE_VIEW.EMPTY_BATCH_RETRIES;
				dispatch(
					setRateBatch({
						questionId,
						entry: { ids: fresh, hasMore: hasMore && !giveUp, remaining: giveUp ? 0 : remaining },
					}),
				);
				if (tries > 0 && !giveUp) {
					window.setTimeout(() => {
						if (lastAskRef.current) lastAskRef.current.ratings = -1;
						setWakeCount((count) => count + 1);
					}, RATE_VIEW.EMPTY_BATCH_RETRY_MS);
				}
			})
			.catch((error) => {
				logError(error, {
					operation: 'useAnswerBatch.fetchAnswerBatch',
					userId: uid,
					statementId: questionId,
				});
				const failures = (failure?.failures ?? 0) + 1;
				dispatch(
					recordRateBatchFailure({
						questionId,
						failures,
						retryAt: Date.now() + failureBackoffMs(failures),
					}),
				);
			})
			.finally(() => {
				inFlightRef.current = false;
				setIsLoading(false);
				// The reader may have moved to another question during this call.
				setWakeCount((count) => count + 1);
			});
	}, [
		active,
		questionId,
		uid,
		entry,
		unratedShown,
		ratedIds,
		answerCount,
		failure,
		wakeCount,
		dispatch,
	]);

	return {
		answers,
		isLoading,
		isFinished: !!entry && !isLoading && !entry.hasMore && unratedShown === 0,
	};
}
