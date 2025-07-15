import { object, optional, number, enum_, InferOutput } from 'valibot';
import { Statement, ResultsBy, CutoffBy } from 'delib-npm';

export type Results = {
	top: Statement;
	sub: Results[];
};

export const ResultsSettingsSchema = object({
	resultsBy: enum_(ResultsBy),
	cutoffNumber: optional(number()),
	cutoffBy: enum_(CutoffBy),
	numberOfResults: optional(number()),
	numberOfSelections: optional(number()),
	deep: optional(number()),
	minConsensus: optional(number()),
});

export type ResultsSettings = InferOutput<typeof ResultsSettingsSchema>;
