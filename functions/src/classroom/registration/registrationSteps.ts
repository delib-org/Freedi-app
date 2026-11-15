import type { LessonPlan, LessonStepKey } from '@freedi/shared-types';

/**
 * Position and side are one concept (IA tables-class-bridge 2.5): when the
 * registration asks the position question, a connected lesson has no 'side'
 * step for anybody. Taking it out and putting it back keep the room on the step
 * it is at. Pure.
 */

const SIDE: LessonStepKey = 'side';
/** The side step sits right before the tables, or else right after the opening. */
const SIDE_GOES_BEFORE: LessonStepKey = 'tables';
const SIDE_GOES_AFTER: LessonStepKey = 'opening';

/** The plan without 'side', or undefined when it has none. */
export function planWithoutSide(plan: LessonPlan): LessonPlan | undefined {
	const at = plan.steps.indexOf(SIDE);
	if (at < 0) return undefined;
	const steps = plan.steps.filter((step) => step !== SIDE);
	const stepIndex = Math.min(
		plan.stepIndex > at ? plan.stepIndex - 1 : plan.stepIndex,
		steps.length - 1,
	);

	return { ...plan, steps, stepIndex: Math.max(0, stepIndex) };
}

/** The plan with 'side' back in its place; the same plan when it already has one. */
export function planWithSide(plan: LessonPlan): LessonPlan {
	if (plan.steps.includes(SIDE)) return plan;
	const before = plan.steps.indexOf(SIDE_GOES_BEFORE);
	const after = plan.steps.indexOf(SIDE_GOES_AFTER);
	const at = before >= 0 ? before : after >= 0 ? after + 1 : Math.min(1, plan.steps.length);
	const steps = [...plan.steps.slice(0, at), SIDE, ...plan.steps.slice(at)];

	return { ...plan, steps, stepIndex: plan.stepIndex >= at ? plan.stepIndex + 1 : plan.stepIndex };
}
