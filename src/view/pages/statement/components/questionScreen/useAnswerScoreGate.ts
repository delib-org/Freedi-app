import { useContext, useMemo } from 'react';
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
	fullyLoadedScopeSelector,
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
import { AnswerScoreGateContext } from './answerScoreGateContext';

export interface AnswerScoreGate {
	canSee: boolean;
	showRevealHint: boolean;
}

export interface QuestionScoreAccess {
	/** May see question-wide results: rankings, leading answers, score sorts. */
	canSee: boolean;
	facts: ScoreViewerFacts;
}

/** Stands in for the likes scan on questions where likes mean nothing. */
const noLikesScanned = (): number => 0;

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

interface AnswerScoreOptions {
	hasRated?: boolean;
	isHost?: boolean;
}

/**
 * What the score guard needs to know about one answer. An unknown question fails
 * closed, so an answer whose parent has not loaded shows no score until it
 * arrives. `options.hasRated` overrides the rating read from the store, for a
 * card holding a rating the store has not caught up with yet. `options.isHost`
 * adds what the caller knows about the viewer; the results-off rule still applies.
 */
export function useAnswerScoreInput(
	answer: Statement | undefined,
	question?: Statement,
	options?: AnswerScoreOptions,
): CanSeeScoreInput {
	const parentFromStore = useAppSelector(statementSelector(answer?.parentId));
	const parent = question ?? parentFromStore;
	const creator = useAppSelector(creatorSelector);
	const myEvaluation = useAppSelector(evaluationSelector(answer?.statementId));
	const likesInQuestion = useAppSelector(
		parent?.statementSettings?.evaluationType === 'single-like'
			? userVotesInParentSelector(parent.statementId)
			: noLikesScanned,
	);
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

	return {
		...facts,
		isHost: facts.isHost || options?.isHost === true,
		isOwnAnswer: isOwnAnswerOf(answer, creator?.uid),
		hasRated: hasRatedAnswer || hasVoted,
	};
}

function gateOf(input: CanSeeScoreInput): AnswerScoreGate {
	return { canSee: canSeeScore(input), showRevealHint: shouldHintScoreReveal(input) };
}

export function useAnswerScoreGate(
	answer: Statement | undefined,
	question?: Statement,
	options?: AnswerScoreOptions,
): AnswerScoreGate {
	return gateOf(useAnswerScoreInput(answer, question, options));
}

/**
 * The guard for parts of an answer card. Inside a card it uses the card's input
 * and adds only what this part knows (a rating just tapped); elsewhere it works
 * the input out itself. An undefined answer costs only empty lookups.
 */
export function useCardAnswerScoreGate(
	answer: Statement | undefined,
	question?: Statement,
	options?: AnswerScoreOptions,
): AnswerScoreGate {
	const shared = useContext(AnswerScoreGateContext);
	const fromCard = shared !== null && shared.answerId === answer?.statementId ? shared : null;
	const own = useAnswerScoreInput(
		fromCard ? undefined : answer,
		fromCard ? undefined : question,
		fromCard ? undefined : options,
	);
	if (!fromCard) return gateOf(own);

	return gateOf({
		...fromCard.input,
		hasRated: fromCard.input.hasRated || options?.hasRated === true,
	});
}

/**
 * The guard for surfaces that reveal the whole question at once. Built on the
 * store alone: `useQuestionScreenData` also subscribes the viewer, and a shared
 * map must not turn an anonymous visitor into a member of the question.
 */
export function useQuestionScoreAccess(
	question: Statement | undefined,
	viewer?: { isHost?: boolean },
): QuestionScoreAccess {
	const statementId = question?.statementId;
	const storeFacts = useScoreViewerFacts(question);
	const facts = { ...storeFacts, isHost: storeFacts.isHost || viewer?.isHost === true };
	const creator = useAppSelector(creatorSelector);
	const optionsSelect = useMemo(() => statementOptionsSelector(statementId), [statementId]);
	const options = useAppSelector(optionsSelect);
	const fullyLoadedSelect = useMemo(() => fullyLoadedScopeSelector(statementId), [statementId]);
	const isFullyLoaded = useAppSelector(fullyLoadedSelect) !== undefined;
	const evaluationsSelect = useMemo(() => evaluationsParentSelector(statementId), [statementId]);
	const evaluations = useAppSelector(evaluationsSelect, shallowEqual);
	const voteSelect = useMemo(() => parentVoteSelector(statementId), [statementId]);
	const votedOptionId = useAppSelector(voteSelect)?.statementId;

	const rateableIds = rankableAnswers(options)
		.filter((answer) => !isOwnAnswerOf(answer, creator?.uid))
		.map((answer) => answer.statementId);
	// "Nothing to rate" must be known, not merely not loaded yet: an empty store
	// while the listener starts would otherwise open every score to everyone.
	const answersKnown = isFullyLoaded || options.length === question?.numberOfOptions;
	const nothingToRate = answersKnown && rateableIds.length === 0;
	const scopedFacts = { ...facts, ratingClosed: facts.ratingClosed || nothingToRate };
	const canSee = canSeeScore({
		...scopedFacts,
		isOwnAnswer: false,
		hasRated:
			countRated(evaluations, rateableIds, creator?.uid) > 0 ||
			(votedOptionId !== undefined && votedOptionId !== NO_VOTE),
	});

	return { canSee, facts: scopedFacts };
}
