import { resultsSettingsDefault } from '@/controllers/db/statements/setStatements';
import { Statement, StatementType, evaluationType } from 'delib-npm';

export const defaultStatementSettings = {
	hasChat: true,
	enhancedEvaluation: true, // Keep for backward compatibility
	evaluationType: evaluationType.range, // Default to range (5-point scale)
	showEvaluation: true,
	enableAddVotingOption: true,
	enableAddEvaluationOption: true,
	subScreens: undefined,
	inVotingGetOnlyResults: false,
	enableSimilaritiesSearch: false,
	enableNavigationalElements: false,
} as const;

export const defaultEmptyStatement: Statement = {
	topParentId: '',
	statement: '',
	statementId: '',
	parentId: '',
	creator: {
		displayName: '',
		uid: '',
		photoURL: undefined,
	},
	creatorId: '',
	statementType: StatementType.statement,
	lastUpdate: 0,
	createdAt: 0,
	consensus: 0,
	// default values
	resultsSettings: resultsSettingsDefault,
	statementSettings: defaultStatementSettings,
	hasChildren: true,
	// Note: membership is intentionally NOT set here
	// so that new sub-statements inherit from their parent by default
	// Only top-level statements should have membership set
} as const;
