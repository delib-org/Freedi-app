import {
	object,
	optional,
	array,
	string,
	boolean,
	enum_,
	InferOutput,
	number,
} from 'valibot';
import { DeliberationType } from '../TypeEnums';

export enum evaluationType {
	likeDislike = 'like-dislike',
	range = 'range',
	singleLike = 'single-like',
}


export const StatementSettingsSchema = object({
	subScreens: optional(array(string())),
	enableAddEvaluationOption: optional(boolean()),
	enableEvaluation: optional(boolean()), // if false, the user cannot evaluate or vote
	enableAddNewSubQuestionsButton: optional(boolean()),
	defaultLookForSimilarities: optional(boolean()),
	isSubmitMode: optional(boolean()), // should a submit button appear in the bottom. it transfer to a thank you page when clicked. It is just used for the user to feel that he finished evaluating.
	enableAddVotingOption: optional(boolean()),
	enhancedEvaluation: optional(boolean()),
	evaluationType: optional(enum_(evaluationType)),
	joiningEnabled: optional(boolean()),
	singleJoinOnly: optional(boolean()), // If true, user can only join ONE option under this parent
	minJoinMembers: optional(number()), // Minimum members per option (for visual indicator)
	maxJoinMembers: optional(number()), // Maximum members per option (for visual indicator + split trigger)
	showEvaluation: optional(boolean()),
	inVotingGetOnlyResults: optional(boolean()),
	enableSimilaritiesSearch: optional(boolean()),
	enableNavigationalElements: optional(boolean()),
	show: optional(boolean()),
	deliberationType: optional(enum_(DeliberationType)),
	hasChat: optional(boolean()),
	hasChildren: optional(boolean()),
	numberOfOptionsPerUser: optional(number()),
	enableAIImprovement: optional(boolean()),
	popperianDiscussionEnabled: optional(boolean()),
	popperianPreCheckEnabled: optional(boolean()),
	enableMultiSuggestionDetection: optional(boolean()),
	enableAutoMerge: optional(boolean()), // if true (default), similar proposals will be automatically merged; if false, users choose
	similarityThreshold: optional(number()), // 0-1, default 0.75 - threshold for finding similar options
	excludedInheritedDemographicIds: optional(array(string())), // IDs of inherited demographic questions to exclude for this statement
});

export type StatementSettings = InferOutput<typeof StatementSettingsSchema>;
