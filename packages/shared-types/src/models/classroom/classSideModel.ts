import { InferOutput, number, object, optional, string } from 'valibot';
import { CampSchema, DecisionSupportSchema, SideValueSchema } from './classroomModel';
import type { Camp } from './classroomModel';
import type { SupportBySide } from './classroomLogic';

/**
 * join-class: a student's side, kept private (Trello btMVQMM5).
 *
 * The teacher may see WHO picked a side, never WHICH. So the slider value, its
 * camp and the support for the decision live on a doc only the student (and
 * the Admin SDK) can read: `classSides/{uid}--{mainId}`, the same id as the
 * student's workspace subscription. The readable subscription carries only
 * `sidePickedAt` (ms), which the rules let the owner set only in the same
 * write that leaves a camp on this doc.
 */

/** One doc per student and lesson: `classSides/{uid}--{mainId}`. */
export const CLASS_SIDES_COLLECTION = 'classSides';

/** The id of a student's side doc: the same as their subscription's. */
export function classSideId(mainId: string, uid: string): string {
	return `${uid}--${mainId}`;
}

export const ClassSideSchema = object({
	userId: string(),
	mainId: string(),
	/** Slider value 0..100. */
	side: optional(SideValueSchema),
	/** campOf(side). */
	camp: optional(CampSchema),
	/** Support for the decision, -1..+1 (the Summary's five faces). */
	decisionSupport: optional(DecisionSupportSchema),
	lastUpdate: number(),
});
export type ClassSide = InferOutput<typeof ClassSideSchema>;

/** The private fields, as the server reads them for one student. */
export type ClassSideValues = Pick<ClassSide, 'side' | 'camp' | 'decisionSupport'>;

/** The fields that once lived on the subscription and must not any more. */
export const CLASS_SIDE_PRIVATE_FIELDS = ['side', 'camp', 'decisionSupport'] as const;

/**
 * The steps at which the sides are frozen and their totals are shown (the
 * projector's Vote and Summary, the phones' Summary). Totals are visible only
 * here, and here no side may be picked or changed: otherwise a "chose" mark
 * appearing next to one camp's count rising would tell the teacher which side
 * that student picked. decisionSupport stays writable (it is entered at Summary).
 */
export const CLASS_SIDE_LOCKED_STEPS: readonly string[] = ['vote', 'summary'];

/** The lesson stands at a step where sides are frozen (and totals shown). No plan = not locked. */
export function sidesLocked(
	plan: { steps?: readonly string[]; stepIndex?: number } | null | undefined,
): boolean {
	if (!plan || !Array.isArray(plan.steps) || typeof plan.stepIndex !== 'number') return false;
	const step = plan.steps[plan.stepIndex];

	return typeof step === 'string' && CLASS_SIDE_LOCKED_STEPS.includes(step);
}

/**
 * Rollout switch, read only by firestore.rules and written only by the
 * backfill script (Admin SDK): while `classFlags/legacySideWrites` has
 * `open: true`, an app version from before this change may still write
 * side / camp / decisionSupport on its own subscription. Absent = closed.
 */
export const CLASS_FLAGS_COLLECTION = 'classFlags';
export const CLASS_FLAG_LEGACY_SIDE_WRITES = 'legacySideWrites';

/**
 * Merge a student's private side doc over the legacy subscription fields:
 * the private doc wins field by field (it was written by the newer app), the
 * subscription fills what it lacks until the backfill strips it.
 */
export function mergeClassSide(
	privateDoc: Partial<ClassSideValues> | undefined,
	legacy: Partial<ClassSideValues> | undefined,
): ClassSideValues {
	const side = privateDoc?.side ?? legacy?.side;
	const camp: Camp | undefined = privateDoc?.camp ?? legacy?.camp;

	return {
		side,
		camp,
		decisionSupport: privateDoc?.decisionSupport ?? legacy?.decisionSupport,
	};
}

/**
 * `classSupportBySide` (the teacher; a student when support by side is shown
 * to everyone), only while `sidesLocked` (Vote and Summary): the lesson's own support
 * by side, computed on the server from the private side docs. Totals only.
 */
export interface ClassSupportBySideRequest {
	mainId: string;
}
export interface ClassSupportBySideResponse {
	support: SupportBySide;
}
