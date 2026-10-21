import type { Statement } from '@freedi/shared-types';

/**
 * The one decision: does `/m/:mid` render the classroom student stage instead of
 * Join's normal hub? Yes when the workspace is a lesson (has a `lessonPlan`) and
 * the viewer is not its teacher. A teacher can still preview the student view
 * with `?student=1`.
 */
export function useStudentStage(
	main: Statement | null,
	isTeacher: boolean,
	previewParam?: string,
): boolean {
	if (!main?.statementSettings?.lessonPlan) return false;
	if (!isTeacher) return true;

	return previewParam === '1';
}
