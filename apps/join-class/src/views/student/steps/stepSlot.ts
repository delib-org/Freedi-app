import m from 'mithril';
import type { LessonStepKey, Statement } from '@freedi/shared-types';
import { stepLabel } from '@/lib/lesson';
import { StudentFrame } from '@/components/StudentFrame';

/**
 * Contract of a step slot file (views/student/steps/<Step>Step.ts):
 * a Mithril component that takes `StepAttrs` and renders ONE step of the lesson
 * for a student. The slot owner replaces the placeholder body and keeps the
 * export name. Live data comes from `classState` (lib/classroom/classState.ts,
 * started by StudentStage) and the main statement passed in `main`.
 */
export interface StepAttrs {
	/** The workspace (main statement). */
	main: Statement;
}

/** Placeholder body: the step label in the shared frame. Slot owners delete the call. */
export function placeholderStep(key: LessonStepKey): m.Component<StepAttrs> {
	return {
		view() {
			return m(StudentFrame, { headerLine: stepLabel(key), instruction: stepLabel(key) });
		},
	};
}
