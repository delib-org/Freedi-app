import { useEffect } from 'react';
import { useSelector } from 'react-redux';
import { EvaluationUI, QuestionStep, Statement, StatementType } from '@freedi/shared-types';
import { getOwnVote } from '@/controllers/db/vote/getVotes';
import { useAppDispatch } from '@/controllers/hooks/reduxHooks';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { setVoteToStore } from '@/redux/vote/votesSlice';

/** A person's vote matters only on a question that runs, or is at, the voting stage. */
export function questionUsesVotes(statement: Statement | undefined): boolean {
	if (statement?.statementType !== StatementType.question) return false;

	return (
		statement.evaluationSettings?.evaluationUI === EvaluationUI.voting ||
		statement.questionSettings?.currentStep === QuestionStep.voting
	);
}

/**
 * Puts the person's vote on this question into the store, once per question
 * they open, whichever tab they are on. A single document read, never a
 * listener: `castVote` keeps the store current after that.
 */
export function useLoadOwnVote(statement: Statement | undefined): void {
	const dispatch = useAppDispatch();
	const userId = useSelector(creatorSelector)?.uid;
	const parentId = statement?.statementId;
	const usesVotes = questionUsesVotes(statement);

	useEffect(() => {
		if (!parentId || !userId || !usesVotes) return;

		let isCurrent = true;
		getOwnVote(parentId, userId).then((vote) => {
			if (!isCurrent || !vote) return;
			dispatch(setVoteToStore({ parentId, optionId: vote.statementId, userId }));
		});

		return () => {
			isCurrent = false;
		};
	}, [parentId, userId, usesVotes, dispatch]);
}
