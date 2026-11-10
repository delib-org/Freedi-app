import { useMemo } from 'react';
import { useSelector } from 'react-redux';
import { useParams, useSearchParams } from 'react-router';
import { Statement } from '@freedi/shared-types';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { statementOptionsSelector } from '@/redux/statements/statementsSlice';
import { usesPlainListSelector } from '@/redux/answerViews/answerViewsSlice';
import {
	ANSWERS_VIEW_ALL,
	ANSWERS_VIEW_PARAM,
	AnswersViewDecision,
	isRateViewEligible,
	resolveAnswersView,
} from './answersView';

export interface AnswersViewState extends AnswersViewDecision {
	answerCount: number;
}

/** Which view of the Answers tab this reader is on. */
export function useAnswersView(statement: Statement | undefined): AnswersViewState {
	const statementId = statement?.statementId;
	const { sort: paramSort } = useParams<{ sort?: string }>();
	const [searchParams] = useSearchParams();
	const creator = useSelector(creatorSelector);
	const optionsSelect = useMemo(() => statementOptionsSelector(statementId), [statementId]);
	const loadedAnswers = useSelector(optionsSelect).length;
	const plainListSelect = useMemo(() => usesPlainListSelector(statementId), [statementId]);
	const usesPlainList = useSelector(plainListSelect);

	// The stored count can run ahead of what is loaded, and the other way round.
	const answerCount = Math.max(statement?.numberOfOptions ?? 0, loadedAnswers);
	const eligible =
		!!creator?.uid && isRateViewEligible({ statement, answerCount, now: Date.now() });
	const decision = resolveAnswersView({
		eligible,
		usesPlainList,
		paramSort,
		hasManualOrder: (statement?.statementSettings?.manualOptionOrder?.length ?? 0) > 0,
		seeAll: searchParams.get(ANSWERS_VIEW_PARAM) === ANSWERS_VIEW_ALL,
	});

	return { ...decision, answerCount };
}
