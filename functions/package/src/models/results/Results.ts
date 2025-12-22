import { object, optional, number, enum_, InferOutput } from 'valibot';
import { Statement } from '../statement/StatementTypes';

export enum ResultsBy {
	consensus = 'consensus',
	mostLiked = 'mostLiked',
	averageLikesDislikes = 'averageLikesDislikes',
	topOptions = 'topOptions',
}

export enum CutoffBy {
	topOptions = 'topOptions',
	aboveThreshold = 'aboveThreshold'
}

export type Results = {
	top: Statement;
	sub: Results[];
};

export const ResultsSettingsSchema = object({
	resultsBy: enum_(ResultsBy),
	cutoffNumber: optional(number()),
	cutoffBy: optional( enum_(CutoffBy)),
	numberOfResults: optional(number()),
	numberOfSelections: optional(number()),
	deep: optional(number()),
	minConsensus: optional(number()),
});

export type ResultsSettings = InferOutput<typeof ResultsSettingsSchema>;

export const defaultResultsSettings:ResultsSettings = {
	resultsBy: ResultsBy.consensus,
	cutoffNumber: 0,
	cutoffBy: CutoffBy.topOptions,
	numberOfResults: 5,
	numberOfSelections: 1,
	deep: 2,
	minConsensus: 0.5,
};
