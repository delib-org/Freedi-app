import { InferOutput, array, boolean, number, object, optional, string } from 'valibot';

/**
 * join-class: lesson plans, games and lessons (IA docs/ia/join-class-lesson-plan.md, v2).
 *
 * - A LESSON PLAN is a teacher's topic: doc `classPlans/{planId}` (not a statement).
 * - A GAME is a prepared game of a plan: doc `classPlans/{planId}/games/{gameId}`
 *   (not a statement), holding a snapshot of the questions and settings. No class code.
 * - A LESSON (a played game) is a question statement built from a game's snapshot by
 *   the server, under a HOME: parentId = topParentId = homeId, parents = [homeId].
 * - A HOME is a top-level group statement, secret, teachers only:
 *   `jcClass_{classId}` for an Agora/Studio class, `jcTeacher_{uid}` for "no class".
 *
 * All times are milliseconds.
 */

/** Collection holding one owner-scoped doc per lesson plan. */
export const CLASS_PLANS_COLLECTION = 'classPlans';
/** Subcollection of a plan holding its games. */
export const CLASS_GAMES_SUBCOLLECTION = 'games';

/** Id prefix of a class home statement: `jcClass_{classId}`. */
export const CLASS_HOME_PREFIX = 'jcClass_';
/** Id prefix of a teacher home statement: `jcTeacher_{uid}`. */
export const TEACHER_HOME_PREFIX = 'jcTeacher_';

/** `statementSettings.classHome.kind` values. Plain strings on the statement (no picklist). */
export const CLASS_HOME_KIND = { class: 'class', teacher: 'teacher' } as const;
export type ClassHomeKind = (typeof CLASS_HOME_KIND)[keyof typeof CLASS_HOME_KIND];

/** Longest plan / game title kept. */
export const CLASS_PLAN_TITLE_MAX_LENGTH = 200;
/** Longest class name kept on a lesson. */
export const CLASS_NAME_MAX_LENGTH = 60;
/** Longest name a teacher can give a lesson when starting it (classStartLesson `lessonName`). */
export const LESSON_NAME_MAX_LENGTH = 80;
/** Caps on one game (the plan screen's own limits are lower). */
export const CLASS_GAME_MAX_QUESTIONS = 50;
export const CLASS_GAME_MAX_PARAGRAPHS = 30;
export const CLASS_GAME_MAX_VIDEOS = 5;
/** Longest single text (question, hint, paragraph, claim) a snapshot may carry. */
export const CLASS_GAME_MAX_TEXT_LENGTH = 2000;

export const ClassPlanSchema = object({
	planId: string(),
	title: string(),
	ownerUid: string(),
	createdAt: number(),
	lastUpdate: number(),
});
export type ClassPlan = InferOutput<typeof ClassPlanSchema>;

export const ClassGameQuestionSchema = object({
	/** Stable key inside the snapshot (the editor's row id). Not a statement id. */
	key: string(),
	text: string(),
	hint: optional(string()),
	/** 'guiding' | 'challenge'; absent = a plain guiding question. A string on purpose. */
	classRole: optional(string()),
	order: number(),
});
export type ClassGameQuestion = InferOutput<typeof ClassGameQuestionSchema>;

export const ClassGameParagraphSchema = object({
	key: string(),
	text: string(),
	order: number(),
	/** ParagraphType value (paragraph, h1..h6, li...). */
	blockType: optional(string()),
	/** ListType value for list items. */
	listType: optional(string()),
	contentHtml: optional(string()),
});
export type ClassGameParagraph = InferOutput<typeof ClassGameParagraphSchema>;

export const ClassGameVideoSchema = object({ id: string(), title: string(), url: string() });

/** The main-statement settings a game carries (the `mainSettings` whitelist of a lesson copy). */
export const ClassGameSettingsSchema = object({
	speakSeconds: optional(number()),
	proposalsTurns: optional(number()),
	tableSize: optional(number()),
	allowOwnQuestions: optional(boolean()),
	sideQuestion: optional(string()),
	/** @deprecated single video of old lessons; `introVideos` supersedes it. */
	videoUrl: optional(string()),
});

/**
 * Exactly what a lesson copy takes from a source lesson, and no more: never class
 * work, progress, codes or ballots. Built by `snapshotFromLesson`, turned into a
 * lesson by `lessonFromSnapshot` (classGameSnapshot.ts).
 */
export const ClassGameSnapshotSchema = object({
	questions: array(ClassGameQuestionSchema),
	paragraphs: array(ClassGameParagraphSchema),
	introVideos: array(ClassGameVideoSchema),
	sideNames: optional(object({ a: string(), b: string() })),
	sideClaims: optional(object({ a: string(), b: string() })),
	settings: ClassGameSettingsSchema,
	description: optional(string()),
	defaultLanguage: optional(string()),
	forceLanguage: optional(boolean()),
});
export type ClassGameSnapshot = InferOutput<typeof ClassGameSnapshotSchema>;

/** `classPlans/{planId}/games/{gameId}`. */
export const ClassGameSchema = object({
	gameId: string(),
	planId: string(),
	ownerUid: string(),
	title: string(),
	order: number(),
	snapshot: ClassGameSnapshotSchema,
	/** The lesson this game was snapshotted from (classSnapshotGame / the migration). */
	sourceMainId: optional(string()),
	createdAt: number(),
	lastUpdate: number(),
});
export type ClassGame = InferOutput<typeof ClassGameSchema>;

/** `statementSettings.classLesson` of a lesson. */
export interface ClassLessonLink {
	planId: string;
	gameId: string;
	classId?: string | null;
	className: string;
	/** The name the teacher gave this lesson when starting it; absent on older lessons. */
	lessonName?: string;
}

/** `statementSettings.classHome` of a home. */
export interface ClassHomeLink {
	kind: string;
	classId?: string;
	uid?: string;
}

export function classHomeIdOf(classId: string): string {
	return `${CLASS_HOME_PREFIX}${classId}`;
}

export function teacherHomeIdOf(uid: string): string {
	return `${TEACHER_HOME_PREFIX}${uid}`;
}

/** True when the id is reserved for a home (clients may not create statements with it). */
export function isHomeId(statementId: string): boolean {
	return statementId.startsWith(CLASS_HOME_PREFIX) || statementId.startsWith(TEACHER_HOME_PREFIX);
}

interface SettingsHolder {
	statementSettings?: { classHome?: unknown; classLesson?: unknown; lessonPlan?: unknown } | null;
}

/** A class or teacher home (never a lesson; MainHub refuses it). */
export function isClassHome(statement: SettingsHolder | null | undefined): boolean {
	return !!statement?.statementSettings?.classHome;
}

/**
 * A join-class lesson, wherever it sits in the tree: a statement with a lesson
 * plan that is not a home. Old top-level lessons and lessons under a home both pass.
 */
export function isClassLesson(statement: SettingsHolder | null | undefined): boolean {
	return !!statement?.statementSettings?.lessonPlan && !isClassHome(statement);
}

/** What is stored as a lesson name: one line, trimmed, capped. '' = nothing usable. */
export function cleanLessonName(raw: unknown): string {
	if (typeof raw !== 'string') return '';

	return raw.replace(/\s+/g, ' ').trim().slice(0, LESSON_NAME_MAX_LENGTH).trim();
}

/** What is stored as a class name: one line, trimmed, capped. */
export function cleanClassName(raw: string): string {
	return raw.replace(/\s+/g, ' ').trim().slice(0, CLASS_NAME_MAX_LENGTH);
}
