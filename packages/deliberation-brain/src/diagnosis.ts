import {
	AudienceSizeSchema,
	ChallengeDiagnosis,
	DIAGNOSIS_FIELDS,
	DecisionBodySchema,
	DecisionTypeSchema,
	DesiredOutputSchema,
	DiagnosisField,
	FacilitationCapacitySchema,
	HasDraftSchema,
	PolarizationLevelSchema,
} from '@freedi/shared-types';
import { safeParse } from 'valibot';

/**
 * Fields the consultant must know before proposing, in priority order. The
 * playbook's entry rule comes first: "is there something written already?"
 */
export const CRITICAL_FIELDS: readonly DiagnosisField[] = [
	'hasDraft',
	'decisionType',
	'audienceSize',
	'timeHorizonDays',
	'polarization',
	'facilitationCapacity',
	'decisionBody',
	'desiredOutput',
];

export const CONFIDENCE_THRESHOLD = 0.5;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringArray(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	const items = value.filter((item): item is string => typeof item === 'string');

	return items.length > 0 ? items : undefined;
}

function confidenceRecord(value: unknown): Record<string, number> | undefined {
	if (!isRecord(value)) return undefined;
	const out: Record<string, number> = {};
	for (const [key, raw] of Object.entries(value)) {
		if (typeof raw === 'number' && Number.isFinite(raw)) out[key] = Math.min(1, Math.max(0, raw));
	}

	return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Turns whatever the model emitted as `diagnosis` into a valid
 * ChallengeDiagnosis, dropping unknown fields and out-of-vocabulary values
 * instead of failing the whole response.
 */
export function sanitizeDiagnosis(raw: unknown): ChallengeDiagnosis | undefined {
	if (!isRecord(raw)) return undefined;
	const out: ChallengeDiagnosis = {};

	const hasDraft = safeParse(HasDraftSchema, raw.hasDraft);
	if (hasDraft.success) out.hasDraft = hasDraft.output;
	const decisionBody = safeParse(DecisionBodySchema, raw.decisionBody);
	if (decisionBody.success) out.decisionBody = decisionBody.output;
	const decisionType = safeParse(DecisionTypeSchema, raw.decisionType);
	if (decisionType.success) out.decisionType = decisionType.output;
	const audienceSize = safeParse(AudienceSizeSchema, raw.audienceSize);
	if (audienceSize.success) out.audienceSize = audienceSize.output;
	const polarization = safeParse(PolarizationLevelSchema, raw.polarization);
	if (polarization.success) out.polarization = polarization.output;
	const facilitation = safeParse(FacilitationCapacitySchema, raw.facilitationCapacity);
	if (facilitation.success) out.facilitationCapacity = facilitation.output;
	const desiredOutput = safeParse(DesiredOutputSchema, raw.desiredOutput);
	if (desiredOutput.success) out.desiredOutput = desiredOutput.output;

	if (typeof raw.whoDecides === 'string' && raw.whoDecides.trim()) out.whoDecides = raw.whoDecides.trim();
	if (typeof raw.whoIsAffected === 'string' && raw.whoIsAffected.trim()) {
		out.whoIsAffected = raw.whoIsAffected.trim();
	}
	if (typeof raw.hardDeadline === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.hardDeadline)) {
		out.hardDeadline = raw.hardDeadline;
	}
	if (typeof raw.timeHorizonDays === 'number' && Number.isFinite(raw.timeHorizonDays) && raw.timeHorizonDays > 0) {
		out.timeHorizonDays = Math.round(raw.timeHorizonDays);
	}
	const existingOptions = stringArray(raw.existingOptions);
	if (existingOptions) out.existingOptions = existingOptions;
	const audienceSegments = stringArray(raw.audienceSegments);
	if (audienceSegments) out.audienceSegments = audienceSegments.map((segment) => segment.trim()).filter(Boolean);
	const constraints = stringArray(raw.constraints);
	if (constraints) out.constraints = constraints;
	const confidence = confidenceRecord(raw.confidence);
	if (confidence) out.confidence = confidence;

	return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * `next` overrides `prev` field by field when the next value is defined;
 * confidence maps are merged the same way.
 */
export function mergeDiagnosis(
	prev: ChallengeDiagnosis | undefined,
	next: ChallengeDiagnosis | undefined,
): ChallengeDiagnosis {
	const merged: ChallengeDiagnosis = { ...(prev ?? {}) };
	if (!next) return merged;

	for (const field of DIAGNOSIS_FIELDS) {
		const value = next[field];
		if (value !== undefined && value !== null) {
			(merged as Record<string, unknown>)[field] = value;
		}
	}
	if (prev?.confidence || next.confidence) {
		merged.confidence = { ...(prev?.confidence ?? {}), ...(next.confidence ?? {}) };
	}

	return merged;
}

/** True when the field is set and its confidence (if any) is ≥ threshold. */
export function isFieldKnown(diagnosis: ChallengeDiagnosis | undefined, field: DiagnosisField): boolean {
	if (!diagnosis) return false;
	// The time question is answered by either a horizon or a hard deadline.
	if (field === 'timeHorizonDays' || field === 'hardDeadline') {
		return isKnown(diagnosis, 'timeHorizonDays') || isKnown(diagnosis, 'hardDeadline');
	}

	return isKnown(diagnosis, field);
}

function isKnown(diagnosis: ChallengeDiagnosis, field: DiagnosisField): boolean {
	const value = diagnosis[field];
	if (value === undefined || value === null) return false;
	if (Array.isArray(value) && value.length === 0) return false;
	const confidence = diagnosis.confidence?.[field];

	return confidence === undefined || confidence >= CONFIDENCE_THRESHOLD;
}

/** Critical fields still missing (or low confidence), in priority order. */
export function missingCriticalFields(diagnosis: ChallengeDiagnosis | undefined): DiagnosisField[] {
	return CRITICAL_FIELDS.filter((field) => !isFieldKnown(diagnosis, field));
}
