import { array, object, string, enum_, optional } from "valibot";
import { MassConsensusPageUrls } from "../enums";

export const MassConsensusPageUrlsSchema = enum_(MassConsensusPageUrls);

export const MassConsensus = object({
	texts: optional(object({
		introduction: string(),
		suggestionQuestion: string(),
		similarSuggestions: string(),
		randomSuggestions: string(),
		topSuggestions: string(),
		voting: string(),
	})),
	steps: array(MassConsensusPageUrlsSchema),
	currentStep: optional(MassConsensusPageUrlsSchema),
});