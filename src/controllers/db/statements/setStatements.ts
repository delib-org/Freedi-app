import {
	Timestamp,
	doc,
	getDoc,
	setDoc,
	updateDoc,
	writeBatch,
} from 'firebase/firestore';
import { FireStore } from '../config';
import { store } from '@/redux/store';
import {
	getExistingOptionColors,
	getSiblingOptionsByParentId,
} from '@/view/pages/statement/components/vote/statementVoteCont';
import { getRandomColor } from '@/view/pages/statement/components/vote/votingColors';
import {
	Statement,
	StatementSchema,
	Collections,
	StatementType,
	Access,
	QuestionType,
	UserSchema,
	Membership,
	ResultsBy,
	StageSelectionType,
	getRandomUID,
	EvaluationUI,
	ChoseByEvaluationType,
	CutoffType,
	Creator
} from 'delib-npm';

import { number, parse, string } from 'valibot';
import { setChoseByToDB } from '../choseBy/setChoseBy';

export const updateStatementParents = async (
	statement: Statement,
	parentStatement: Statement
) => {
	try {
		if (!statement) throw new Error('Statement is undefined');
		if (!parentStatement) throw new Error('Parent statement is undefined');

		const statementRef = doc(
			FireStore,
			Collections.statements,
			statement.statementId
		);

		const newStatement = {
			parentId: parentStatement.statementId,
			parents: [
				parentStatement.parents,
				parentStatement.statementId,
			].flat(1),
			topParentId: parentStatement.topParentId,
		};

		await updateDoc(statementRef, newStatement);
	} catch (error) {
		console.error(error);
	}
};

export async function saveStatementToDB({
	text,
	description,
	parentStatement,
	statementType,
	enableAddEvaluationOption,
	enableAddVotingOption,
	enhancedEvaluation,
	showEvaluation,
	resultsBy,
	numberOfResults,
	hasChildren,
	membership,
	stageSelectionType,
}: CreateStatementProps): Promise<Statement | undefined> {
	try {
		const statement = createStatement({
			text,
			description,
			parentStatement,
			statementType,
			enableAddEvaluationOption,
			enableAddVotingOption,
			enhancedEvaluation,
			showEvaluation,
			resultsBy,
			numberOfResults,
			hasChildren,
			membership,
			stageSelectionType,
		});

		if (!statement) throw new Error('Statement is undefined');

		setStatementToDB({
			statement,
			parentStatement,
		});

		if (statement.statementType !== StatementType.group) {
			setChoseByToDB({
				statementId: statement.statementId,
				cutoffType: CutoffType.topOptions,
				choseByEvaluationType: ChoseByEvaluationType.consensus,
				number: 1,
			});
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

		statement.statementType =
			statement.statementId === undefined
				? StatementType.question
				: statement.statementType;

		statement.creator = statement?.creator || creator;
		statement.statementId = statement?.statementId || getRandomUID();
		statement.parentId = parentId;
		statement.topParentId =
			parentStatement === 'top'
				? statement.statementId
				: statement?.topParentId ||
				parentStatement?.topParentId ||
				'top';

		const siblingOptions = getSiblingOptionsByParentId(
			parentId,
			storeState.statements.statements
		);
		const existingColors = getExistingOptionColors(siblingOptions);

		statement.consensus = 0;
		statement.color = statement.color || getRandomColor(existingColors);

		statement.statementType =
			statement.statementType || StatementType.statement;
		const { results, resultsSettings } = statement;
		if (!results) statement.results = [];
		if (!resultsSettings)
			statement.resultsSettings = { resultsBy: ResultsBy.topOptions };

		statement.lastUpdate = new Date().getTime();
		statement.createdAt = statement?.createdAt || new Date().getTime();

		statement.membership = statement.membership || { access: Access.open };

		//statement settings
		if (!statement.statementSettings)
			statement.statementSettings = {
				enableAddEvaluationOption: true,
				enableAddVotingOption: true,
			};

		parse(StatementSchema, statement);
		parse(UserSchema, statement.creator);

		//set statement
		const statementRef = doc(
			FireStore,
			Collections.statements,
			statement.statementId
		);
		const statementPromises = [];

		//update timestamp
		const statementPromise = await setDoc(statementRef, statement, {
			merge: true,
		});

		statementPromises.push(statementPromise);

		//add subscription
		await Promise.all(statementPromises);

		if (statement.statementType !== StatementType.group) {
			setChoseByToDB({
				statementId: statement.statementId,
				cutoffType: CutoffType.topOptions,
				choseByEvaluationType: ChoseByEvaluationType.consensus,
				number: 1,
			});
		}

		return { statementId: statement.statementId, statement };
	} catch (error) {
		console.error(error);

		return undefined;
	}
};

export interface CreateStatementProps {
	text: string;
	description?: string;
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
	membership?: Membership;
	stageSelectionType?: StageSelectionType;
}

export function createStatement({
	text,
	description,
	parentStatement,
	statementType,
	questionType,
	enableAddEvaluationOption = true,
	enableNavigationalElements = true,
	enableAddVotingOption = true,
	enhancedEvaluation = true,
	showEvaluation = true,
	resultsBy = ResultsBy.topOptions,
	numberOfResults = 1,
	hasChildren = true,
	membership,
	stageSelectionType,
}: CreateStatementProps): Statement | undefined {
	try {
		const storeState = store.getState();
		const creator = storeState.creator?.creator;
		console.log("creator", creator.uid);
		if (!creator) throw new Error('Creator is undefined');
		if (!statementType) throw new Error('Statement type is undefined');

		const statementId = getRandomUID();

		const parentId =
			parentStatement !== 'top' ? parentStatement?.statementId : 'top';
		const parentsSet: Set<string> =
			parentStatement !== 'top'
				? new Set(parentStatement?.parents)
				: new Set();
		parentsSet.add(parentId);
		const parents: string[] = [...parentsSet];

		const topParentId =
			parentStatement !== 'top'
				? parentStatement?.topParentId
				: statementId;

		const siblingOptions = getSiblingOptionsByParentId(
			parentId,
			storeState.statements.statements
		);
		const existingColors = getExistingOptionColors(siblingOptions);

		const newStatement: Statement = {
			statement: text,
			description: description ?? '',
			statementType,
			statementId,
			parentId,
			parents,
			topParentId,
			creator,
			creatorId: creator.uid,
			membership: membership || { access: Access.open },
			statementSettings: {
				enhancedEvaluation,
				showEvaluation,
				enableAddEvaluationOption,
				enableAddVotingOption,
				hasChildren,
				enableNavigationalElements,
			},
			createdAt: Timestamp.now().toMillis(),
			lastUpdate: Timestamp.now().toMillis(),
			color: getRandomColor(existingColors),
			resultsSettings: {
				resultsBy: resultsBy || ResultsBy.topOptions,
				numberOfResults: Number(numberOfResults),
			},
			hasChildren,
			consensus: 0,
			evaluation: {
				numberOfEvaluators: 0,
				sumEvaluations: 0,
				agreement: 0,
				evaluationRandomNumber: Math.random(),
				viewed: 0,
			},
			results: [],
		};

		if (newStatement.statementType === StatementType.question) {
			newStatement.questionSettings = {
				questionType: questionType ?? QuestionType.multiStage,
			};

			newStatement.evaluationSettings = {
				evaluationUI: getEvaluationUI(stageSelectionType),
			};
		}

		function getEvaluationUI(
			stageSelectionType?: StageSelectionType
		): EvaluationUI {
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
	} catch (error) {
		console.error(error);

		return undefined;
	}
}

interface UpdateStatementProps {
	text: string;
	description?: string;
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
	description,
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
		if (description) newStatement.description = description;

		newStatement.lastUpdate = Timestamp.now().toMillis();

		if (resultsBy && newStatement.resultsSettings)
			newStatement.resultsSettings.resultsBy = resultsBy;
		else if (resultsBy && !newStatement.resultsSettings) {
			newStatement.resultsSettings = {
				resultsBy: resultsBy,
				numberOfResults: 1,
			};
		}
		if (numberOfResults && newStatement.resultsSettings)
			newStatement.resultsSettings.numberOfResults =
				Number(numberOfResults);
		else if (numberOfResults && !newStatement.resultsSettings) {
			newStatement.resultsSettings = {
				resultsBy: ResultsBy.topOptions,
				numberOfResults: numberOfResults,
			};
		}

		newStatement.statementSettings = updateStatementSettings({
			statement,
			enableAddEvaluationOption,
			enableAddVotingOption,
			enhancedEvaluation,
			showEvaluation,
		});

		newStatement.hasChildren = hasChildren;
		newStatement.membership = membership ||
			statement.membership || { access: Access.open };

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
	try {
		if (!statement) throw new Error('Statement is undefined');
		if (!statement.statementSettings)
			throw new Error('Statement settings is undefined');

		return {
			...statement.statementSettings,
			enhancedEvaluation,
			showEvaluation,
			enableAddEvaluationOption,
			enableAddVotingOption,
		};
	} catch (error) {
		console.error(error);

		return {
			showEvaluation: true,
			enableAddEvaluationOption: true,
			enableAddVotingOption: true,
		};
	}
}

export async function updateStatementText(
	statement: Statement | undefined,
	title?: string,
	description?: string
) {
	try {
		if (!statement) throw new Error('Statement is undefined');

		const updates: Partial<Statement> = {};
		if (title && statement.statement !== title) {
			updates.statement = title;
		}
		if (description && statement.description !== description) {
			updates.description = description;
		}
		if (Object.keys(updates).length === 0) return;

		updates.lastUpdate = Timestamp.now().toMillis();

		parse(StatementSchema, { ...statement, ...updates });
		const statementRef = doc(
			FireStore,
			Collections.statements,
			statement.statementId
		);

		await updateDoc(statementRef, updates);
	} catch (error) {
		console.error(error);
	}
}

export async function setStatementIsOption(statement: Statement | undefined) {
	try {
		if (!statement) throw new Error('Statement is undefined');

		const statementRef = doc(
			FireStore,
			Collections.statements,
			statement.statementId
		);

		//get current statement

		const statementDB = await getDoc(statementRef);

		if (!statementDB.exists()) throw new Error('Statement not found');

		const statementDBData = parse(StatementSchema, statementDB.data());

		await toggleStatementOption(statementDBData);
	} catch (error) {
		console.error(error);
	}

	async function toggleStatementOption(statement: Statement) {
		try {
			const statementRef = doc(
				FireStore,
				Collections.statements,
				statement.statementId
			);

			if (statement.statementType === StatementType.option) {
				await updateDoc(statementRef, {
					statementType: StatementType.statement,
				});
			} else {
				await updateDoc(statementRef, {
					statementType: StatementType.option,
				});
			}
		} catch (error) {
			console.error(error);
		}
	}
}

export async function setStatementGroupToDB(statement: Statement) {
	try {
		const statementId = statement.statementId;
		const statementRef = doc(
			FireStore,
			Collections.statements,
			statementId
		);
		await setDoc(
			statementRef,
			{ statementType: StatementType.statement },
			{ merge: true }
		);
	} catch (error) {
		console.error(error);
	}
}

export function setRoomSizeInStatementDB(
	statement: Statement,
	roomSize: number
) {
	try {
		parse(number(), roomSize);
		parse(StatementSchema, statement);
		const statementRef = doc(
			FireStore,
			Collections.statements,
			statement.statementId
		);
		const newRoomSize = { roomSize };
		updateDoc(statementRef, newRoomSize);
	} catch (error) {
		console.error(error);
	}
}

export async function updateIsQuestion(statement: Statement) {
	try {
		const statementRef = doc(
			FireStore,
			Collections.statements,
			statement.statementId
		);

		let { statementType } = statement;
		if (statementType === StatementType.question)
			statementType = StatementType.statement;
		else {
			statementType = StatementType.question;
		}

		const newStatementType = { statementType };
		await updateDoc(statementRef, newStatementType);
	} catch (error) {
		console.error(error);
	}
}

export async function updateStatementMainImage(
	statement: Statement,
	imageURL: string | undefined
) {
	try {
		if (!imageURL) throw new Error('Image URL is undefined');
		const statementRef = doc(
			FireStore,
			Collections.statements,
			statement.statementId
		);

		await updateDoc(statementRef, {
			imagesURL: { main: imageURL },
		});
	} catch (error) {
		console.error(error);
	}
}

export async function setFollowMeDB(
	statement: Statement,
	path: string | undefined
): Promise<void> {
	try {
		parse(string(), path);
		parse(StatementSchema, statement);

		const statementRef = doc(
			FireStore,
			Collections.statements,
			statement.statementId
		);

		if (path) {
			await updateDoc(statementRef, { followMe: path });
		} else {
			await updateDoc(statementRef, { followMe: '' });
		}
	} catch (error) {
		console.error(error);
	}
}

export async function updateStatementsOrderToDB(statements: Statement[]) {
	try {
		const batch = writeBatch(FireStore);

		for (const statement of statements) {
			parse(StatementSchema, statement);

			const statementRef = doc(
				FireStore,
				Collections.statements,
				statement.statementId
			);

			batch.update(statementRef, { order: statement.order });
		}

		await batch.commit();
	} catch (error) {
		console.error(error);
	}
}
