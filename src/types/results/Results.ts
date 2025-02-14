import { object, optional, number, enum_, InferOutput } from 'valibot';
import { Statement } from '../statement/Statement';

export enum ResultsBy {
	/** all options above a specific consensus level will be approved */
	consensusLevel = 'consensus-level',
	/** X top options will be approved */
	topOptions = 'topOptions',
	/** options that were checked by X percentage of users will be approved */
	checkedBy = 'checkedBy',
	/** options that were checked by a specific user will be approved for user */
	privateCheck = 'privateCheck',
}

export type Results = {
	top: Statement;
	sub: Results[];
};

export const ResultsSettingsSchema = object({
	resultsBy: enum_(ResultsBy),
	cutoffNumber: optional(number()),
	numberOfResults: optional(number()),
	numberOfSelections: optional(number()),
	deep: optional(number()),
	minConsensus: optional(number()),
});

export type ResultsSettings = InferOutput<typeof ResultsSettingsSchema>;
