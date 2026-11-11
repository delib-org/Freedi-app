import { createContext, useMemo } from 'react';
import { shallowEqual, useSelector } from 'react-redux';
import { EvaluationUI, Statement } from '@freedi/shared-types';
import { useAuthorization } from '@/controllers/hooks/useAuthorization';
import {
	fullyLoadedScopeSelector,
	statementOptionsSelector,
	statementSubsSelector,
} from '@/redux/statements/statementsSlice';
import { CHAT } from '@/constants/common';
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
import {
	canRateQuestion,
	getQuestionStage,
	QuestionStageIndex,
	STAGE_DECIDED,
} from '@/helpers/questionStage';
import { areAnswersComplete, countRated, latestRatingAt, rankableAnswers } from './resultsLogic';
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
	/** When the viewer last rated one of those answers, or 0. */
	lastRatedAt: number;
	/** False while the store may hold only part of the answers: the two counts are then partial. */
	answersComplete: boolean;
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
	const subsSelect = useMemo(() => statementSubsSelector(statementId), [statementId]);
	const loadedChildren = useSelector(subsSelect).length;
	const fullyLoadedSelect = useMemo(() => fullyLoadedScopeSelector(statementId), [statementId]);
	const isFullyLoaded = useSelector(fullyLoadedSelect) !== undefined;
	const evaluationsSelect = useMemo(() => evaluationsParentSelector(statementId), [statementId]);
	const evaluations = useSelector(evaluationsSelect, shallowEqual);
	const voteSelect = useMemo(() => parentVoteSelector(statementId), [statementId]);
	const votedOptionId = useSelector(voteSelect)?.statementId;

	return useMemo(() => {
		const answers = rankableAnswers(options);
		const rateable = answers.filter((a) => !isOwn(a, userId));
		const rateableIds = rateable.map((a) => a.statementId);
		const ratedCount = countRated(evaluations, rateableIds, userId);
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
			lastRatedAt: latestRatingAt(evaluations, rateableIds, userId),
			answersComplete: areAnswersComplete({
				loadedAnswers: options.length,
				loadedChildren,
				numberOfOptions: statement?.numberOfOptions,
				isFullyLoaded,
				childrenWindow: CHAT.INITIAL_MESSAGES_LIMIT,
			}),
			isDeadlinePassed,
			isHalted,
			canRate: canRateQuestion(statement, stage, isHalted),
			showLiveResults: isLiveResultsOn(statement),
			canAddAnswer:
				isAddAnswerEnabled(addState) &&
				stage !== STAGE_DECIDED &&
				(isHost || authorization.isAuthorized),
			usesVotingUI: statement?.evaluationSettings?.evaluationUI === EvaluationUI.voting,
			hasVoted: votedOptionId !== undefined && votedOptionId !== NO_VOTE,
		};
	}, [
		options,
		loadedChildren,
		isFullyLoaded,
		evaluations,
		votedOptionId,
		userId,
		statement,
		isHost,
		authorization.isAuthorized,
	]);
}
