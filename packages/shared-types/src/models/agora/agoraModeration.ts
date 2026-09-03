import { boolean, number, object, optional, InferOutput } from 'valibot';

/**
 * The teacher's marks on a student's text. Lives on the statement itself so
 * every reader — the client listener, the scoring trigger, the ballot draw —
 * can filter on one field. Deliberately carries NO reason and NO removed
 * text: `statements` is readable by every signed-in user, so anything written
 * here is visible to the whole class. The reason and the text taken down live
 * on the private teacher thread (`agoraTeacherMessages`), which only the
 * teacher and the author can read.
 *
 * `hidden` is mirrored into the shared `hide` flag, because the ballot
 * selector already honours that one; keeping them in lockstep means the
 * square, the vote and the results all agree without a second code path.
 */
export const AgoraModerationSchema = object({
	hidden: boolean(),
	hiddenAt: optional(number()),
	restoredAt: optional(number()),
	/** When the teacher last rewrote the text — the "edited by teacher" mark */
	editedAt: optional(number()),
});

export type AgoraModeration = InferOutput<typeof AgoraModerationSchema>;

/** The shape both the trigger and the client hold before parsing */
export interface ModeratedDoc {
	agoraModeration?: {
		hidden?: boolean;
		hiddenAt?: number;
		restoredAt?: number;
		editedAt?: number;
	} | null;
	hide?: boolean | null;
}

/** Taken down by the teacher — out of every count, board and ballot */
export function isAgoraHidden(doc: ModeratedDoc | null | undefined): boolean {
	if (!doc) return false;

	return doc.agoraModeration?.hidden === true || doc.hide === true;
}

/** The text on screen is (partly) the teacher's wording */
export function isTeacherEdited(doc: ModeratedDoc | null | undefined): boolean {
	return typeof doc?.agoraModeration?.editedAt === 'number';
}

/**
 * Did THIS write come from the teacher's moderation callable? A teacher's
 * edit, hide or restore changes exactly one of the moderation clocks; a
 * student's own save never touches them (rules pin the whole object). The
 * proposal trigger uses this to keep revision credit, weave credit and the
 * elders' re-reading for the student's own words only.
 */
export function isTeacherTouched(
	before: ModeratedDoc | null | undefined,
	after: ModeratedDoc | null | undefined,
): boolean {
	const b = before?.agoraModeration ?? undefined;
	const a = after?.agoraModeration ?? undefined;
	if (!a && !b) return false;
	const clocks = ['editedAt', 'hiddenAt', 'restoredAt'] as const;

	return clocks.some(
		(clock) =>
			(a as Record<string, unknown> | undefined)?.[clock] !==
			(b as Record<string, unknown> | undefined)?.[clock],
	);
}
