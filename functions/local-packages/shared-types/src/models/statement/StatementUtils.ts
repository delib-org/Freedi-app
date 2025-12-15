import { Statement, StatementSchema } from './StatementTypes';
import { StatementType } from '../TypeEnums';
import { getRandomUID } from '../TypeUtils';
import { StageSelectionType } from '../stage/stageTypes';
import { parse } from 'valibot';
import { User } from '../user/User';
import { Paragraph } from '../paragraph/paragraphModel';

interface CreateBasicStatementProps {
	parentStatement: Statement;
	user: User;
	stageSelectionType?: StageSelectionType;
	statementType?: StatementType;
	statement: string;
	paragraphs?: Paragraph[];
}

export function createBasicStatement({
	parentStatement,
	user,
	stageSelectionType,
	statementType,
	statement,
	paragraphs,
}: CreateBasicStatementProps): Statement | undefined {
	try {
		const newStatement: Statement = {
			statement: statement,
			paragraphs: paragraphs ?? [],
			statementType: statementType ?? StatementType.statement,
			parentId: parentStatement.statementId,
			stageSelectionType: stageSelectionType ?? StageSelectionType.consensus,
			creatorId: user.uid,
			creator: user,
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
