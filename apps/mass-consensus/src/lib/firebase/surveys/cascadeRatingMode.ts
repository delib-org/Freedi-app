import {
	Collections,
	FIVE_POINT_STEPS,
	THREE_POINT_STEPS,
	type Statement,
	type RatingMode,
} from '@freedi/shared-types';
import { getFirestoreAdmin } from '../admin';
import type { Survey } from '@/types/survey';
import { logger } from '@/lib/utils/logger';

/**
 * Cascade the per-question rating-scale override (`ratingMode` + `ratingSteps`)
 * down to each question Statement's `statementSettings`.
 *
 * `statementSettings.ratingMode` is the cross-app source of truth read by every
 * evaluation surface (MC swipe/classic, main-app faces, etc.) via
 * `getEvaluationScale(ratingMode)`. MC admins edit it through the survey
 * per-question editor, so we mirror the value onto the Statement doc on every
 * survey save (same pattern as cascadeMinResponseWords).
 *
 * `ratingSteps` rides along with it: 3 = the -1 · 0 · +1 scale, 5 = the classic
 * five steps. Both are always written together, so picking a different scale
 * in MC can never leave a stale step count behind.
 *
 * Coexistence: like minResponseWords, other surfaces (e.g. the main-app map
 * control panel) may write ratingMode directly onto the Statement. To avoid a
 * routine MC survey save silently resetting a value set elsewhere, we only
 * cascade when the MC admin has *explicitly* set a per-question override.
 */

const FIRESTORE_BATCH_LIMIT = 500;
const VALID_MODES: readonly RatingMode[] = ['agree-disagree', 'reactions'];

/** Explicit override the admin set in MC, or undefined when never set. */
function readOverride(settings: unknown): RatingMode | undefined {
	if (!settings || typeof settings !== 'object') return undefined;
	const raw = (settings as { ratingMode?: unknown }).ratingMode;
	if (typeof raw !== 'string' || !VALID_MODES.includes(raw as RatingMode)) return undefined;

	return raw as RatingMode;
}

/** Current effective mode stored on the Statement ('agree-disagree' when none). */
function readCurrent(settings: unknown): RatingMode {
	return readOverride(settings) ?? 'agree-disagree';
}

/** Steps on the agree-disagree scale: 3 only when explicitly set, otherwise the classic 5. */
function readSteps(settings: unknown): number {
	if (!settings || typeof settings !== 'object') return FIVE_POINT_STEPS;
	const raw = (settings as { ratingSteps?: unknown }).ratingSteps;

	return raw === THREE_POINT_STEPS ? THREE_POINT_STEPS : FIVE_POINT_STEPS;
}

export interface RatingModeCascadeResult {
	surveyId: string;
	totalQuestions: number;
	updated: number;
	skipped: number;
}

export async function cascadeRatingMode(
	survey: Survey,
): Promise<RatingModeCascadeResult> {
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
		effective: RatingMode;
		steps: number;
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

		// Only cascade when the MC admin explicitly set an override; otherwise
		// leave whatever another surface wrote on the Statement intact.
		const questionSetting = survey.questionSettings?.[questionId];
		const override = readOverride(questionSetting);
		if (override === undefined) {
			skipped++;
			continue;
		}

		const steps = readSteps(questionSetting);
		const current = readCurrent(statement.statementSettings);
		if (current === override && readSteps(statement.statementSettings) === steps) {
			skipped++;
			continue;
		}

		writesNeeded.push({ ref: docRefs[i], effective: override, steps });
	}

	if (writesNeeded.length === 0) {
		return { surveyId, totalQuestions: questionIds.length, updated: 0, skipped };
	}

	let updated = 0;
	for (let i = 0; i < writesNeeded.length; i += FIRESTORE_BATCH_LIMIT) {
		const chunk = writesNeeded.slice(i, i + FIRESTORE_BATCH_LIMIT);
		const batch = db.batch();
		for (const { ref, effective, steps } of chunk) {
			batch.update(ref, {
				'statementSettings.ratingMode': effective,
				'statementSettings.ratingSteps': steps,
			});
		}
		await batch.commit();
		updated += chunk.length;
	}

	logger.info('[cascadeRatingMode] Cascaded for survey:', surveyId, {
		totalQuestions: questionIds.length,
		updated,
		skipped,
	});

	return { surveyId, totalQuestions: questionIds.length, updated, skipped };
}

export const __INTERNAL = { readOverride, readCurrent, readSteps };
