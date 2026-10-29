/**
 * Rollout switches of the join-class lesson-plan work (Trello mqqqRWqT).
 *
 * CLONE_UNDER_HOME: where `classCloneLesson` (old clients' "new lesson with the
 * same questions") puts the copy.
 * - false (now): a TOP-LEVEL lesson, exactly as before. Old cached PWA clients
 *   query a lesson's options, replies and summary by `topParentId == lesson`; a
 *   copy under a home would have the home as topParentId, mixing every lesson of
 *   that teacher, and the old teacher list (parentId 'top') would hide it.
 * - true (a later deploy, once no old client is left): under the caller's teacher
 *   home `jcTeacher_{uid}`, like every lesson classStartLesson makes.
 * Top-level copies made meanwhile are moved by the migration
 * (scripts/moveClassLessonsHome.ts) like any other old lesson.
 */
export const CLONE_UNDER_HOME = false;
