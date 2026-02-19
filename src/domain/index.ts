// Domain layer barrel exports
// Pure TypeScript business logic with ZERO React, Firebase, or Redux dependencies.

// Statement domain
export {
	TYPE_RESTRICTIONS,
	canAddChild,
	isChildTypeAllowed,
	getEvaluationUIForStage,
	buildStatement,
} from './statement';
export type {
	TypeRestriction,
	TypeHierarchyResult,
	BuildStatementInput,
	BuildStatementResult,
	BuildStatementError,
} from './statement';

// Evaluation domain
export {
	FLOOR_STD_DEV,
	calcStandardError,
	calcAgreement,
	calcSquaredDiff,
	calculateSimpleConsensus,
	calculateAgreementScore,
	calculateAverageEvaluation,
} from './evaluation';

// Vote domain
export {
	canVoteOnStatement,
	isVotingEnabledForParent,
	isVoteToggle,
	validateVoteTarget,
} from './vote';
