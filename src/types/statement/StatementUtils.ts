import { Statement, StatementSchema } from './Statement';
import { StatementType } from '../TypeEnums';
import { getRandomUID } from '../TypeUtils';
import { StageType } from '../stage/Stage';
import { parse } from 'valibot';
import { User } from '../user/User';

interface CreateBasicStatementProps {
	parentStatement: Statement;
	user: User;
	stageType?: StageType;
	statementType?: StatementType;
	statement: string;
	description?: string;
}

export function createBasicStatement({
	parentStatement,
	user,
	stageType,
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
			stageType: stageType ?? StageType.explanation,
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
