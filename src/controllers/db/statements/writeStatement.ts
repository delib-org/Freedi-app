import { setDoc, updateDoc } from 'firebase/firestore';
import { AppDispatch } from '@/redux/store';
import {
	getExistingOptionColors,
	getSiblingOptionsByParentId,
	getRandomColor,
} from '@/controllers/utils/colorUtils';
import {
	Statement,
	StatementSchema,
	StatementType,
	Access,
	UserSchema,
	CutoffBy,
	Creator,
	getRandomUID,
} from '@freedi/shared-types';

import { parse } from 'valibot';
import { analyticsService } from '@/services/analytics';
import { logger } from '@/services/logger';
import { incrementOptionsCreated, setHasCreatedGroup } from '@/redux/pwa/pwaSlice';
import { createStatementRef } from '@/utils/firebaseUtils';
import { logError } from '@/utils/errorHandling';
import { resultsSettingsDefault } from './setStatements';
import { createStatement, CreateStatementProps } from './createStatement';

interface SetStatementToDBParams {
	statement: Statement;
	parentStatement: Statement | 'top';
	creator: Creator;
	existingStatements: Statement[];
	dispatch: AppDispatch;
}

export const setStatementToDB = async ({
	statement,
	parentStatement,
	creator,
	existingStatements,
	dispatch,
}: SetStatementToDBParams): Promise<
	| {
			statementId: string;
			statement: Statement;
	  }
	| undefined
> => {
	try {
		if (!statement) throw new Error('Statement is undefined');
		if (!parentStatement) throw new Error('Parent statement is undefined');

		if (!creator) throw new Error('Creator is undefined');

		if (statement.statement.length < 2) {
			throw new Error('Statement is too short');
		}

		const parentId = parentStatement === 'top' ? 'top' : statement.parentId;

		// Create a mutable copy of the statement to avoid read-only property errors
		const mutableStatement = { ...statement };

		mutableStatement.statementType =
			mutableStatement.statementId === undefined
				? StatementType.question
				: mutableStatement.statementType;

		mutableStatement.creator = mutableStatement?.creator || creator;
		mutableStatement.statementId = mutableStatement?.statementId || getRandomUID();
		mutableStatement.parentId = parentId;
		mutableStatement.topParentId =
			parentStatement === 'top'
				? mutableStatement.statementId
				: mutableStatement?.topParentId || parentStatement?.topParentId || 'top';

		// Update statement reference to use the mutable copy
		statement = mutableStatement;

		const siblingOptions = getSiblingOptionsByParentId(parentId, existingStatements);
		const existingColors = getExistingOptionColors(siblingOptions);

		statement.consensus = 0;
		statement.color = statement.color || getRandomColor(existingColors);
		statement.randomSeed = statement.randomSeed ?? Math.random();

		statement.statementType = statement.statementType || StatementType.statement;
		const { results, resultsSettings } = statement;
		if (!results) statement.results = [];
		if (!resultsSettings) statement.resultsSettings = resultsSettingsDefault;

		statement.lastUpdate = new Date().getTime();
		statement.createdAt = statement?.createdAt || new Date().getTime();

		// Always ensure membership is set - default to openToAll if not provided
		if (!statement.membership) {
			statement.membership = { access: Access.openToAll };
		}

		//statement settings
		if (!statement.statementSettings)
			statement.statementSettings = {
				enableAddEvaluationOption: true,
				enableAddVotingOption: true,
			};

		parse(StatementSchema, statement);
		parse(UserSchema, statement.creator);

		//set statement
		const statementRef = createStatementRef(statement.statementId);
		const statementPromises = [];

		//update timestamp
		const statementPromise = await setDoc(statementRef, statement, {
			merge: true,
		});

		statementPromises.push(statementPromise);

		//add subscription
		await Promise.all(statementPromises);

		// Track statement creation
		logger.info('Statement created', {
			statementId: statement.statementId,
			statementType: statement.statementType,
		});

		analyticsService.logEvent('statement_created', {
			statementId: statement.statementId,
			statementType: statement.statementType,
			hasImage: false, // Add image detection if needed
			parentId: statement.parentId,
			topParentId: statement.topParentId,
		});

		// Track PWA install prompt triggers
		if (statement.statementType === StatementType.option) {
			dispatch(incrementOptionsCreated());
		}

		// Track if user created a top-level group
		if (statement.parentId === 'top') {
			dispatch(setHasCreatedGroup(true));
		}

		return { statementId: statement.statementId, statement };
	} catch (error) {
		logger.error('Failed to create statement', error);

		return undefined;
	}
};

export async function saveStatementToDB({
	text,
	paragraphs,
	parentStatement,
	statementType,
	creator,
	existingStatements,
	dispatch,
	enableAddEvaluationOption,
	enableAddVotingOption,
	enhancedEvaluation,
	showEvaluation,
	resultsBy,
	numberOfResults,
	hasChildren,
	defaultLanguage,
	membership,
	stageSelectionType,
}: CreateStatementProps & { dispatch: AppDispatch }): Promise<Statement | undefined> {
	try {
		const statement = createStatement({
			text,
			paragraphs,
			parentStatement,
			statementType,
			creator,
			existingStatements,
			enableAddEvaluationOption,
			enableAddVotingOption,
			enhancedEvaluation,
			showEvaluation,
			resultsBy,
			numberOfResults,
			hasChildren,
			defaultLanguage,
			membership,
			stageSelectionType,
		});

		if (!statement) throw new Error('Statement is undefined');

		await setStatementToDB({
			statement,
			parentStatement,
			creator,
			existingStatements,
			dispatch,
		});

		if (statement.statementType !== StatementType.group) {
			statement.resultsSettings = {
				...statement.resultsSettings,
				resultsBy: resultsBy || statement.resultsSettings.resultsBy,
				numberOfResults: numberOfResults || statement.resultsSettings.numberOfResults,
				cutoffBy: statement.resultsSettings.cutoffBy || CutoffBy.topOptions,
			};
		}

		return statement;
	} catch (error) {
		logError(error, { operation: 'statements.writeStatement.saveStatementToDB' });

		return undefined;
	}
}

export async function updateStatementParents(statement: Statement, parentStatement: Statement) {
	try {
		if (!statement) throw new Error('Statement is undefined');
		if (!parentStatement) throw new Error('Parent statement is undefined');

		const statementRef = createStatementRef(statement.statementId);

		const newStatement = {
			parentId: parentStatement.statementId,
			parents: [parentStatement.parents, parentStatement.statementId].flat(1),
			topParentId: parentStatement.topParentId,
		};

		await updateDoc(statementRef, newStatement);
	} catch (error) {
		logError(error, { operation: 'statements.writeStatement.updateStatementParents' });
	}
}
