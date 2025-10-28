import { InferOutput, object, string, number, picklist } from 'valibot';

export const PopperHebbianScoreSchema = object({
	statementId: string(),
	totalScore: number(), // Sum of all (support * weight) - positive = supporting, negative = challenging
	status: picklist(['looking-good', 'under-discussion', 'needs-fixing']),
	lastCalculated: number()
});

export type PopperHebbianScore = InferOutput<typeof PopperHebbianScoreSchema>;
