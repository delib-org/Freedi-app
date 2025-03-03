import {
	array,
	object,
	string,
	enum_,
	optional,
	null_,
	InferOutput,
} from 'valibot';
import { MassConsensusPageUrls } from '../TypeEnums';

export const MassConsensusPageUrlsSchema = enum_(MassConsensusPageUrls);

export const MassConsensusSchema = object({
	statementId: string(),
	texts: optional(
		object({
			introduction: optional(string()),
			suggestionQuestion: optional(string()),
			similarSuggestions: optional(string()),
			randomSuggestions: optional(string()),
			topSuggestions: optional(string()),
			voting: optional(string()),

		})
	),
	steps: optional(array(MassConsensusPageUrlsSchema)),
	currentStep: optional(MassConsensusPageUrlsSchema),
});

export type MassConsensus = InferOutput<typeof MassConsensusSchema>;

export enum MassConsensusTextTypes {
	introduction = 'introduction',
	suggestionQuestion = 'suggestionQuestion',
	similarSuggestions = 'similarSuggestions',
	randomSuggestions = 'randomSuggestions',
	topSuggestions = 'topSuggestions',
	voting = 'voting',
}

export const GeneratedStatementSchema = object({
	statement: string(),
	statementId: null_(),
});

export type GeneratedStatement = InferOutput<typeof GeneratedStatementSchema>;
