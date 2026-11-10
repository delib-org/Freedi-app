import { createContext, useMemo } from 'react';
import { shallowEqual, useSelector } from 'react-redux';
import { EvaluationUI, Statement } from '@freedi/shared-types';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import { statementOptionsSelector } from '@/redux/statements/statementsSlice';
import { evaluationsParentSelector } from '@/redux/evaluations/evaluationsSlice';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import { parentVoteSelector } from '@/redux/vote/votesSlice';
import { NO_VOTE } from '../vote/useOptimisticVotes';
import {
	canParticipantsAddAnswers,
	getAddAnswerState,
	isAddAnswerEnabled,
	isHostRole,
} from './questionScreenLogic';
import { getQuestionStage, QuestionStageIndex, STAGE_DECIDED } from '@/helpers/questionStage';
import { countRated, rankableAnswers } from './resultsLogic';
import { isLiveResultsOn } from '@/helpers/liveResults';

/**
 * True while the question screen's Answers tab is on screen. The screen then
 * owns both bottom actions there — adding (the "+ Add an answer" button, or the
 * shell nav's "+" on phones) and sorting (the chip in the list header) — so the
 * legacy StatementBottomNav bar steps aside instead of stacking a second
 * floating layer over the cards.
 */
export const QuestionAnswersTabContext = createContext(false);

export interface QuestionScreenData {
	isHost: boolean;
	isAuthorized: boolean;
	userId: string | undefined;
	stage: QuestionStageIndex;
	answers: Statement[];
	/** Answers the viewer can rate (not their own). */
	rateableCount: number;
	ratedCount: number;
	isDeadlinePassed: boolean;
	isHalted: boolean;
	canRate: boolean;
	showLiveResults: boolean;
	canAddAnswer: boolean;
	usesVotingUI: boolean;
	hasVoted: boolean;
}

function isOwn(answer: Statement, userId: string | undefined): boolean {
	return !!userId && (answer.creatorId === userId || answer.creator?.uid === userId);
}

/** Everything the question tabs read about the viewer and the process, in one place. */
export function useQuestionScreenData(statement: Statement | undefined): QuestionScreenData {
	const statementId = statement?.statementId;
	const authorization = useAuthorization(statementId);
	const isHost = isHostRole(authorization.role);
	const creator = useSelector(creatorSelector);
	const userId = creator?.uid;

	const optionsSelect = useMemo(() => statementOptionsSelector(statementId), [statementId]);
	const options = useSelector(optionsSelect);
	const evaluationsSelect = useMemo(() => evaluationsParentSelector(statementId), [statementId]);
	const evaluations = useSelector(evaluationsSelect, shallowEqual);
	const voteSelect = useMemo(() => parentVoteSelector(statementId), [statementId]);
	const votedOptionId = useSelector(voteSelect)?.statementId;

	return useMemo(() => {
		const answers = rankableAnswers(options);
		const rateable = answers.filter((a) => !isOwn(a, userId));
		const ratedCount = countRated(
			evaluations,
			rateable.map((a) => a.statementId),
			userId,
		);
		const now = Date.now();
		const deadline = statement?.questionSettings?.deadline;
		const isDeadlinePassed = typeof deadline === 'number' && deadline > 0 && deadline <= now;
		const isHalted = statement?.questionSettings?.isHalted === true || isDeadlinePassed;
		const stage = getQuestionStage({ statement, answerCount: answers.length, now });
		const addState = getAddAnswerState({
			isHost,
			canParticipantsAdd: canParticipantsAddAnswers(statement),
			isHalted,
		});

		return {
			isHost,
			isAuthorized: authorization.isAuthorized,
			userId,
			stage,
			answers,
			rateableCount: rateable.length,
			ratedCount,
			isDeadlinePassed,
			isHalted,
			canRate:
				statement?.statementSettings?.enableEvaluation !== false &&
				!isHalted &&
				stage !== STAGE_DECIDED,
			showLiveResults: isLiveResultsOn(statement),
			canAddAnswer:
				isAddAnswerEnabled(addState) &&
				stage !== STAGE_DECIDED &&
				(isHost || authorization.isAuthorized),
			usesVotingUI: statement?.evaluationSettings?.evaluationUI === EvaluationUI.voting,
			hasVoted: votedOptionId !== undefined && votedOptionId !== NO_VOTE,
		};
	}, [options, evaluations, votedOptionId, userId, statement, isHost, authorization.isAuthorized]);
}
