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
	texts: optional(
		object({
			introduction: string(),
			suggestionQuestion: string(),
			similarSuggestions: string(),
			randomSuggestions: string(),
			topSuggestions: string(),
			voting: string(),
		})
	),
	steps: array(MassConsensusPageUrlsSchema),
	currentStep: optional(MassConsensusPageUrlsSchema),
});

export type MassConsensus = InferOutput<typeof MassConsensusSchema>;

export const GeneratedStatementSchema = object({
	statement: string(),
	statementId: null_(),
});

export type GeneratedStatement = InferOutput<typeof GeneratedStatementSchema>;
