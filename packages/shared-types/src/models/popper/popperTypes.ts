import { object, picklist, string, number, InferOutput } from 'valibot';

export const PopperHebbianScoreSchema = object({
  statementId: string(),
  totalScore: number(),
  corroborationLevel: number(),  // Should be [0, 1] but not enforced by schema
  evidenceCount: number(),  // Should be non-negative integer
  status: picklist(['looking-good', 'under-discussion', 'needs-fixing']),
  lastCalculated: number() //milliseconds since epoch
});

export type PopperHebbianScore = InferOutput<typeof PopperHebbianScoreSchema>;