/**
 * Tables (table assignment) service: split an event crowd into topic tables.
 *
 * Callables (region me-west1), contracts in @freedi/shared-types
 * (models/tableAssignment). The seating itself is `@freedi/table-assignment`;
 * nothing of it is re-implemented here. functions/src/index.ts re-exports
 * everything with `export * from './tableAssignment'`.
 */
export { tablesCreateSession } from './fn_tablesCreateSession';
export { tablesSaveTopics } from './fn_tablesSaveTopics';
export { tablesSaveSettings } from './fn_tablesSaveSettings';
export { tablesSetStatus } from './fn_tablesSetStatus';
export { tablesRegister } from './fn_tablesRegister';
export { tablesSavePreferences } from './fn_tablesSavePreferences';
export { tablesJoinTable } from './fn_tablesJoinTable';
export { tablesComputePreview } from './fn_tablesComputePreview';
export { tablesPublishRun } from './fn_tablesPublishRun';
export { tablesCancelRegistration } from './fn_tablesCancelRegistration';
export { tablesRemoveParticipant } from './fn_tablesRemoveParticipant';
export { tablesFixDetails } from './fn_tablesFixDetails';
