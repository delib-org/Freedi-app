/**
 * Evaluation module barrel file.
 *
 * Re-exports all cloud function trigger handlers and the migration
 * utility so consumers can import from './evaluation' or './evaluation/index'.
 */

// Cloud function trigger handlers
export { newEvaluation } from './onCreateEvaluation';
export { updateEvaluation } from './onUpdateEvaluation';
export { deleteEvaluation } from './onDeleteEvaluation';

// Chosen options trigger handler (used for choseBy collection)
export { updateChosenOptions } from './updateChosenOptions';

// Migration utility (used by fn_integrateSimilarStatements)
export { migrateEvaluationsToNewStatement } from './evaluationMigration';

// Re-export types and helpers that may be needed externally
export { ActionTypes } from './evaluationTypes';
export type { UpdateStatementEvaluationProps, CalcDiff } from './evaluationTypes';
export type { MigrationResult } from './evaluationMigration';
export { calcAgreement, FLOOR_STD_DEV } from './agreementCalculation';
