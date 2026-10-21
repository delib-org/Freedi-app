/**
 * join-class (hybrid classroom lesson) engine — owned by lane C1.
 *
 * Callables (region me-west1, App Check), contracts in
 * @freedi/shared-types (models/classroom/classroomCallables.ts):
 *   classAssignTables, classMoveStudent, classAddNoDevice, classTableStep,
 *   classAllTablesTo, classFreezeBallot, classCloseBallot
 *
 * C1 adds each function in its own file here and exports it from this
 * index; functions/src/index.ts already re-exports everything with
 * `export * from './classroom'`, so nothing outside this folder needs to change.
 */
export {};
