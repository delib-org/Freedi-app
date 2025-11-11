import { InferOutput, object, string, number, picklist } from 'valibot';

export const PopperHebbianScoreSchema = object({
	statementId: string(),
	totalScore: number(), // Sum of all (support * weight) - positive = supporting, negative = challenging
	corroborationLevel: number(), // Normalized [0, 1]: 0 = falsified, 0.5 = no evidence, 1 = highly corroborated
	evidenceCount: number(), // Number of evidence posts contributing to this score
	status: picklist(['looking-good', 'under-discussion', 'needs-fixing']),
	lastCalculated: number() // Milliseconds since epoch
});

export type PopperHebbianScore = InferOutput<typeof PopperHebbianScoreSchema>;
