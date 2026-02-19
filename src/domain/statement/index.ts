// Statement domain - business rules and factory
export {
	TYPE_RESTRICTIONS,
	canAddChild,
	isChildTypeAllowed,
	getEvaluationUIForStage,
} from './StatementRules';
export type { TypeRestriction, TypeHierarchyResult } from './StatementRules';

export { buildStatement } from './StatementFactory';
export type {
	BuildStatementInput,
	BuildStatementResult,
	BuildStatementError,
} from './StatementFactory';
