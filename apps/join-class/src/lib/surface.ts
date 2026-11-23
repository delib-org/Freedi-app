/**
 * The surface a screen belongs to, on `<html data-surface="…">` (redesign port
 * spec, sections 1-2). The two new looks hang on it: `night` styles the student
 * surface and `mulberry` the teacher surface (see styles/_look-scope.scss). The
 * projector has no new look, so it keeps today's CSS. A surface is a property
 * of the route, not of the lesson: the lesson's look is `lib/lessonLook.ts`.
 */

export type Surface = 'student' | 'teacher' | 'projector';

export const SURFACE_ATTRIBUTE = 'data-surface';

/** The slice of an element this needs, so it runs without a DOM in tests. */
export interface SurfaceTarget {
	getAttribute(name: string): string | null;
	setAttribute(name: string, value: string): void;
	removeAttribute(name: string): void;
}

const STUDENT_ROOTS: ReadonlySet<string> = new Set(['c', 'seat', 'm']);
const TEACHER_ROOT = 't';
/** `/t/plans/**` are the lesson-plan screens; every other `/t/<x>` is a lesson. */
const PLANS_SEGMENT = 'plans';
const PROJECTOR_SEGMENT = 'screen';
/** `/t/:mid/screen` has exactly this many segments. */
const PROJECTOR_DEPTH = 3;

function segmentsOf(path: string): string[] {
	const [pathname] = path.split(/[?#]/);

	return pathname.split('/').filter((segment) => segment !== '');
}

/**
 * The surface of a route. Takes a concrete path (`/t/abc/screen?mode=window`)
 * or a route pattern (`/t/:mid/screen`): both have the same fixed segments.
 * Anything that is not a student or projector route is the teacher's, which
 * covers `/`, `/login` and unknown paths (they fall to the front door).
 */
export function surfaceOf(path: string): Surface {
	const segments = segmentsOf(path);
	const [root, lesson, screen] = segments;
	if (root !== undefined && STUDENT_ROOTS.has(root)) return 'student';

	const isProjector =
		segments.length === PROJECTOR_DEPTH &&
		root === TEACHER_ROOT &&
		lesson !== PLANS_SEGMENT &&
		screen === PROJECTOR_SEGMENT;

	return isProjector ? 'projector' : 'teacher';
}

/**
 * Writes the surface, or removes the attribute for `null`. A no-op when the
 * attribute already holds it, so calling this on every redraw costs one read.
 */
export function applySurface(target: SurfaceTarget, surface: Surface | null): void {
	if (surface === null) {
		target.removeAttribute(SURFACE_ATTRIBUTE);

		return;
	}
	if (target.getAttribute(SURFACE_ATTRIBUTE) !== surface) {
		target.setAttribute(SURFACE_ATTRIBUTE, surface);
	}
}

/** Apply the surface of a path or route pattern. */
export function applySurfaceOf(target: SurfaceTarget, path: string): void {
	applySurface(target, surfaceOf(path));
}
