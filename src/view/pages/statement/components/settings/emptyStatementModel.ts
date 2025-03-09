import { Statement, ResultsBy, Screen, StatementType } from 'delib-npm';

export const defaultStatementSettings = {
	enhancedEvaluation: true,
	showEvaluation: true,
	enableAddVotingOption: true,
	enableAddEvaluationOption: true,
	subScreens: undefined,
	inVotingGetOnlyResults: false,
	enableSimilaritiesSearch: false,
	enableNavigationalElements: false,
} as const;

export const defaultResultsSettings = {
	resultsBy: ResultsBy.topOptions,
	numberOfResults: 1,
} as const;

export const defaultStatementSubScreens: Screen[] = [
	Screen.CHAT,
	Screen.OPTIONS,
	Screen.VOTE,
];

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
	statementType: StatementType.statement,
	lastUpdate: 0,
	createdAt: 0,
	consensus: 0,
	// default values
	resultsSettings: defaultResultsSettings,
	statementSettings: defaultStatementSettings,
	hasChildren: true,
} as const;
