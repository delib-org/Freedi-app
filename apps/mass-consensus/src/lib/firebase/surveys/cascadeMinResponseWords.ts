import { Collections, type Statement } from '@freedi/shared-types';
import { getFirestoreAdmin } from '../admin';
import type { Survey } from '@/types/survey';
import { logger } from '@/lib/utils/logger';

/**
 * Cascade the per-question `minResponseWords` override down to each question
 * Statement's `statementSettings.minResponseWords` field.
 *
 * `statementSettings.minResponseWords` is the single source of truth read by the
 * submit route (server enforcement), the SolutionPromptModal (client hint) and
 * the main-app cluster/sticky-note map control panel. MC admins edit it through
 * the survey per-question editor, so we mirror the value onto the Statement doc
 * on every survey save (same pattern as cascadeSynthesisToggle).
 *
 * There is no survey-level minimum — only per-question. A value of 0 or negative
 * means "no minimum" and is normalized to 0 on the Statement.
 *
 * Coexistence with the map control panel: the panel writes minResponseWords
 * directly onto the Statement. To avoid a routine MC survey save silently
 * resetting a value set from the map, we only cascade when the MC admin has
 * *explicitly* set a per-question override (defined value). When the override is
 * undefined we leave the Statement's current value untouched.
 */

const FIRESTORE_BATCH_LIMIT = 500;

/** Explicit override the admin set in MC, or undefined when never set. */
function readOverride(settings: unknown): number | undefined {
	if (!settings || typeof settings !== 'object') return undefined;
	const raw = (settings as { minResponseWords?: unknown }).minResponseWords;
	if (typeof raw !== 'number' || !Number.isFinite(raw)) return undefined;

	return raw <= 0 ? 0 : Math.floor(raw);
}

/** Current effective minimum stored on the Statement (0 when none). */
function readCurrent(settings: unknown): number {
	return readOverride(settings) ?? 0;
}

export interface MinWordsCascadeResult {
	surveyId: string;
	totalQuestions: number;
	updated: number;
	skipped: number;
}

export async function cascadeMinResponseWords(
	survey: Survey,
): Promise<MinWordsCascadeResult> {
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
		effective: number;
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
		// leave whatever the map panel wrote on the Statement intact.
		const override = readOverride(survey.questionSettings?.[questionId]);
		if (override === undefined) {
			skipped++;
			continue;
		}

		const current = readCurrent(statement.statementSettings);
		if (current === override) {
			skipped++;
			continue;
		}

		writesNeeded.push({ ref: docRefs[i], effective: override });
	}

	if (writesNeeded.length === 0) {
		return { surveyId, totalQuestions: questionIds.length, updated: 0, skipped };
	}

	let updated = 0;
	for (let i = 0; i < writesNeeded.length; i += FIRESTORE_BATCH_LIMIT) {
		const chunk = writesNeeded.slice(i, i + FIRESTORE_BATCH_LIMIT);
		const batch = db.batch();
		for (const { ref, effective } of chunk) {
			batch.update(ref, { 'statementSettings.minResponseWords': effective });
		}
		await batch.commit();
		updated += chunk.length;
	}

	logger.info('[cascadeMinResponseWords] Cascaded for survey:', surveyId, {
		totalQuestions: questionIds.length,
		updated,
		skipped,
	});

	return { surveyId, totalQuestions: questionIds.length, updated, skipped };
}

export const __INTERNAL = { readOverride, readCurrent };
