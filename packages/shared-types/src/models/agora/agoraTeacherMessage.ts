import { number, object, optional, picklist, string, InferOutput } from 'valibot';

/**
 * One line of the private conversation between the teacher and ONE student.
 *
 * A separate collection, not a `statements` child: statements are readable
 * by every signed-in user and every student's deliberation listener already
 * pulls the whole session's worth, so a note filed there would land on every
 * phone in the room. Here both listener keys (`teacherId`, `studentUid`) are
 * pinned on every doc by the callable that writes it, and the rule is two
 * equalities either side can prove.
 *
 * Moderation notices ride in the same thread: when the teacher hides or
 * rewrites a student's text, the reason and the words taken down are written
 * HERE — the only place they exist — so the author sees why, and the class
 * never does.
 */
export const AgoraTeacherMessageFromSchema = picklist(['teacher', 'student']);
export type AgoraTeacherMessageFrom = InferOutput<typeof AgoraTeacherMessageFromSchema>;

export const AgoraTeacherMessageKindSchema = picklist(['note', 'reply', 'moderation']);
export type AgoraTeacherMessageKind = InferOutput<typeof AgoraTeacherMessageKindSchema>;

export const AgoraModerationActionSchema = picklist(['hidden', 'restored', 'edited']);
export type AgoraModerationAction = InferOutput<typeof AgoraModerationActionSchema>;

export const AgoraTeacherMessageSchema = object({
	messageId: string(),
	sessionId: string(),
	teacherId: string(),
	studentUid: string(),
	from: AgoraTeacherMessageFromSchema,
	kind: AgoraTeacherMessageKindSchema,
	/** The note or reply; for a moderation notice, the teacher's reason (may be empty) */
	text: string(),
	/**
	 * A quick phrase the teacher tapped rather than typed — an i18n key the
	 * student's phone renders in ITS language. `text` still carries the
	 * teacher-language rendering as a fallback.
	 */
	presetKey: optional(string()),
	/** Moderation notices and "about your proposal" notes: which text */
	aboutStatementId: optional(string()),
	moderation: optional(AgoraModerationActionSchema),
	/** hidden: the text taken down; edited: the text before the teacher's wording */
	removedText: optional(string()),
	createdAt: number(),
});

export type AgoraTeacherMessage = InferOutput<typeof AgoraTeacherMessageSchema>;

/** The quick phrases a teacher can send with one tap. Keys under `teacherPreset.*` */
export const AGORA_TEACHER_PRESETS = [
	'language',
	'encourage',
	'ontopic',
	'rate_more',
	'help_more',
] as const;
export type AgoraTeacherPreset = (typeof AGORA_TEACHER_PRESETS)[number];

export function isAgoraTeacherPreset(key: unknown): key is AgoraTeacherPreset {
	return typeof key === 'string' && (AGORA_TEACHER_PRESETS as readonly string[]).includes(key);
}
