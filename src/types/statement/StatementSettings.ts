import {
	object,
	optional,
	array,
	string,
	boolean,
	enum_,
	InferOutput,
} from 'valibot';
import { DeliberationType } from '../TypeEnums';

export const StatementSettingsSchema = object({
	subScreens: optional(array(string())),
	enableAddEvaluationOption: optional(boolean()),
	enableAddVotingOption: optional(boolean()),
	enhancedEvaluation: optional(boolean()),
	showEvaluation: optional(boolean()),
	inVotingGetOnlyResults: optional(boolean()),
	enableSimilaritiesSearch: optional(boolean()),
	enableNavigationalElements: optional(boolean()),
	show: optional(boolean()),
	deliberationType: optional(enum_(DeliberationType)),
	hasChat: optional(boolean()),
	hasChildren: optional(boolean()),
});

export type StatementSettings = InferOutput<typeof StatementSettingsSchema>;
