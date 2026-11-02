import { FieldValue } from 'firebase-admin/firestore';
import { Collections, type Statement } from '@freedi/shared-types';
import { getFirestoreAdmin } from '../admin';
import { logger } from '@/lib/utils/logger';
import { parseTargetPopulation } from '@/lib/utils/targetPopulation';

/**
 * Cascade the survey's "Number of stakeholders" (settings.targetPopulation) onto
 * each question Statement's evaluationSettings.targetPopulation, which is the
 * field scoring reads. Same pattern as cascadeAutoAiHandling.
 *
 * | Event                              | Does                                          |
 * | changed to a number                | write on every question, overwriting          |
 * | cleared                            | delete where it equals the previous value     |
 * | question added to survey with N    | write only if the question declares none      |
 * | any other save                     | nothing (a per-question edit survives)        |
 */

const FIRESTORE_BATCH_LIMIT = 500;
const FIELD = 'evaluationSettings.targetPopulation';

export type TargetPopulationAction =
	| { kind: 'write'; value: number }
	| { kind: 'delete' }
	| { kind: 'none' };

export interface TargetPopulationChange {
	/** survey.settings.targetPopulation before the save */
	previous: number | undefined;
	/** survey.settings.targetPopulation after the save */
	next: number | undefined;
}

const NONE: TargetPopulationAction = { kind: 'none' };

/** Which of the table's rows applies to the survey as a whole. */
export function decideForSurvey(change: TargetPopulationChange): TargetPopulationAction {
	const previous = parseTargetPopulation(change.previous);
	const next = parseTargetPopulation(change.next);

	if (next !== undefined && next !== previous) return { kind: 'write', value: next };
	if (next === undefined && previous !== undefined) return { kind: 'delete' };

	return NONE;
}

/** The survey-wide row, narrowed by what this one question already carries. */
export function decideForQuestion(
	action: TargetPopulationAction,
	change: TargetPopulationChange,
	current: number | undefined,
	justAdded: boolean,
): TargetPopulationAction {
	const have = parseTargetPopulation(current);
	const previous = parseTargetPopulation(change.previous);
	const next = parseTargetPopulation(change.next);

	if (action.kind === 'write') return have === action.value ? NONE : action;
	if (action.kind === 'delete') {
		return have !== undefined && have === previous ? action : NONE;
	}
	// Row 3: a question that joined a survey with N, and declares none of its own.
	if (justAdded && next !== undefined && have === undefined) {
		return { kind: 'write', value: next };
	}

	return NONE;
}

export interface TargetPopulationCascadeResult {
	updated: number;
	skipped: number;
}

interface CascadeInput {
	/** Questions the survey has now. */
	questionIds: string[];
	change: TargetPopulationChange;
	/** Questions that joined the survey in this save. */
	addedQuestionIds?: string[];
}

export async function cascadeTargetPopulation(
	input: CascadeInput,
): Promise<TargetPopulationCascadeResult> {
	const db = getFirestoreAdmin();
	const added = new Set(input.addedQuestionIds ?? []);
	const surveyAction = decideForSurvey(input.change);
	const ids = [...new Set(input.questionIds)];
	const refs = ids.map((id) => db.collection(Collections.statements).doc(id));
	const snaps = await Promise.all(refs.map((ref) => ref.get()));

	const writes: { ref: FirebaseFirestore.DocumentReference; action: TargetPopulationAction }[] = [];
	let skipped = 0;

	snaps.forEach((snap, i) => {
		if (!snap.exists) {
			skipped++;

			return;
		}
		const current = (snap.data() as Statement).evaluationSettings?.targetPopulation;
		const action = decideForQuestion(surveyAction, input.change, current, added.has(ids[i]));

		if (action.kind === 'none') {
			skipped++;

			return;
		}
		writes.push({ ref: refs[i], action });
	});

	for (let i = 0; i < writes.length; i += FIRESTORE_BATCH_LIMIT) {
		const batch = db.batch();
		for (const { ref, action } of writes.slice(i, i + FIRESTORE_BATCH_LIMIT)) {
			batch.update(ref, {
				[FIELD]: action.kind === 'write' ? action.value : FieldValue.delete(),
			});
		}
		await batch.commit();
	}

	logger.info('[cascadeTargetPopulation] cascaded', { updated: writes.length, skipped });

	return { updated: writes.length, skipped };
}
