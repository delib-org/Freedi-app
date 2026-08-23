import { Collections, type Statement } from '@freedi/shared-types';
import { getFirestoreAdmin } from '../admin';
import type { Survey } from '@/types/survey';
import { logger } from '@/lib/utils/logger';

/**
 * Cascade the survey-level + per-question liveSynthEnabled toggles down to
 * each question Statement's `statementSettings.liveSynthEnabled` field.
 *
 * Semantics (hard kill switch): survey OFF disables every question regardless
 * of its per-question override. Survey ON falls through to the per-question
 * value (true if unset).
 *
 * The field name matches the backend feature gate in
 * `functions/src/synthesis/liveSynth/featureGate.ts`, which reads
 * `statement.statementSettings.liveSynthEnabled` via a typed cast.
 *
 * Defaults: when survey-level is unset, treat as ON (true). This matches the
 * "MC defaults to live-synth ON" behavior the feature gate already implements.
 */

const FIRESTORE_BATCH_LIMIT = 500;

type ModelTier = 'standard' | 'premium';

interface SurveyLikeSettings {
	liveSynthEnabled?: boolean;
	synthesisModelTier?: ModelTier;
}

function readLiveSynth(settings: unknown): boolean | undefined {
	if (!settings || typeof settings !== 'object') return undefined;
	const raw = (settings as SurveyLikeSettings).liveSynthEnabled;
	if (raw === true) return true;
	if (raw === false) return false;

	return undefined;
}

/** Read a synthesis model tier from a survey-settings-like object. */
function readSurveyTier(settings: unknown): ModelTier | undefined {
	if (!settings || typeof settings !== 'object') return undefined;
	const raw = (settings as SurveyLikeSettings).synthesisModelTier;

	return raw === 'premium' || raw === 'standard' ? raw : undefined;
}

/** Read the tier already stored on a question's statementSettings.synthesis. */
function readStatementTier(statementSettings: unknown): ModelTier | undefined {
	if (!statementSettings || typeof statementSettings !== 'object') return undefined;
	const synthesis = (statementSettings as { synthesis?: { modelTier?: unknown } }).synthesis;
	const raw = synthesis?.modelTier;

	return raw === 'premium' || raw === 'standard' ? raw : undefined;
}

export interface CascadeResult {
	surveyId: string;
	totalQuestions: number;
	updated: number;
	skipped: number;
	surveyOn: boolean;
}

/**
 * Push the resolved liveSynthEnabled value to every question Statement
 * referenced by the survey. Safe to call on every survey save — writes only
 * when the resolved value differs from what's already on the Statement.
 *
 * Caller passes the survey directly to avoid a circular import with surveyCrud.
 */
export async function cascadeSynthesisToggle(survey: Survey): Promise<CascadeResult> {
	const surveyId = survey.surveyId;
	const surveyOverride = readLiveSynth(survey.settings);
	// Default ON when the survey-level toggle is unset — matches MC default behavior.
	const surveyOn = surveyOverride ?? true;
	// Survey-level model tier cascades uniformly to every question. Default
	// 'standard' — the measured-safe, cheaper synthesis model; an admin sets
	// 'premium' for a high-stakes survey.
	const surveyTier: ModelTier = readSurveyTier(survey.settings) ?? 'standard';

	const db = getFirestoreAdmin();
	const questionIds = [...new Set(survey.questionIds || [])];

	if (questionIds.length === 0) {
		return { surveyId, totalQuestions: 0, updated: 0, skipped: 0, surveyOn };
	}

	// Load all current question Statements so we only write when the resolved
	// value differs from what's stored. Chunk fetches to stay clear of
	// Firestore's 10-doc `in` limit by reading each doc individually in parallel.
	const docRefs = questionIds.map((id) =>
		db.collection(Collections.statements).doc(id)
	);
	const snapshots = await Promise.all(docRefs.map((ref) => ref.get()));

	const writesNeeded: {
		ref: FirebaseFirestore.DocumentReference;
		update: Record<string, unknown>;
	}[] = [];
	let skipped = 0;

	for (let i = 0; i < snapshots.length; i++) {
		const snap = snapshots[i];
		if (!snap.exists) {
			skipped++;
			continue;
		}
		const statement = snap.data() as Statement;
		const questionId = questionIds[i];

		const perQuestionOverride = readLiveSynth(survey.questionSettings?.[questionId]);
		// Survey-on path: per-question override wins, default ON if unset.
		// Survey-off path: hard kill — every question is false.
		const effective = surveyOn ? (perQuestionOverride ?? true) : false;

		const update: Record<string, unknown> = {};
		if (readLiveSynth(statement.statementSettings) !== effective) {
			update['statementSettings.liveSynthEnabled'] = effective;
		}
		if (readStatementTier(statement.statementSettings) !== surveyTier) {
			update['statementSettings.synthesis.modelTier'] = surveyTier;
		}

		if (Object.keys(update).length === 0) {
			skipped++;
			continue;
		}

		writesNeeded.push({ ref: docRefs[i], update });
	}

	if (writesNeeded.length === 0) {
		return { surveyId, totalQuestions: questionIds.length, updated: 0, skipped, surveyOn };
	}

	// Batch writes, respecting Firestore's 500-op limit per batch.
	let updated = 0;
	for (let i = 0; i < writesNeeded.length; i += FIRESTORE_BATCH_LIMIT) {
		const chunk = writesNeeded.slice(i, i + FIRESTORE_BATCH_LIMIT);
		const batch = db.batch();
		for (const { ref, update } of chunk) {
			batch.update(ref, update);
		}
		await batch.commit();
		updated += chunk.length;
	}

	logger.info('[cascadeSynthesisToggle] Cascaded for survey:', surveyId, {
		totalQuestions: questionIds.length,
		updated,
		skipped,
		surveyOn,
	});

	return { surveyId, totalQuestions: questionIds.length, updated, skipped, surveyOn };
}

export const __INTERNAL = { readLiveSynth, readSurveyTier, readStatementTier };
