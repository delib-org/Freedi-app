import { resultsSettingsDefault } from '@/controllers/db/statements/setStatements';
import { Statement, Screen, StatementType, Access } from 'delib-npm';

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
	creatorId: '',
	statementType: StatementType.statement,
	lastUpdate: 0,
	createdAt: 0,
	consensus: 0,
	// default values
	resultsSettings: resultsSettingsDefault,
	statementSettings: defaultStatementSettings,
	hasChildren: true,
	membership: {
		access: Access.openToAll
	}
} as const;
