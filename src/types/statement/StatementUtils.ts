import { Statement, StatementSchema, StatementType, getRandomUID, StageSelectionType, Creator } from 'delib-npm';
import { parse } from 'valibot';

interface CreateBasicStatementProps {
	parentStatement: Statement;
	creator: Creator;
	stageSelectionType?: StageSelectionType;
	statementType?: StatementType;
	statement: string;
	description?: string;
}

export function createBasicStatement({
	parentStatement,
	creator,
	stageSelectionType,
	statementType,
	statement,
	description,
}: CreateBasicStatementProps): Statement | undefined {
	try {
		const newStatement: Statement = {
			statement: statement,
			description: description ?? '',
			statementType: statementType ?? StatementType.statement,
			parentId: parentStatement.statementId,
			stageSelectionType:
				stageSelectionType ?? StageSelectionType.consensus,
			creator,
			creatorId: creator.uid,
			consensus: 0,
			voted: 0,
			statementId: getRandomUID(),
			topParentId:
				parentStatement.topParentId || parentStatement.statementId,
			parents: parentStatement.parents
				? [...parentStatement.parents]
				: [],
			lastUpdate: new Date().getTime(),
			createdAt: new Date().getTime(),
		};

		return parse(StatementSchema, newStatement);
	} catch (error) {
		console.error(error);

		return undefined;
	}
}
