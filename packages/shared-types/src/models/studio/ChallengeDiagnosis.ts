import { InferOutput, array, number, object, optional, picklist, record, string } from 'valibot';

/**
 * What the AI consultant has understood about an admin's challenge so far.
 * Every field is optional: the diagnosis is filled progressively across the
 * conversation, and `confidence` (0..1 per field) tells the dialogue policy
 * which gaps are worth a clarifying question.
 *
 * Kept in shared-types because it is stored on the Studio plan session and
 * consumed by `@freedi/deliberation-brain`, functions and the Studio app.
 */
export const DecisionTypeSchema = picklist([
	'gatherIdeas',
	'prioritize',
	'allocate',
	'choose',
	'draftText',
	'bridgeConflict',
	'legitimize',
	'educate',
]);
export type DecisionType = InferOutput<typeof DecisionTypeSchema>;

export const AudienceSizeSchema = picklist(['team', 'room', 'community', 'public']);
export type AudienceSize = InferOutput<typeof AudienceSizeSchema>;

export const PolarizationLevelSchema = picklist(['low', 'contested', 'hostile']);
export type PolarizationLevel = InferOutput<typeof PolarizationLevelSchema>;

export const FacilitationCapacitySchema = picklist(['none', 'canRunRoom']);
export type FacilitationCapacity = InferOutput<typeof FacilitationCapacitySchema>;

export const DesiredOutputSchema = picklist([
	'ideas',
	'ranking',
	'agreedText',
	'decision',
	'learning',
]);
export type DesiredOutput = InferOutput<typeof DesiredOutputSchema>;

/** The playbook's entry rule: what already exists when the admin arrives. */
export const HasDraftSchema = picklist(['text', 'material', 'nothing']);
export type HasDraft = InferOutput<typeof HasDraftSchema>;

/** Who formally decides at the end. */
export const DecisionBodySchema = picklist(['assembly', 'council', 'leadership', 'voteInMain']);
export type DecisionBody = InferOutput<typeof DecisionBodySchema>;

export const ChallengeDiagnosisSchema = object({
	/** text = a draft exists (→ Sign); material = results exist but no text (→ Draft); nothing (→ MC). */
	hasDraft: optional(HasDraftSchema),
	/** Groups with different stakes that need their own live session (e.g. members, youth). */
	audienceSegments: optional(array(string())),
	decisionBody: optional(DecisionBodySchema),
	decisionType: optional(DecisionTypeSchema),
	/** Who holds the final decision (e.g. "the city council", "the CEO"). */
	whoDecides: optional(string()),
	/** Who lives with the outcome (e.g. "residents of the northern district"). */
	whoIsAffected: optional(string()),
	audienceSize: optional(AudienceSizeSchema),
	polarization: optional(PolarizationLevelSchema),
	/** Options already on the table, if the admin named any. */
	existingOptions: optional(array(string())),
	/** Rough length of the whole process, in days. */
	timeHorizonDays: optional(number()),
	/** Hard external deadline, ISO date (YYYY-MM-DD), if any. */
	hardDeadline: optional(string()),
	facilitationCapacity: optional(FacilitationCapacitySchema),
	desiredOutput: optional(DesiredOutputSchema),
	constraints: optional(array(string())),
	/** Per-field confidence 0..1 (keys are the field names above). */
	confidence: optional(record(string(), number())),
});

export type ChallengeDiagnosis = InferOutput<typeof ChallengeDiagnosisSchema>;

/** Diagnosis fields the dialogue policy may ask about, in display order. */
export const DIAGNOSIS_FIELDS = [
	'hasDraft',
	'decisionType',
	'whoDecides',
	'whoIsAffected',
	'audienceSize',
	'polarization',
	'existingOptions',
	'timeHorizonDays',
	'hardDeadline',
	'facilitationCapacity',
	'desiredOutput',
	'audienceSegments',
	'decisionBody',
	'constraints',
] as const;

export type DiagnosisField = (typeof DIAGNOSIS_FIELDS)[number];
