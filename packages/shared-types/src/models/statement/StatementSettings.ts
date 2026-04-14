import {
	object,
	optional,
	array,
	string,
	boolean,
	enum_,
	picklist,
	InferOutput,
	number,
} from 'valibot';
import { DeliberationType } from '../TypeEnums';

/**
 * Join form — admin-defined contact form shown the first time a user joins
 * any option under a question. Submission is stored once per user per
 * owning question, either in Firestore or appended to a Google Sheet.
 */
export const JoinFormFieldTypeSchema = picklist(['text', 'phone', 'email']);
export type JoinFormFieldType = InferOutput<typeof JoinFormFieldTypeSchema>;

export const JoinFormFieldSchema = object({
	id: string(),       // stable slug used as the form key
	label: string(),    // display label (admin-provided, admin handles translation)
	type: JoinFormFieldTypeSchema,
	required: boolean(),
});
export type JoinFormField = InferOutput<typeof JoinFormFieldSchema>;

export const JoinFormDestinationSchema = picklist(['firestore', 'sheets']);
export type JoinFormDestination = InferOutput<typeof JoinFormDestinationSchema>;

export const JoinFormConfigSchema = object({
	enabled: boolean(),
	fields: array(JoinFormFieldSchema),
	destination: JoinFormDestinationSchema,
	sheetUrl: optional(string()),
});
export type JoinFormConfig = InferOutput<typeof JoinFormConfigSchema>;

export enum evaluationType {
	likeDislike = 'like-dislike',
	range = 'range',
	singleLike = 'single-like',
	communityVoice = 'community-voice',
}


export const StatementSettingsSchema = object({
	subScreens: optional(array(string())),
	enableAddEvaluationOption: optional(boolean()),
	enableEvaluation: optional(boolean()), // if false, the user cannot evaluate or vote
	enableAddNewSubQuestionsButton: optional(boolean()),
	defaultLookForSimilarities: optional(boolean()),
	isSubmitMode: optional(boolean()), // should a submit button appear in the bottom. it transfer to a thank you page when clicked. It is just used for the user to feel that he finished evaluating.
	enableAddVotingOption: optional(boolean()),
	/** @deprecated Auto-derived from evaluationType. Do not set directly — use evaluationType instead. */
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
	similarityThreshold: optional(number()), // 0-1, default 0.85 - threshold for finding similar options
	excludedInheritedDemographicIds: optional(array(string())), // IDs of inherited demographic questions to exclude for this statement
	enableChatPanel: optional(boolean()), // if false, the chat side panel is hidden (default: true)
	enableSubQuestionsMap: optional(boolean()), // if false, the sub-questions map side panel is hidden (default: true)
	defaultView: optional(string()), // 'chat' | 'options' | 'questions' - default view for the segmented control
	enableTreeView: optional(boolean()), // if true, show threaded tree discussion instead of flat chat
	enableResearchLogging: optional(boolean()), // if true, research actions are logged for this statement and all sub-statements
	joinForm: optional(JoinFormConfigSchema), // admin-defined join form shown on first join under this question
});


export type StatementSettings = InferOutput<typeof StatementSettingsSchema>;
