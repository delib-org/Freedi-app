import { InferOutput, object, string, number, picklist, optional } from 'valibot';

export const PopperHebbianScoreSchema = object({
	statementId: string(),
	hebbianScore: number(), // NEW: Popperian-Bayesian score [0, 1]: 0 = falsified, 0.6 = prior, 1 = corroborated
	evidenceCount: number(), // Number of evidence posts contributing to this score
	status: picklist(['looking-good', 'under-discussion', 'needs-fixing']),
	lastCalculated: number(), // Milliseconds since epoch
	// DEPRECATED - kept for backward compatibility
	totalScore: optional(number()), // Old: Sum of all (support * weight)
	corroborationLevel: optional(number()), // Old: Sigmoid normalized [0, 1]
});

export type PopperHebbianScore = InferOutput<typeof PopperHebbianScoreSchema>;

// Constants for Hebbian scoring
export const HEBBIAN_CONFIG = {
	PRIOR: 0.6, // Starting score (benefit of doubt)
	THRESHOLD: 0.6, // Above this = corroborated
	FLOOR: 0.05, // Minimum score
	CEILING: 0.95, // Maximum score
} as const;
