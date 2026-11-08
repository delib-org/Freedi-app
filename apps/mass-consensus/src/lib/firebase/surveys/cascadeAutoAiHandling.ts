import { Collections, type Statement } from '@freedi/shared-types';
import { getFirestoreAdmin } from '../admin';
import type { Survey } from '@/types/survey';
import { logger } from '@/lib/utils/logger';

/**
 * Cascade the automatic AI handling of a submission — `autoSplitMultiSuggestions`
 * and `autoMergeSimilar` — down to each question Statement's `statementSettings`.
 *
 * These start life as survey settings, but a question is also reachable outside
 * any survey (`/q/<statementId>`), where there is no survey to read them from.
 * The Statement is the only thing that page has, so the effective value is
 * mirrored onto it and the add-idea flow falls back to it when no survey
 * context is present.
 *
 * Unlike cascadeMinResponseWords and cascadeRatingMode, which mirror only an
 * explicit per-question override (the main-app map panel writes those same
 * fields and must not be overwritten), these two fields are written by MC
 * alone. So the *effective* value is cascaded — the per-question override when
 * the admin set one, otherwise the survey-wide default — and a survey-level
 * toggle reaches the standalone page too.
 */

const FIRESTORE_BATCH_LIMIT = 500;

type AutoField = 'autoSplitMultiSuggestions' | 'autoMergeSimilar';

const FIELDS: readonly AutoField[] = ['autoSplitMultiSuggestions', 'autoMergeSimilar'];

/** Read one boolean field, or undefined when it was never set. */
function readFlag(settings: unknown, field: AutoField): boolean | undefined {
	if (!settings || typeof settings !== 'object') return undefined;
	const raw = (settings as Record<string, unknown>)[field];

	return typeof raw === 'boolean' ? raw : undefined;
}

/**
 * What should apply to this question: its own override first, then the
 * survey-wide default. Undefined when neither was ever set — nothing to mirror.
 */
function readEffective(
	surveySettings: unknown,
	questionOverrides: unknown,
	field: AutoField,
): boolean | undefined {
	return readFlag(questionOverrides, field) ?? readFlag(surveySettings, field);
}

/** What the Statement carries today; an unset field means off. */
function readCurrent(statementSettings: unknown, field: AutoField): boolean {
	return readFlag(statementSettings, field) ?? false;
}

export interface AutoAiHandlingCascadeResult {
	surveyId: string;
	totalQuestions: number;
	updated: number;
	skipped: number;
}

export async function cascadeAutoAiHandling(
	survey: Survey,
): Promise<AutoAiHandlingCascadeResult> {
	const surveyId = survey.surveyId;
	const db = getFirestoreAdmin();
	const questionIds = [...new Set(survey.questionIds || [])];

	if (questionIds.length === 0) {
		return { surveyId, totalQuestions: 0, updated: 0, skipped: 0 };
	}

	const docRefs = questionIds.map((id) =>
		db.collection(Collections.statements).doc(id),
	);
	const snapshots = await Promise.all(docRefs.map((ref) => ref.get()));

	const writesNeeded: {
		ref: FirebaseFirestore.DocumentReference;
		changes: Record<string, boolean>;
	}[] = [];
	let skipped = 0;

	for (let i = 0; i < snapshots.length; i++) {
		const snap = snapshots[i];
		if (!snap.exists) {
			skipped++;
			continue;
		}
		const statement = snap.data() as Statement;
		const overrides = survey.questionSettings?.[questionIds[i]];

		const changes: Record<string, boolean> = {};
		for (const field of FIELDS) {
			const effective = readEffective(survey.settings, overrides, field);
			if (effective === undefined) continue;
			if (readCurrent(statement.statementSettings, field) === effective) continue;

			changes[`statementSettings.${field}`] = effective;
		}

		if (Object.keys(changes).length === 0) {
			skipped++;
			continue;
		}

		writesNeeded.push({ ref: docRefs[i], changes });
	}

	if (writesNeeded.length === 0) {
		return { surveyId, totalQuestions: questionIds.length, updated: 0, skipped };
	}

	let updated = 0;
	for (let i = 0; i < writesNeeded.length; i += FIRESTORE_BATCH_LIMIT) {
		const chunk = writesNeeded.slice(i, i + FIRESTORE_BATCH_LIMIT);
		const batch = db.batch();
		for (const { ref, changes } of chunk) {
			batch.update(ref, changes);
		}
		await batch.commit();
		updated += chunk.length;
	}

	logger.info('[cascadeAutoAiHandling] Cascaded for survey:', surveyId, {
		totalQuestions: questionIds.length,
		updated,
		skipped,
	});

	return { surveyId, totalQuestions: questionIds.length, updated, skipped };
}

export const __INTERNAL = { readFlag, readEffective, readCurrent };
