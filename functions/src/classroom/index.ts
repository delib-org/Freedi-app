/**
 * join-class (hybrid classroom lesson) engine — lane C1.
 *
 * Callables (region me-west1, signed-in only), contracts in
 * @freedi/shared-types (models/classroom/classroomCallables.ts).
 * functions/src/index.ts re-exports everything here with
 * `export * from './classroom'`.
 *
 * The auto +1 on options written at a table is not a separate trigger: it
 * runs inside the consolidated `onStatementCreated` (see autoEvaluations.ts).
 */
export { classAssignTables } from './fn_classAssignTables';
export { classMoveStudent } from './fn_classMoveStudent';
export { classAddNoDevice } from './fn_classAddNoDevice';
export { classTableStep } from './fn_classTableStep';
export { classAllTablesTo } from './fn_classAllTablesTo';
export { classFreezeBallot, classCloseBallot, classPauseBallot } from './fn_classBallot';
export { classSetLessonStatus } from './fn_classSetLessonStatus';
export { classCloneLesson } from './fn_classCloneLesson';
