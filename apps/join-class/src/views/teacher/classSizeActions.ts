import { t } from '@/lib/i18n';
import { getSubQuestions } from '@/lib/store';
import {
	ClassSizeRecalcError,
	ClassSizeSaveError,
	saveClassSize,
} from '@/lib/classroom/classSizeApi';
import { act, consoleState } from './consoleState';

/**
 * The teacher's class-size actions in the console. Saved through `act`, so a
 * failure becomes the console's plain failure line with a retry.
 */

const CLASS_SIZE_KEY = 'classSize';

/** The plain words for what went wrong; undefined falls back to the generic line. */
export function explainClassSizeFailure(error: unknown): string | undefined {
	if (error instanceof ClassSizeSaveError) return t('console.class_size.save_failed');
	if (error instanceof ClassSizeRecalcError) return t('console.class_size.recalc_failed');

	return undefined;
}

/** Save N on the lesson and its questions, then rescore. Empty input means the default. */
export function saveClassSizeNow(raw: string): Promise<boolean> {
	return act(
		CLASS_SIZE_KEY,
		t('teacher.lesson.students_label'),
		async () => {
			await saveClassSize(
				consoleState.mainId,
				getSubQuestions().map((q) => q.statementId),
				raw,
			);
		},
		explainClassSizeFailure,
	);
}

// ---- a number that did not reach a new lesson ---------------------------------

const unsavedAtStart = new Map<string, string>();

/** ClassForm could not write N on the lesson it just made; the console says so on arrival. */
export function rememberUnsavedClassSize(mainId: string, raw: string): void {
	unsavedAtStart.set(mainId, raw);
}

/** Called when the console opens: shows the remembered failure with a retry. */
export function showUnsavedClassSize(mainId: string): void {
	const raw = unsavedAtStart.get(mainId);
	if (raw === undefined) return;
	unsavedAtStart.delete(mainId);
	consoleState.failure = {
		label: t('teacher.lesson.students_label'),
		message: t('console.class_size.save_failed'),
		retry: () => void saveClassSizeNow(raw),
	};
}
