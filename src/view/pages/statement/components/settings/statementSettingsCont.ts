// Helpers
import { NavigateFunction } from 'react-router';
import {
	defaultResultsSettings,
	defaultStatementSettings,
} from './emptyStatementModel';
import { getEvaluations } from '@/controllers/db/evaluation/getEvaluation';
import {
	createStatement,
	setStatementToDB,
	updateStatement,
} from '@/controllers/db/statements/setStatements';
import { getVoters } from '@/controllers/db/vote/getVotes';
import { StatementType } from '@/types/TypeEnums';
import { Evaluation } from '@/types/evaluation/Evaluation';
import { Statement } from '@/types/statement/Statement';
import { Vote } from '@/types/vote';
import { Dispatch, SetStateAction } from 'react';
import { StatementSettings } from '@/types/statement/StatementSettings';

// Get users that voted on options in this statement
export async function handleGetVoters(
	parentId: string | undefined,
	setVoters: Dispatch<SetStateAction<Vote[]>>,
	setClicked: Dispatch<SetStateAction<boolean>>
) {
	if (!parentId) return;
	const voters = await getVoters(parentId);
	setVoters(voters);
	setClicked(true);
}

//Get users that did not vote on options in this statement
export async function handleGetNonVoters(
	parentId: string | undefined,
	setNonVoters: Dispatch<SetStateAction<Vote[]>>,
	setClicked: Dispatch<SetStateAction<boolean>>
) {
	if (!parentId) return;

	try {
		const voters = await getVoters(parentId);

		// Filter out users who haven't voted (those with no voter information)
		const nonVoters = voters.filter((voter) => !voter.voter);

		setNonVoters(nonVoters);

		setClicked(true);
	} catch (error) {
		console.error('Error fetching non-voters:', error);
	}
}

// Get users that evaluated on options in this statement
export async function handleGetEvaluators(
	parentId: string | undefined,
	setEvaluators: Dispatch<SetStateAction<Evaluation[]>>,
	setClicked: Dispatch<SetStateAction<boolean>>
) {
	if (!parentId) return;
	const evaluators = await getEvaluations(parentId);
	setEvaluators(evaluators);
	setClicked(true);
}

interface SetNewStatementParams {
	navigate: NavigateFunction;
	statementId: string | undefined;
	statement: Statement;
	parentStatement?: Statement | 'top';
	statementType?: StatementType;
}

export async function setNewStatement({
	statementId,
	statement,
	parentStatement = 'top',
	statementType = StatementType.group,
}: SetNewStatementParams): Promise<Statement | undefined> {
	try {
		// If statement title is empty, don't save
		if (!statement.statement) return;

		const {
			hasChildren,
			resultsBy,
			numberOfResults,
			enableAddEvaluationOption,
			enableAddVotingOption,
			enhancedEvaluation,
			showEvaluation,
			membership,
		} = getSetStatementData(statement);

		// If no statementId, user is on AddStatement page
		if (!statementId) {
			const newStatement = createStatement({
				text: statement.statement,
				description: statement.description,
				statementType,
				parentStatement: 'top',
				resultsBy,
				numberOfResults,
				hasChildren,
				enableAddEvaluationOption,
				enableAddVotingOption,
				enhancedEvaluation,
				showEvaluation,
				membership,
			});

			if (!newStatement)
				throw new Error('newStatement had error in creating');

			await setStatementToDB({
				parentStatement: 'top',
				statement: newStatement,
			});

			return newStatement;
		}

		// If statementId, user is on Settings tab in statement page
		else {
			// update statement
			if (!statement) throw new Error('statement is undefined');

			const newStatement = updateStatement({
				statement,
				text: statement.statement,
				description: statement.description ?? '',
				resultsBy,
				numberOfResults,
				hasChildren,
				enableAddEvaluationOption,
				enableAddVotingOption,
				enhancedEvaluation,
				showEvaluation,
				membership,
			});
			if (!newStatement)
				throw new Error('newStatement had not been updated');

			await setStatementToDB({
				parentStatement,
				statement: newStatement,
			});

			return newStatement;
		}
	} catch (error) {
		console.error(error);

		return undefined;
	}
}

export const getStatementSettings = (statement: Statement) => {
	const statementSettings: StatementSettings =
		statement.statementSettings ?? defaultStatementSettings;

	return {
		enableAddEvaluationOption: Boolean(
			statementSettings.enableAddEvaluationOption
		),
		enableAddVotingOption: Boolean(statementSettings.enableAddVotingOption),
		enhancedEvaluation: Boolean(statementSettings.enhancedEvaluation),
		showEvaluation: Boolean(statementSettings.showEvaluation),
		subScreens: statementSettings.subScreens ?? [],
		inVotingGetOnlyResults: Boolean(
			statementSettings.inVotingGetOnlyResults
		),
		enableSimilaritiesSearch: Boolean(
			statementSettings.enableSimilaritiesSearch
		),
		enableNavigationalElements: Boolean(
			statementSettings.enableNavigationalElements
		),
		hasChat: Boolean(statementSettings.hasChat),
		hasChildren: Boolean(statementSettings.hasChildren),
	};
};

const getSetStatementData = (statement: Statement) => {
	const { resultsBy, numberOfResults } =
		statement.resultsSettings ?? defaultResultsSettings;
	const {
		enableAddEvaluationOption,
		enableAddVotingOption,
		enhancedEvaluation,
		showEvaluation,
	} = getStatementSettings(statement);

	return {
		hasChildren: Boolean(statement.hasChildren),

		resultsBy,
		numberOfResults,
		enableAddEvaluationOption,
		enableAddVotingOption,
		enhancedEvaluation,
		showEvaluation,
		membership: statement.membership,
	};
};

interface ToggleSubScreenParams {
	subScreens: Screen[];
	screenLink: Screen;
	statement: Statement;
}

export const toggleSubScreen = ({
	statement,
}: ToggleSubScreenParams): Statement => {
	return {
		...statement,
	};
};

interface CreateStatementFromModalParams {
	title: string;
	description: string;
	isOptionSelected: boolean;
	parentStatement: Statement | 'top';
	isSendToStoreTemp?: boolean;
	statementType?: StatementType;
}

export async function createStatementFromModal({
	title,
	description,
	parentStatement,
	statementType,
}: CreateStatementFromModalParams) {
	try {
		if (!title) throw new Error('title is undefined');
		if (!parentStatement) throw new Error('Parent statement is missing');
		const newStatement = createStatement({
			...defaultStatementSettings,
			hasChildren: true,
			text: title,
			description,
			parentStatement,
			statementType: statementType || StatementType.group,
		});

		if (!newStatement) throw new Error('newStatement was not created');

		await setStatementToDB({
			statement: newStatement,
			parentStatement:
				parentStatement === 'top' ? 'top' : parentStatement,
		});

		await setStatementToDB({
			statement: newStatement,
			parentStatement:
				parentStatement === 'top' ? 'top' : parentStatement,
		});
	} catch (error) {
		console.error(error);
	}
}
