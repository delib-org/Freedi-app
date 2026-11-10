import { useMemo } from 'react';
import { shallowEqual } from 'react-redux';
import { Statement } from '@freedi/shared-types';
import { useAppSelector } from '@/controllers/hooks/reduxHooks';
import { isAdmin as isAdminRole } from '@/controllers/general/helpers';
import { creatorSelector } from '@/redux/creator/creatorSlice';
import {
	evaluationSelector,
	evaluationsParentSelector,
	userVotesInParentSelector,
} from '@/redux/evaluations/evaluationsSlice';
import {
	statementOptionsSelector,
	statementSelector,
	statementSubscriptionSelector,
} from '@/redux/statements/statementsSlice';
import { parentVoteSelector } from '@/redux/vote/votesSlice';
import { isLiveResultsOn } from '@/helpers/liveResults';
import { getQuestionStage, STAGE_DECIDED } from '@/helpers/questionStage';
import { NO_VOTE } from '../vote/noVote';
import {
	canSeeScore,
	CanSeeScoreInput,
	hasRatedForScore,
	isOwnAnswerOf,
	ScoreViewerFacts,
	shouldHintScoreReveal,
} from './canSeeScore';
import { countRated, rankableAnswers } from './resultsLogic';

export interface AnswerScoreGate {
	canSee: boolean;
	showRevealHint: boolean;
}

export interface QuestionScoreAccess {
	/** May see question-wide results: rankings, leading answers, score sorts. */
	canSee: boolean;
	facts: ScoreViewerFacts;
}

/** An answer exists on any answer surface, which is all the stage rule needs. */
const ANSWER_COUNT_ON_A_CARD = 1;

/** The viewer's standing on one question: redux only, cheap enough to run per card. */
function useScoreViewerFacts(question: Statement | undefined): ScoreViewerFacts {
	const creator = useAppSelector(creatorSelector);
	const questionRole = useAppSelector(statementSubscriptionSelector(question?.statementId))?.role;
	const topRole = useAppSelector(
		statementSubscriptionSelector(question?.topParentId ?? question?.statementId),
	)?.role;
	const now = Date.now();
	const stage = getQuestionStage({ statement: question, answerCount: ANSWER_COUNT_ON_A_CARD, now });
	const deadline = question?.questionSettings?.deadline;
	const isDeadlinePassed = typeof deadline === 'number' && deadline > 0 && deadline <= now;

	return {
		isHost:
			isAdminRole(questionRole) ||
			isAdminRole(topRole) ||
			(!!creator?.uid && question?.creatorId === creator.uid),
		stage,
		showLiveResults: isLiveResultsOn(question),
		isDeadlinePassed,
		ratingClosed:
			question?.statementSettings?.enableEvaluation === false ||
			question?.questionSettings?.isHalted === true ||
			isDeadlinePassed ||
			stage === STAGE_DECIDED,
	};
}

/**
 * The score guard for one answer. An unknown question fails closed, so an
 * answer whose parent has not loaded shows no score until it arrives.
 * `options.hasRated` overrides the rating read from the store, for a card
 * holding a rating the store has not caught up with yet.
 */
export function useAnswerScoreGate(
	answer: Statement | undefined,
	question?: Statement,
	options?: { hasRated?: boolean },
): AnswerScoreGate {
	const parentFromStore = useAppSelector(statementSelector(answer?.parentId));
	const parent = question ?? parentFromStore;
	const creator = useAppSelector(creatorSelector);
	const myEvaluation = useAppSelector(evaluationSelector(answer?.statementId));
	const likesInQuestion = useAppSelector(userVotesInParentSelector(parent?.statementId));
	const voteSelect = useMemo(() => parentVoteSelector(parent?.statementId), [parent?.statementId]);
	const votedOptionId = useAppSelector(voteSelect)?.statementId;
	const facts = useScoreViewerFacts(parent);

	const hasVoted = votedOptionId !== undefined && votedOptionId !== NO_VOTE;
	const hasRatedAnswer =
		options?.hasRated ??
		hasRatedForScore({
			evaluationType: parent?.statementSettings?.evaluationType,
			enhancedEvaluation: parent?.statementSettings?.enhancedEvaluation,
			myEvaluation,
			likesInQuestion,
		});
	const input: CanSeeScoreInput = {
		...facts,
		isOwnAnswer: isOwnAnswerOf(answer, creator?.uid),
		hasRated: hasRatedAnswer || hasVoted,
	};

	return { canSee: canSeeScore(input), showRevealHint: shouldHintScoreReveal(input) };
}

/**
 * The guard for surfaces that reveal the whole question at once. Built on the
 * store alone: `useQuestionScreenData` also subscribes the viewer, and a shared
 * map must not turn an anonymous visitor into a member of the question.
 */
export function useQuestionScoreAccess(question: Statement | undefined): QuestionScoreAccess {
	const statementId = question?.statementId;
	const facts = useScoreViewerFacts(question);
	const creator = useAppSelector(creatorSelector);
	const optionsSelect = useMemo(() => statementOptionsSelector(statementId), [statementId]);
	const options = useAppSelector(optionsSelect);
	const evaluationsSelect = useMemo(() => evaluationsParentSelector(statementId), [statementId]);
	const evaluations = useAppSelector(evaluationsSelect, shallowEqual);
	const voteSelect = useMemo(() => parentVoteSelector(statementId), [statementId]);
	const votedOptionId = useAppSelector(voteSelect)?.statementId;

	const rateableIds = rankableAnswers(options)
		.filter((answer) => !isOwnAnswerOf(answer, creator?.uid))
		.map((answer) => answer.statementId);
	const scopedFacts = { ...facts, ratingClosed: facts.ratingClosed || rateableIds.length === 0 };
	const canSee = canSeeScore({
		...scopedFacts,
		isOwnAnswer: false,
		hasRated:
			countRated(evaluations, rateableIds, creator?.uid) > 0 ||
			(votedOptionId !== undefined && votedOptionId !== NO_VOTE),
	});

	return { canSee, facts: scopedFacts };
}
