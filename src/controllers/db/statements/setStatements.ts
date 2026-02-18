import { getDoc, setDoc, updateDoc, writeBatch, runTransaction } from 'firebase/firestore';
import { FireStore } from '../config';
import { store } from '@/redux/store';
import { getDefaultQuestionType } from '@/model/questionTypeDefaults';
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
	QuestionType,
	UserSchema,
	Membership,
	ResultsBy,
	StageSelectionType,
	getRandomUID,
	EvaluationUI,
	Creator,
	CutoffBy,
	ResultsSettings,
	Paragraph,
} from '@freedi/shared-types';

import { number, parse, string } from 'valibot';
import { isStatementTypeAllowedAsChildren } from '@/controllers/general/helpers';
import { LanguagesEnum } from '@/context/UserConfigContext';
import { analyticsService } from '@/services/analytics';
import { logger } from '@/services/logger';
import { incrementOptionsCreated, setHasCreatedGroup } from '@/redux/pwa/pwaSlice';
import { createStatementRef, getCurrentTimestamp, createTimestamps } from '@/utils/firebaseUtils';

export const resultsSettingsDefault: ResultsSettings = {
	resultsBy: ResultsBy.consensus,
	numberOfResults: 1,
	cutoffBy: CutoffBy.topOptions,
};

export const updateStatementParents = async (statement: Statement, parentStatement: Statement) => {
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
		console.error(error);
	}
};

export async function saveStatementToDB({
	text,
	paragraphs,
	parentStatement,
	statementType,
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
}: CreateStatementProps): Promise<Statement | undefined> {
	try {
		const statement = createStatement({
			text,
			paragraphs,
			parentStatement,
			statementType,
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
		console.error(error);

		return undefined;
	}
}

interface SetStatementToDBParams {
	statement: Statement;
	parentStatement: Statement | 'top';
}

export const setStatementToDB = async ({
	statement,
	parentStatement,
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

		const storeState = store.getState();
		const creator: Creator = storeState.creator?.creator;
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

		const siblingOptions = getSiblingOptionsByParentId(parentId, storeState.statements.statements);
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
			store.dispatch(incrementOptionsCreated());
		}

		// Track if user created a top-level group
		if (statement.parentId === 'top') {
			store.dispatch(setHasCreatedGroup(true));
		}

		return { statementId: statement.statementId, statement };
	} catch (error) {
		logger.error('Failed to create statement', error);

		return undefined;
	}
};

export interface CreateStatementProps {
	text: string;
	paragraphs?: Paragraph[];
	parentStatement: Statement | 'top';
	statementType: StatementType;
	questionType?: QuestionType;
	enableAddEvaluationOption?: boolean;
	enableAddVotingOption?: boolean;
	enableNavigationalElements?: boolean;
	enhancedEvaluation?: boolean;
	showEvaluation?: boolean;
	resultsBy?: ResultsBy;
	numberOfResults?: number;
	hasChildren?: boolean;
	defaultLanguage?: string;
	membership?: Membership;
	stageSelectionType?: StageSelectionType;
}

export function createStatement({
	text,
	paragraphs,
	parentStatement,
	statementType,
	questionType,
	enableAddEvaluationOption = true,
	enableNavigationalElements,
	enableAddVotingOption = true,
	enhancedEvaluation = true,
	showEvaluation = true,
	resultsBy = ResultsBy.consensus,
	numberOfResults = 1,
	hasChildren,
	defaultLanguage,
	membership,
	stageSelectionType,
}: CreateStatementProps): Statement | undefined {
	try {
		if (questionType === QuestionType.massConsensus) {
			hasChildren = false;
			defaultLanguage = defaultLanguage ?? LanguagesEnum.he;
		}
		const storeState = store.getState();
		const creator = storeState.creator?.creator;
		if (!isStatementTypeAllowedAsChildren(parentStatement, statementType)) {
			return;
		}
		if (!creator) throw new Error('Creator is undefined');
		if (!statementType) throw new Error('Statement type is undefined');
		if (!text || text.trim() === '') return undefined;
		const statementId = getRandomUID();

		//get default values for simple or advanced users
		enableNavigationalElements = defaultValue(enableNavigationalElements, creator?.advanceUser);
		hasChildren = defaultValue(hasChildren, creator?.advanceUser);

		const parentId = parentStatement !== 'top' ? parentStatement?.statementId : 'top';
		const parentsSet: Set<string> =
			parentStatement !== 'top' ? new Set(parentStatement?.parents) : new Set();
		parentsSet.add(parentId);
		const parents: string[] = [...parentsSet];

		const topParentId = parentStatement !== 'top' ? parentStatement?.topParentId : statementId;

		const siblingOptions = getSiblingOptionsByParentId(parentId, storeState.statements.statements);
		const existingColors = getExistingOptionColors(siblingOptions);

		const newStatement: Statement = {
			statement: text,
			paragraphs: paragraphs ?? [],
			statementType,
			statementId,
			parentId,
			parents,
			topParentId,
			creator,
			...(defaultLanguage && { defaultLanguage: defaultLanguage }),
			creatorId: creator.uid,
			// Always set membership - either provided, or default to openToAll
			membership: membership || { access: Access.openToAll },
			statementSettings: {
				enhancedEvaluation,
				hasChat: true,
				showEvaluation,
				enableAddEvaluationOption,
				enableAddVotingOption,
				hasChildren,
				enableNavigationalElements,
			},
			...createTimestamps(),
			color: getRandomColor(existingColors),
			resultsSettings: {
				resultsBy: resultsBy || ResultsBy.consensus,
				numberOfResults: Number(numberOfResults) || 1,
				cutoffNumber: 0,
				cutoffBy: CutoffBy.topOptions,
			},
			questionSettings: {
				...(questionType && { questionType }),
			},
			hasChildren,
			consensus: 0,
			evaluation: {
				numberOfEvaluators: 0,
				sumEvaluations: 0,
				agreement: 0,
				averageEvaluation: 0,
				evaluationRandomNumber: Math.random(),
				viewed: 0,
			},
			randomSeed: Math.random(),
			results: [],
		};

		if (newStatement.statementType === StatementType.question) {
			newStatement.questionSettings = {
				questionType: questionType ?? getDefaultQuestionType(),
			};

			newStatement.evaluationSettings = {
				evaluationUI: getEvaluationUI(stageSelectionType),
			};
		}

		function getEvaluationUI(stageSelectionType?: StageSelectionType): EvaluationUI {
			switch (stageSelectionType) {
				case StageSelectionType.consensus:
					return EvaluationUI.suggestions;
				case StageSelectionType.voting:
					return EvaluationUI.voting;
				case StageSelectionType.checkbox:
					return EvaluationUI.checkbox;
				default:
					return EvaluationUI.suggestions;
			}
		}

		parse(StatementSchema, newStatement);

		return newStatement;

		function defaultValue(value: boolean | undefined, isAdvanceUser: boolean | undefined): boolean {
			if (value !== undefined) return value;

			return isAdvanceUser ? true : false;
		}
	} catch (error) {
		console.error(error);

		return undefined;
	}
}

interface UpdateStatementProps {
	text: string;
	paragraphs?: Paragraph[];
	statement: Statement;
	statementType?: StatementType;
	enableAddEvaluationOption?: boolean;
	enableAddVotingOption?: boolean;
	enhancedEvaluation?: boolean;
	showEvaluation?: boolean;
	resultsBy?: ResultsBy;
	numberOfResults?: number;
	hasChildren?: boolean;
	membership?: Membership;
}
export function updateStatement({
	text,
	paragraphs,
	statement,
	statementType,
	enableAddEvaluationOption,
	enableAddVotingOption,
	enhancedEvaluation,
	showEvaluation,
	resultsBy,
	numberOfResults,
	hasChildren,
	membership,
}: UpdateStatementProps): Statement | undefined {
	try {
		const newStatement: Statement = JSON.parse(JSON.stringify(statement));

		if (text) newStatement.statement = text;
		if (paragraphs) newStatement.paragraphs = paragraphs;

		newStatement.lastUpdate = getCurrentTimestamp();

		if (resultsBy && newStatement.resultsSettings)
			newStatement.resultsSettings.resultsBy = resultsBy;
		else if (resultsBy && !newStatement.resultsSettings) {
			newStatement.resultsSettings = resultsSettingsDefault;
		}
		if (numberOfResults && newStatement.resultsSettings)
			newStatement.resultsSettings.numberOfResults = Number(numberOfResults);
		else if (numberOfResults && !newStatement.resultsSettings) {
			newStatement.resultsSettings = resultsSettingsDefault;
		}

		newStatement.statementSettings = updateStatementSettings({
			statement,
			enableAddEvaluationOption,
			enableAddVotingOption,
			enhancedEvaluation,
			showEvaluation,
		});

		newStatement.hasChildren = hasChildren;
		// Only update membership if explicitly provided
		// Otherwise keep the existing membership (which might be undefined for inheritance)
		if (membership !== undefined) {
			newStatement.membership = membership;
		}

		if (statementType) newStatement.statementType = statementType;

		return parse(StatementSchema, newStatement);
	} catch (error) {
		console.error(error);

		return undefined;
	}
}

interface UpdateStatementSettingsReturnType {
	enableAddEvaluationOption?: boolean;
	enableAddVotingOption?: boolean;
	enhancedEvaluation?: boolean;
	showEvaluation?: boolean;
}

interface UpdateStatementSettingsParams {
	statement: Statement;
	enableAddEvaluationOption: boolean;
	enableAddVotingOption: boolean;
	enhancedEvaluation: boolean;
	showEvaluation: boolean;
}

function updateStatementSettings({
	statement,
	enableAddEvaluationOption,
	enableAddVotingOption,
	enhancedEvaluation,
	showEvaluation,
}: UpdateStatementSettingsParams): UpdateStatementSettingsReturnType {
	const defaultSettings = {
		showEvaluation: true,
		enableAddEvaluationOption: true,
		enableAddVotingOption: true,
	};

	if (!statement) {
		return defaultSettings;
	}

	return {
		...(statement.statementSettings || defaultSettings),
		enhancedEvaluation,
		showEvaluation,
		enableAddEvaluationOption,
		enableAddVotingOption,
	};
}

export async function updateStatementText(
	statement: Statement | undefined,
	title?: string,
	paragraphs?: Paragraph[],
) {
	try {
		if (!statement) throw new Error('Statement is undefined');

		const updates: Partial<Statement> = {};
		if (title !== undefined && statement.statement !== title) {
			updates.statement = title;
		}
		if (paragraphs !== undefined) {
			updates.paragraphs = paragraphs;
		}

		// If statement lacks topParentId, derive it from parent
		if (!statement.topParentId && statement.parentId) {
			const parentRef = createStatementRef(statement.parentId);
			const parentDoc = await getDoc(parentRef);
			if (parentDoc.exists()) {
				const parentData = parentDoc.data() as Statement;
				updates.topParentId = parentData.topParentId || parentData.statementId;
			}
		}

		if (Object.keys(updates).length === 0) {
			return;
		}

		updates.lastUpdate = getCurrentTimestamp();

		const statementRef = createStatementRef(statement.statementId);

		await updateDoc(statementRef, updates);
	} catch (error) {
		console.error(error);
	}
}

/**
 * Update statement paragraphs array for rich text editing
 * @param statement - The statement to update
 * @param paragraphs - Array of paragraphs to save
 */
export async function updateStatementParagraphs(
	statement: Statement | undefined,
	paragraphs: Paragraph[],
): Promise<void> {
	try {
		if (!statement) throw new Error('Statement is undefined');
		if (!paragraphs) throw new Error('Paragraphs array is undefined');

		const updates: Partial<Statement> = {
			paragraphs,
			lastUpdate: getCurrentTimestamp(),
		};

		const statementRef = createStatementRef(statement.statementId);

		await updateDoc(statementRef, updates);
	} catch (error) {
		console.error('Error updating statement paragraphs:', error);
		throw error;
	}
}

export async function setStatementIsOption(statement: Statement | undefined) {
	try {
		if (!statement) throw new Error('Statement is undefined');

		const statementRef = createStatementRef(statement.statementId);

		await runTransaction(FireStore, async (transaction) => {
			const statementDB = await transaction.get(statementRef);

			if (!statementDB.exists()) throw new Error('Statement not found');

			const statementDBData = parse(StatementSchema, statementDB.data());

			const newType =
				statementDBData.statementType === StatementType.option
					? StatementType.statement
					: StatementType.option;

			transaction.update(statementRef, { statementType: newType });
		});
	} catch (error) {
		console.error(error);
	}
}

export async function setStatementGroupToDB(statement: Statement) {
	try {
		const statementId = statement.statementId;
		const statementRef = createStatementRef(statementId);
		await setDoc(statementRef, { statementType: StatementType.statement }, { merge: true });
	} catch (error) {
		console.error(error);
	}
}

export function setRoomSizeInStatementDB(statement: Statement, roomSize: number) {
	try {
		parse(number(), roomSize);
		parse(StatementSchema, statement);
		const statementRef = createStatementRef(statement.statementId);
		const newRoomSize = { roomSize };
		updateDoc(statementRef, newRoomSize);
	} catch (error) {
		console.error(error);
	}
}

export async function updateIsQuestion(statement: Statement) {
	try {
		const statementRef = createStatementRef(statement.statementId);

		let { statementType } = statement;
		if (statementType === StatementType.question) {
			statementType = StatementType.statement;
		} else {
			statementType = StatementType.question;
			statement.questionSettings = {
				...statement.questionSettings,
				questionType: QuestionType.simple,
			};
			statement.evaluationSettings = {
				...statement.evaluationSettings,
				evaluationUI: EvaluationUI.suggestions,
			};
		}

		const newStatementType = { statementType };
		await updateDoc(statementRef, newStatementType);
	} catch (error) {
		console.error(error);
	}
}

export async function updateStatementMainImage(statement: Statement, imageURL: string | undefined) {
	try {
		if (!imageURL) throw new Error('Image URL is undefined');
		const statementRef = createStatementRef(statement.statementId);

		// Use nested field update to preserve other imagesURL fields like displayMode
		await updateDoc(statementRef, {
			'imagesURL.main': imageURL,
		});
	} catch (error) {
		console.error(error);
	}
}

export async function updateStatementImageDisplayMode(
	statement: Statement,
	displayMode: 'above' | 'inline',
) {
	try {
		const statementRef = createStatementRef(statement.statementId);

		await updateDoc(statementRef, {
			'imagesURL.displayMode': displayMode,
		});
	} catch (error) {
		console.error(error);
	}
}

export async function setFollowMeDB(
	topParentStatement: Statement,
	path: string | undefined,
): Promise<void> {
	try {
		parse(string(), path);
		parse(StatementSchema, topParentStatement);

		const topParentStatementRef = createStatementRef(topParentStatement.statementId);

		if (path) {
			await updateDoc(topParentStatementRef, { followMe: path });
		} else {
			await updateDoc(topParentStatementRef, { followMe: '' });
		}
	} catch (error) {
		console.error(error);
	}
}

export async function setPowerFollowMeDB(
	topParentStatement: Statement,
	path: string | undefined,
): Promise<void> {
	try {
		parse(string(), path);
		parse(StatementSchema, topParentStatement);

		const topParentStatementRef = createStatementRef(topParentStatement.statementId);

		if (path) {
			await updateDoc(topParentStatementRef, { powerFollowMe: path });
		} else {
			await updateDoc(topParentStatementRef, { powerFollowMe: '' });
		}
	} catch (error) {
		logger.error('Failed to set power follow me', error);
	}
}

export async function updateStatementsOrderToDB(statements: Statement[]) {
	try {
		const batch = writeBatch(FireStore);

		for (const statement of statements) {
			parse(StatementSchema, statement);

			const statementRef = createStatementRef(statement.statementId);

			batch.update(statementRef, { order: statement.order });
		}

		await batch.commit();
	} catch (error) {
		console.error(error);
	}
}

export async function toggleStatementHide(statementId: string): Promise<boolean | undefined> {
	try {
		if (!statementId) throw new Error('Statement ID is undefined');

		const statementRef = createStatementRef(statementId);

		const hide = await runTransaction(FireStore, async (transaction) => {
			const statementDB = await transaction.get(statementRef);

			if (!statementDB.exists()) throw new Error('Statement not found');
			const statementDBData = statementDB.data() as Statement;

			const newHide = !(statementDBData.hide === true);
			transaction.update(statementRef, { hide: newHide });

			return newHide;
		});

		return hide;
	} catch (error) {
		console.error(error);

		return undefined;
	}
}

export async function toggleStatementAnchored(
	statementId: string,
	anchored: boolean,
	parentId: string,
): Promise<void> {
	try {
		if (!statementId) throw new Error('Statement ID is undefined');
		if (!parentId) throw new Error('Parent ID is undefined');

		// Check if user is admin
		const role = store
			.getState()
			.statements.statementSubscription.find((sub) => sub.statementId === parentId)?.role;

		if (role !== 'admin') {
			throw new Error('Only admins can anchor statements');
		}

		// Get parent statement to check settings
		const parentRef = createStatementRef(parentId);
		const parentDoc = await getDoc(parentRef);

		if (!parentDoc.exists()) {
			throw new Error('Parent statement not found');
		}

		// No limit on how many statements can be anchored
		// The numberOfAnchoredStatements setting only determines how many
		// anchored options are randomly selected for each evaluation

		// Update the statement
		const statementRef = createStatementRef(statementId);
		await updateDoc(statementRef, { anchored });

		// Log analytics event
		logger.info('Statement Anchored', {
			statementId,
			anchored,
			parentId,
		});
	} catch (error) {
		console.error('Error toggling anchored status:', error);
		throw error;
	}
}
